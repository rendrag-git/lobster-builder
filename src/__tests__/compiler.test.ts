import { describe, it, expect } from 'vitest';
import { compile } from '../compiler/compile';
import { compileToYaml } from '../compiler/toYaml';
import type { WorkflowNode, WorkflowEdge, WorkflowMeta } from '../types/graph';

// Import actions to populate registry
import '../actions/init';

const meta: WorkflowMeta = { name: 'test-workflow', description: 'A test' };

function makeNode(id: string, actionId: string, config: Record<string, unknown> = {}): WorkflowNode {
  return {
    id,
    position: { x: 0, y: 0 },
    data: { actionId, config },
    type: 'workflow',
  };
}

function makeEdge(source: string, target: string, sourceHandle = 'output', targetHandle = 'input'): WorkflowEdge {
  return { id: `${source}->${target}-${sourceHandle}`, source, target, sourceHandle, targetHandle };
}

describe('compile()', () => {
  it('returns empty steps for empty graph', () => {
    const result = compile([], [], meta);
    expect(result.steps).toHaveLength(0);
    expect(result.name).toBe('test-workflow');
  });

  it('compiles a single node', () => {
    const nodes = [makeNode('n1', 'run-shell-command', { command: 'echo hello' })];
    const result = compile(nodes, [], meta);
    expect(result.steps).toHaveLength(1);
    expect(result.steps[0].id).toBe('n1');
    expect(result.steps[0].command).toContain('echo hello');
  });

  it('orders steps topologically for linear graph A→B→C', () => {
    const nodes = [
      makeNode('A', 'run-shell-command', { command: 'step A' }),
      makeNode('B', 'run-shell-command', { command: 'step B' }),
      makeNode('C', 'run-shell-command', { command: 'step C' }),
    ];
    const edges = [makeEdge('A', 'B'), makeEdge('B', 'C')];
    const result = compile(nodes, edges, meta);
    const ids = result.steps.map((s) => s.id);
    expect(ids.indexOf('A')).toBeLessThan(ids.indexOf('B'));
    expect(ids.indexOf('B')).toBeLessThan(ids.indexOf('C'));
  });

  it('wires stdin for connected nodes', () => {
    const nodes = [
      makeNode('src', 'prompt-llm', { model: 'sonnet', prompt: 'summarize' }),
      makeNode('dst', 'write-file', { path: '/tmp/out.txt' }),
    ];
    const edges = [makeEdge('src', 'dst')];
    const result = compile(nodes, edges, meta);
    const dst = result.steps.find((s) => s.id === 'dst')!;
    expect(dst.stdin).toBe('$src.stdout');
  });

  it('handles two sources merging into one target', () => {
    const nodes = [
      makeNode('A', 'run-shell-command', { command: 'left' }),
      makeNode('B', 'run-shell-command', { command: 'right' }),
      makeNode('C', 'merge-join', { strategy: 'spread' }),
    ];
    const edges = [makeEdge('A', 'C'), makeEdge('B', 'C')];
    const result = compile(nodes, edges, meta);
    const ids = result.steps.map((s) => s.id);
    expect(ids.indexOf('A')).toBeLessThan(ids.indexOf('C'));
    expect(ids.indexOf('B')).toBeLessThan(ids.indexOf('C'));
  });

  it('skips unknown action ids gracefully', () => {
    const nodes = [makeNode('n1', 'nonexistent-action')];
    const result = compile(nodes, [], meta);
    expect(result.steps).toHaveLength(0);
  });

  it('two-node workflow compiles with outgoingEdges populated', () => {
    const nodes = [
      makeNode('a', 'run-shell-command', { command: 'echo hello' }),
      makeNode('b', 'run-shell-command', { command: 'echo world' }),
    ];
    const edges = [makeEdge('a', 'b', 'output', 'input')];
    const result = compile(nodes, edges, { name: 'test' });
    expect(result.steps).toHaveLength(2);
  });
});

