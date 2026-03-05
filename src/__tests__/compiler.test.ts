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

function makeEdge(source: string, target: string): WorkflowEdge {
  return { id: `${source}->${target}`, source, target, sourceHandle: 'output', targetHandle: 'input' };
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
