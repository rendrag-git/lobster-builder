import { getAction } from '../actions/registry';
import type { WorkflowNode, WorkflowEdge, WorkflowMeta } from '../types/graph';
import type { LobsterWorkflowFile, LobsterStep, OpenClawWorkflowMetadata } from '../types/lobster';

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
  const openclaw = compileOpenClawMetadata(meta);
  const parallelBundleStep = compileParallelBundleStep(meta);

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

    const outgoingEdges = edges
      .filter((e) => e.source === node.id)
      .map((e) => ({
        targetNodeId: e.target,
        sourcePortId: e.sourceHandle ?? 'output',
        targetPortId: e.targetHandle ?? 'input',
      }));

    const ctx = { nodeId: node.id, incomingEdges, outgoingEdges };
    const produced = action.compile(node.data.config, ctx);
    steps.push(...produced);
  }

  if (parallelBundleStep) {
    steps.unshift(parallelBundleStep);
  }

  return {
    name: meta.name,
    ...(meta.description ? { description: meta.description } : {}),
    ...(meta.args ? { args: meta.args } : {}),
    ...(meta.env ? { env: meta.env } : {}),
    ...(meta.cwd ? { cwd: meta.cwd } : {}),
    ...(openclaw ? { openclaw } : {}),
    steps,
  };
}

function quotePipelineArg(value: string): string {
  return `'${value.replaceAll("'", "'\\''")}'`;
}

function readPublishedWorkflowRef(ref: string): { workflowId: string; workflowRevision?: number } | null {
  const trimmed = ref.trim();
  if (!trimmed) return null;
  const revisionSep = trimmed.lastIndexOf('@');
  if (revisionSep <= 0 || revisionSep === trimmed.length - 1) {
    return { workflowId: trimmed };
  }

  const revision = Number(trimmed.slice(revisionSep + 1));
  if (!Number.isInteger(revision) || revision < 1) {
    return { workflowId: trimmed };
  }
  return {
    workflowId: trimmed.slice(0, revisionSep),
    workflowRevision: revision,
  };
}

function sanitizeBranchId(value: string, index: number): string {
  const normalized = value.trim().replace(/[^A-Za-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '');
  return normalized || `branch-${index + 1}`;
}

function uniqueBranchId(base: string, used: Set<string>): string {
  let candidate = base;
  let suffix = 2;
  while (used.has(candidate)) {
    candidate = `${base}-${suffix}`;
    suffix += 1;
  }
  used.add(candidate);
  return candidate;
}

function compileParallelBundleStep(meta: WorkflowMeta): LobsterStep | null {
  if (meta.bundle?.mode !== 'parallel') return null;
  const refs = meta.bundle.workflowRefs?.map((ref) => ref.trim()).filter(Boolean) ?? [];
  if (refs.length === 0) return null;

  const usedIds = new Set<string>();
  const branches = refs.flatMap((ref, index) => {
    const parsed = readPublishedWorkflowRef(ref);
    if (!parsed) return [];
    const id = uniqueBranchId(sanitizeBranchId(parsed.workflowId, index), usedIds);
    const pipelineParts = ['lobster.workflow', '--workflow-id', quotePipelineArg(parsed.workflowId)];
    if (parsed.workflowRevision !== undefined) {
      pipelineParts.push('--workflow-revision', quotePipelineArg(String(parsed.workflowRevision)));
    }
    return [{
      id,
      ref,
      workflowId: parsed.workflowId,
      ...(parsed.workflowRevision !== undefined ? { workflowRevision: parsed.workflowRevision } : {}),
      pipeline: pipelineParts.join(' '),
    }];
  });
  if (branches.length === 0) return null;

  return {
    id: 'openclaw_parallel_bundle',
    pipeline: `lobster.parallel --branches-json ${quotePipelineArg(JSON.stringify(branches))}`,
    openclaw_parallel_bundle: {
      wait: 'all',
      branches,
    },
  };
}

function compactRecord<T extends object>(value: T): Partial<T> | null {
  const entries = Object.entries(value as Record<string, unknown>).filter(([, v]) => {
    if (v === undefined || v === null) return false;
    if (typeof v === 'string') return v.trim().length > 0;
    if (Array.isArray(v)) return v.length > 0;
    return true;
  });
  return entries.length > 0 ? Object.fromEntries(entries) as Partial<T> : null;
}

function compileOpenClawMetadata(meta: WorkflowMeta): OpenClawWorkflowMetadata | null {
  const gateway = meta.gateway ? compactRecord(meta.gateway) : null;
  const schedule = meta.schedule ? compactRecord(meta.schedule) : null;
  const bundle = meta.bundle ? compactRecord(meta.bundle) : null;

  if (!gateway && !schedule && !bundle) return null;

  return {
    version: 1,
    ...(gateway ? { gateway } : {}),
    ...(schedule ? { schedule } : {}),
    ...(bundle ? { bundle } : {}),
  };
}
