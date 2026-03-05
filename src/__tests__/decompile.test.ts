import { describe, it, expect } from 'vitest';
import { decompileWorkflow } from '../compiler/decompile';
import type { WorkflowNodeData } from '../types/graph';

describe('decompiler', () => {
  it('converts a simple workflow to canvas nodes', () => {
    const workflow = {
      name: 'test',
      steps: [
        { id: 'step1', command: 'echo hello' },
      ],
    };
    const { nodes, meta } = decompileWorkflow(workflow);
    expect(nodes).toHaveLength(1);
    expect(nodes[0].data.actionId).toBe('run-shell-command');
    expect(meta.name).toBe('test');
  });

  it('creates edges from stdin references', () => {
    const workflow = {
      name: 'piped',
      steps: [
        { id: 'a', command: 'echo hello' },
        { id: 'b', command: 'cat', stdin: '$a.stdout' },
      ],
    };
    const { nodes, edges } = decompileWorkflow(workflow);
    expect(nodes).toHaveLength(2);
    expect(edges).toHaveLength(1);
    expect(edges[0].source).toBe('a');
    expect(edges[0].target).toBe('b');
  });

  it('recognizes approval steps', () => {
    const workflow = {
      name: 'approval-test',
      steps: [
        { id: 'review', command: 'cat report.json', approval: 'required' as const },
      ],
    };
    const { nodes } = decompileWorkflow(workflow);
    expect(nodes[0].data.actionId).toBe('require-approval');
  });

  it('falls back to run-shell-command for unknown patterns', () => {
    const workflow = {
      name: 'unknown',
      steps: [
        { id: 'weird', command: 'some-custom-binary --flag' },
      ],
    };
    const { nodes } = decompileWorkflow(workflow);
    expect(nodes[0].data.actionId).toBe('run-shell-command');
    expect((nodes[0].data as WorkflowNodeData).config.command).toBe('some-custom-binary --flag');
  });
});