describe('conditional-branch', () => {
  it('generates flow rules from connected true/false ports', () => {
    const nodes = [
      makeNode('branch1', 'conditional-branch', { condition: '$check.json.ok == true' }),
      makeNode('yes', 'run-shell-command', { command: 'echo yes' }),
      makeNode('no', 'run-shell-command', { command: 'echo no' }),
    ];
    const edges = [
      makeEdge('branch1', 'yes', 'true', 'input'),
      makeEdge('branch1', 'no', 'false', 'input'),
    ];
    const result = compile(nodes, edges, { name: 'test' });
    const step = result.steps.find((s) => s.id === 'branch1')!;
    expect(step.command).toBe('exec --shell "true"');
    expect(step.flow).toEqual([
      { when: '$check.json.ok == true', goto: 'yes' },
      { default: 'no' },
    ]);
  });

  it('no flow property when no outgoing edges', () => {
    const nodes = [makeNode('branch1', 'conditional-branch', { condition: 'x' })];
    const result = compile(nodes, [], { name: 'test' });
    expect(result.steps[0].flow).toBeUndefined();
  });

  it('only true-branch flow when only true port connected', () => {
    const nodes = [
      makeNode('branch1', 'conditional-branch', { condition: '$x.json.y == 1' }),
      makeNode('target', 'run-shell-command', { command: 'echo ok' }),
    ];
    const edges = [makeEdge('branch1', 'target', 'true', 'input')];
    const result = compile(nodes, edges, { name: 'test' });
    const step = result.steps.find((s) => s.id === 'branch1')!;
    expect(step.flow).toEqual([
      { when: '$x.json.y == 1', goto: 'target' },
    ]);
  });
});

describe('loop-for-each', () => {
  it('generates while-loop with exit condition and self-reference', () => {
    const nodes = [
      makeNode('loop1', 'loop-for-each', { exitCondition: '$check.json.done == true', maxIterations: 5 }),
      makeNode('after', 'run-shell-command', { command: 'echo done' }),
    ];
    const edges = [makeEdge('loop1', 'after', 'done', 'input')];
    const result = compile(nodes, edges, { name: 'test' });
    const step = result.steps.find((s) => s.id === 'loop1')!;
    expect(step.command).toBe('exec --shell "true"');
    expect(step.max_iterations).toBe(5);
    expect(step.flow).toEqual([
      { when: '$check.json.done == true', goto: 'after' },
      { default: 'loop1' },
    ]);
  });

  it('default: self always present even without exit condition', () => {
    const nodes = [makeNode('loop1', 'loop-for-each', { maxIterations: 3 })];
    const result = compile(nodes, [], { name: 'test' });
    const step = result.steps[0];
    expect(step.flow).toEqual([{ default: 'loop1' }]);
    expect(step.max_iterations).toBe(3);
  });

  it('default max_iterations is 10 when not specified', () => {
    const nodes = [makeNode('loop1', 'loop-for-each', {})];
    const result = compile(nodes, [], { name: 'test' });
    expect(result.steps[0].max_iterations).toBe(10);
  });
});

describe('run-sub-workflow', () => {
  it('generates lobster.run --file command', () => {
    const nodes = [makeNode('sub1', 'run-sub-workflow', { file: 'workflows/child.lobster' })];
    const result = compile(nodes, [], { name: 'test' });
    expect(result.steps[0].command).toBe("lobster.run --file 'workflows/child.lobster'");
  });

  it('generates lobster.run --name command', () => {
    const nodes = [makeNode('sub1', 'run-sub-workflow', { name: 'analyze' })];
    const result = compile(nodes, [], { name: 'test' });
    expect(result.steps[0].command).toBe("lobster.run --name 'analyze'");
  });

  it('includes --args-json flag when argsJson provided', () => {
    const nodes = [makeNode('sub1', 'run-sub-workflow', { name: 'analyze', argsJson: '{"x":1}' })];
    const result = compile(nodes, [], { name: 'test' });
    expect(result.steps[0].command).toBe(`lobster.run --name 'analyze' --args-json '{"x":1}'`);
  });

  it('file takes precedence over name when both provided', () => {
    const nodes = [makeNode('sub1', 'run-sub-workflow', { file: 'w/a.lobster', name: 'ignored' })];
    const result = compile(nodes, [], { name: 'test' });
    expect(result.steps[0].command).toContain("--file 'w/a.lobster'");
    expect(result.steps[0].command).not.toContain('--name');
  });
});

describe('compileToYaml()', () => {
  it('produces valid YAML string with name and steps', () => {
    const nodes = [makeNode('n1', 'run-shell-command', { command: 'echo hi' })];
    const yaml = compileToYaml(nodes, [], meta);
    expect(typeof yaml).toBe('string');
    expect(yaml).toContain('name: test-workflow');
    expect(yaml).toContain('steps:');
    expect(yaml).toContain('echo hi');
  });
});
