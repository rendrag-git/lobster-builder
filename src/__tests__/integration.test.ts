/**
 * Integration tests — end-to-end flow through the builder's data pipeline.
 *
 * Covers: node creation → edge wiring → compile → YAML export → import → round-trip.
 */

import { describe, it, expect } from 'vitest';
import { compile } from '../compiler/compile';
import { compileToYaml } from '../compiler/toYaml';
import { decompileWorkflow } from '../compiler/decompile';
import { exportWorkflow, exportBuilderState, parseImport } from '../lib/file-io';
import '../actions/init';
import type { WorkflowNode, WorkflowEdge, WorkflowMeta } from '../types/graph';

// ─── helpers ────────────────────────────────────────────────────────────────

function node(id: string, actionId: string, config: Record<string, unknown> = {}, y = 0): WorkflowNode {
  return { id, type: 'workflowNode', position: { x: 0, y }, data: { actionId, config } };
}

function edge(source: string, target: string): WorkflowEdge {
  return { id: `${source}->${target}`, source, target, sourceHandle: 'output', targetHandle: 'input' };
}

const meta: WorkflowMeta = { name: 'integration-test', description: 'E2E test workflow' };

// ─── compile → YAML → import round-trip ─────────────────────────────────────

describe('end-to-end: compile → YAML → import round-trip', () => {
  it('single node: YAML contains name and command; import recovers node', () => {
    const nodes = [node('n1', 'run-shell-command', { command: 'echo hello' })];

    const yaml = compileToYaml(nodes, [], meta);
    expect(yaml).toContain('name: integration-test');
    expect(yaml).toContain('echo hello');

    const imported = parseImport(yaml, 'test.lobster');
    expect(imported.nodes).toHaveLength(1);
    expect(imported.nodes[0].data.actionId).toBe('run-shell-command');
    expect(imported.meta.name).toBe('integration-test');
  });

  it('two connected nodes: stdin wiring appears in compiled output', () => {
    const nodes = [
      node('search', 'web-search', { query: 'Lobster engine', count: 5 }, 0),
      node('summarise', 'prompt-llm', { model: 'sonnet', prompt: 'summarise results' }, 150),
    ];
    const edges = [edge('search', 'summarise')];

    const workflow = compile(nodes, edges, meta);
    const summariseStep = workflow.steps.find((s) => s.id === 'summarise');
    expect(summariseStep?.stdin).toBe('$search.stdout');
  });

  it('builder-state JSON import preserves nodes and edges', () => {
    const nodes = [
      node('search', 'web-search', { query: 'Lobster engine', count: 5 }, 0),
      node('summarise', 'prompt-llm', { model: 'sonnet', prompt: 'summarise results' }, 150),
    ];
    const edges = [edge('search', 'summarise')];

    const json = exportBuilderState(nodes, edges, meta);
    const imported = parseImport(json, 'test.lobster-builder.json');
    expect(imported.nodes).toHaveLength(2);
    expect(imported.edges).toHaveLength(1);
    expect(imported.edges[0].source).toBe('search');
    expect(imported.edges[0].target).toBe('summarise');
  });

  it('four-node pipeline: topological order is preserved', () => {
    const nodes = [
      node('fetch', 'web-fetch', { url: 'https://example.com', mode: 'markdown' }, 0),
      node('analyse', 'prompt-llm', { model: 'haiku', prompt: 'extract key points' }, 150),
      node('save', 'write-file', { path: '/tmp/report.txt' }, 300),
      node('notify', 'send-notification', { target: 'team', message: 'done' }, 450),
    ];
    const edges = [
      edge('fetch', 'analyse'),
      edge('analyse', 'save'),
      edge('save', 'notify'),
    ];

    const workflow = compile(nodes, edges, meta);
    const ids = workflow.steps.map((s) => s.id);

    expect(ids.indexOf('fetch')).toBeLessThan(ids.indexOf('analyse'));
    expect(ids.indexOf('analyse')).toBeLessThan(ids.indexOf('save'));
    expect(ids.indexOf('save')).toBeLessThan(ids.indexOf('notify'));

    // stdin chain
    expect(workflow.steps.find((s) => s.id === 'analyse')?.stdin).toBe('$fetch.stdout');
    expect(workflow.steps.find((s) => s.id === 'save')?.stdin).toBe('$analyse.stdout');
  });
});

