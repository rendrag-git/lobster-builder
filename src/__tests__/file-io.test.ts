import { describe, it, expect } from 'vitest';
import { exportWorkflow, exportBuilderState, parseImport } from '../lib/file-io';
import '../actions/init';
import type { WorkflowNode, WorkflowEdge, WorkflowMeta } from '../types/graph';

const mockNodes: WorkflowNode[] = [
  {
    id: 'n1',
    type: 'workflowNode',
    position: { x: 0, y: 0 },
    data: { actionId: 'run-shell-command', config: { command: 'echo hello' } },
  },
];

const mockEdges: WorkflowEdge[] = [];

const mockMeta: WorkflowMeta = {
  name: 'test-workflow',
  description: 'A test workflow',
};

describe('file I/O', () => {
  it('exportWorkflow returns valid YAML string', () => {
    const yaml = exportWorkflow(mockNodes, mockEdges, mockMeta);
    expect(yaml).toContain('name:');
    expect(yaml).toContain('steps:');
    expect(yaml).toContain('test-workflow');
  });

  it('exportBuilderState returns JSON with version and nodes', () => {
    const json = exportBuilderState(mockNodes, mockEdges, mockMeta);
    const parsed = JSON.parse(json);
    expect(parsed.version).toBe(1);
    expect(Array.isArray(parsed.nodes)).toBe(true);
    expect(Array.isArray(parsed.edges)).toBe(true);
    expect(parsed.meta.name).toBe('test-workflow');
  });

  it('parseImport round-trips builder state JSON', () => {
    const json = exportBuilderState(mockNodes, mockEdges, mockMeta);
    const result = parseImport(json, 'workflow.lobster-builder.json');
    expect(result.meta.name).toBe('test-workflow');
    expect(result.nodes).toHaveLength(1);
    expect(result.nodes[0].id).toBe('n1');
  });

  it('parseImport loads a YAML .lobster file', () => {
    const yaml = exportWorkflow(mockNodes, mockEdges, mockMeta);
    const result = parseImport(yaml, 'workflow.lobster');
    expect(result.meta.name).toBe('test-workflow');
    expect(result.nodes).toHaveLength(1);
    expect(result.nodes[0].data.actionId).toBe('run-shell-command');
  });

  it('exportWorkflow produces steps with correct command', () => {
    const yaml = exportWorkflow(mockNodes, mockEdges, mockMeta);
    expect(yaml).toContain('echo hello');
  });

  it('round-trip preserves multiple connected nodes', () => {
    const nodes: WorkflowNode[] = [
      {
        id: 'a',
        type: 'workflowNode',
        position: { x: 0, y: 0 },
        data: { actionId: 'web-search', config: { query: 'test query', count: 3 } },
      },
      {
        id: 'b',
        type: 'workflowNode',
        position: { x: 250, y: 0 },
        data: { actionId: 'prompt-llm', config: { model: 'sonnet', prompt: 'summarize' } },
      },
    ];
    const edges: WorkflowEdge[] = [
      { id: 'e1', source: 'a', sourceHandle: 'output', target: 'b', targetHandle: 'input' },
    ];
    const json = exportBuilderState(nodes, edges, { name: 'multi-node', description: '' });
    const result = parseImport(json, 'workflow.lobster-builder.json');
    expect(result.nodes).toHaveLength(2);
    expect(result.edges).toHaveLength(1);
    expect(result.edges[0].source).toBe('a');
    expect(result.edges[0].target).toBe('b');
  });
});
