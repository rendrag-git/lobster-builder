import { stringify } from 'yaml';
import { compile } from './compile';
import type { WorkflowNode, WorkflowEdge, WorkflowMeta } from '../types/graph';

export function compileToYaml(
  nodes: WorkflowNode[],
  edges: WorkflowEdge[],
  meta: WorkflowMeta,
): string {
  const workflow = compile(nodes, edges, meta);
  return stringify(workflow);
}
