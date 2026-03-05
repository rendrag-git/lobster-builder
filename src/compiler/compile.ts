import { getAction } from '../actions/registry';
import type { WorkflowNode, WorkflowEdge, WorkflowMeta } from '../types/graph';
import type { LobsterWorkflowFile, LobsterStep } from '../types/lobster';

function topoSort(nodes: WorkflowNode[], edges: WorkflowEdge[]): WorkflowNode[] {
  const nodeMap = new Map(nodes.map((n) => [n.id, n]));
  const inDegree = new Map<string, number>(nodes.map((n) => [n.id, 0]));
  const adj = new Map<string, string[]>(nodes.map((n) => [n.id, []]));

  for (const edge of edges) {
    adj.get(edge.source)?.push(edge.target);
    inDegree.set(edge.target, (inDegree.get(edge.target) ?? 0) + 1);
  }

  const queue = nodes.filter((n) => (inDegree.get(n.id) ?? 0) === 0).map((n) => n.id);
  const sorted: WorkflowNode[] = [];

  while (queue.length > 0) {
    const id = queue.shift()!;
    const node = nodeMap.get(id);
    if (node) sorted.push(node);
    for (const next of adj.get(id) ?? []) {
      const deg = (inDegree.get(next) ?? 1) - 1;
      inDegree.set(next, deg);
      if (deg === 0) queue.push(next);
    }
  }

  return sorted;
}

export function compile(
  nodes: WorkflowNode[],
  edges: WorkflowEdge[],
  meta: WorkflowMeta,
): LobsterWorkflowFile {
  const sorted = topoSort(nodes, edges);
  const steps: LobsterStep[] = [];

  for (const node of sorted) {
    const action = getAction(node.data.actionId);
    if (!action) continue;

    const incomingEdges = edges
      .filter((e) => e.target === node.id)
      .map((e) => ({
        sourceNodeId: e.source,
        sourcePortId: e.sourceHandle ?? 'output',
        targetPortId: e.targetHandle ?? 'input',
      }));

    const ctx = { nodeId: node.id, incomingEdges };
    const produced = action.compile(node.data.config, ctx);
    steps.push(...produced);
  }

  return {
    name: meta.name,
    ...(meta.description ? { description: meta.description } : {}),
    ...(meta.args ? { args: meta.args } : {}),
    ...(meta.env ? { env: meta.env } : {}),
    ...(meta.cwd ? { cwd: meta.cwd } : {}),
    steps,
  };
}