// ─── compile → decompile round-trip ─────────────────────────────────────────

describe('compile → decompile round-trip', () => {
  it('recovers node count and edges for a two-node workflow', () => {
    const nodes = [
      node('a', 'run-shell-command', { command: 'ls -la' }, 0),
      node('b', 'write-file', { path: '/tmp/ls.txt' }, 150),
    ];
    const edges = [edge('a', 'b')];

    const workflow = compile(nodes, edges, meta);
    const { nodes: dnodes, edges: dedges } = decompileWorkflow(workflow);

    expect(dnodes).toHaveLength(2);
    expect(dedges).toHaveLength(1);
    expect(dedges[0].source).toBe('a');
    expect(dedges[0].target).toBe('b');
  });

  it('decompile recognises approval step from approval field', () => {
    // Feed the decompiler a raw lobster workflow with approval: required
    const workflow = {
      name: 'gate',
      steps: [{ id: 'gate', command: 'openclaw flow approval --message review', approval: 'required' as const }],
    };
    const { nodes: dnodes } = decompileWorkflow(workflow);
    expect(dnodes[0].data.actionId).toBe('require-approval');
  });

  it('decompile falls back to run-shell-command for unknown commands', () => {
    const workflow = {
      name: 'fallback',
      steps: [{ id: 'x', command: 'custom-tool --flag value' }],
    };
    const { nodes: dnodes } = decompileWorkflow(workflow);
    expect(dnodes[0].data.actionId).toBe('run-shell-command');
  });
});

// ─── builder-state JSON export/import ───────────────────────────────────────

describe('builder-state JSON export/import', () => {
  it('preserves workflow metadata', () => {
    const richMeta: WorkflowMeta = { name: 'my-pipeline', description: 'test description' };
    const json = exportBuilderState([], [], richMeta);
    const imported = parseImport(json, 'test.lobster-builder.json');
    expect(imported.meta.name).toBe('my-pipeline');
    expect(imported.meta.description).toBe('test description');
  });

  it('preserves node configs after round-trip', () => {
    const nodes = [node('llm', 'prompt-llm', { model: 'opus', prompt: 'write a haiku' })];
    const json = exportBuilderState(nodes, [], meta);
    const imported = parseImport(json, 'test.lobster-builder.json');
    const llmNode = imported.nodes.find((n) => n.id === 'llm');
    expect(llmNode?.data.config.model).toBe('opus');
    expect(llmNode?.data.config.prompt).toBe('write a haiku');
  });

  it('version field is 1', () => {
    const json = exportBuilderState([], [], meta);
    const parsed = JSON.parse(json);
    expect(parsed.version).toBe(1);
  });
});

// ─── YAML export ────────────────────────────────────────────────────────────

describe('YAML export', () => {
  it('exportWorkflow produces a YAML string with name and steps', () => {
    const nodes = [node('step1', 'run-shell-command', { command: 'echo integration' })];
    const yaml = exportWorkflow(nodes, [], meta);
    expect(typeof yaml).toBe('string');
    expect(yaml).toContain('name: integration-test');
    expect(yaml).toContain('echo integration');
  });

  it('multi-step YAML contains all step ids', () => {
    const nodes = [
      node('alpha', 'web-search', { query: 'test', count: 1 }),
      node('beta', 'prompt-llm', { model: 'haiku', prompt: 'go' }),
    ];
    const yaml = exportWorkflow(nodes, [edge('alpha', 'beta')], meta);
    expect(yaml).toContain('id: alpha');
    expect(yaml).toContain('id: beta');
  });
});

// ─── action catalog sanity ───────────────────────────────────────────────────

import { getAllActions } from '../actions/registry';

describe('action catalog completeness', () => {
  it('all registered actions compile without throwing and return steps', () => {
    const all = getAllActions();
    expect(all.length).toBeGreaterThanOrEqual(20);
    for (const action of all) {
      const steps = action.compile(action.defaults, { nodeId: 'test', incomingEdges: [], outgoingEdges: [] });
      expect(Array.isArray(steps)).toBe(true);
    }
  });
});
