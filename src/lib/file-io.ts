import { parse } from 'yaml';
import { compileToYaml } from '../compiler/toYaml';
import { decompileWorkflow } from '../compiler/decompile';
import type { WorkflowNode, WorkflowEdge, WorkflowMeta } from '../types/graph';

interface BuilderState {
  version: 1;
  meta: WorkflowMeta;
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
}

/** Compile nodes+edges to YAML string (pure, testable) */
export function exportWorkflow(
  nodes: WorkflowNode[],
  edges: WorkflowEdge[],
  meta: WorkflowMeta,
): string {
  return compileToYaml(nodes, edges, meta);
}

/** Serialize full builder state to JSON string (pure, testable) */
export function exportBuilderState(
  nodes: WorkflowNode[],
  edges: WorkflowEdge[],
  meta: WorkflowMeta,
): string {
  const state: BuilderState = { version: 1, meta, nodes, edges };
  return JSON.stringify(state, null, 2);
}

/** Parse import content back to nodes/edges/meta */
export function parseImport(
  content: string,
  filename: string,
): { nodes: WorkflowNode[]; edges: WorkflowEdge[]; meta: WorkflowMeta } {
  if (filename.endsWith('.json')) {
    const state = JSON.parse(content) as BuilderState;
    return { nodes: state.nodes, edges: state.edges, meta: state.meta };
  }
  // YAML / .lobster file — decompile to canvas nodes
  const workflow = parse(content);
  const result = decompileWorkflow(workflow);
  return {
    nodes: result.nodes as WorkflowNode[],
    edges: result.edges as WorkflowEdge[],
    meta: result.meta,
  };
}

/** Trigger browser file download */
export function downloadFile(content: string, filename: string, mimeType = 'text/plain'): void {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/** Download compiled .lobster YAML */
export function downloadWorkflow(
  nodes: WorkflowNode[],
  edges: WorkflowEdge[],
  meta: WorkflowMeta,
): void {
  const yaml = exportWorkflow(nodes, edges, meta);
  const safeFilename = (meta.name || 'workflow').replace(/[^a-z0-9-_]/gi, '-').toLowerCase();
  downloadFile(yaml, `${safeFilename}.lobster`, 'text/yaml');
}

/** Download full builder state as JSON */
export function downloadBuilderState(
  nodes: WorkflowNode[],
  edges: WorkflowEdge[],
  meta: WorkflowMeta,
): void {
  const json = exportBuilderState(nodes, edges, meta);
  const safeFilename = (meta.name || 'workflow').replace(/[^a-z0-9-_]/gi, '-').toLowerCase();
  downloadFile(json, `${safeFilename}.lobster-builder.json`, 'application/json');
}

/** Open a file picker and call callback with parsed result */
export function importFromFile(
  callback: (result: { nodes: WorkflowNode[]; edges: WorkflowEdge[]; meta: WorkflowMeta }) => void,
): void {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.lobster,.yaml,.yml,.json';
  input.onchange = (e) => {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const content = ev.target?.result as string;
      try {
        const result = parseImport(content, file.name);
        callback(result);
      } catch (err) {
        console.error('Failed to import file:', err);
        alert(`Import failed: ${err instanceof Error ? err.message : String(err)}`);
      }
    };
    reader.readAsText(file);
  };
  document.body.appendChild(input);
  input.click();
  document.body.removeChild(input);
}
