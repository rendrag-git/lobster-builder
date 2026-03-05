import type { Node, Edge } from '@xyflow/react';
import type { LobsterWorkflowFile, LobsterStep } from '../types/lobster';
import type { WorkflowMeta } from '../types/graph';

interface DecompileResult {
  nodes: Node[];
  edges: Edge[];
  meta: WorkflowMeta;
}

export function decompileWorkflow(workflow: LobsterWorkflowFile): DecompileResult {
  const nodes: Node[] = [];
  const edges: Edge[] = [];

  for (let i = 0; i < workflow.steps.length; i++) {
    const step = workflow.steps[i];
    const { actionId, config } = matchStepToAction(step);

    nodes.push({
      id: step.id,
      type: 'action',
      position: { x: 250, y: i * 150 },
      data: { actionId, config },
    });

    if (step.stdin && typeof step.stdin === 'string') {
      const match = step.stdin.match(/^\$([A-Za-z0-9_-]+)\.(stdout|json)$/);
      if (match) {
        edges.push({
          id: `e-${match[1]}-${step.id}`,
          source: match[1],
          sourceHandle: 'output',
          target: step.id,
          targetHandle: 'input',
        });
      }
    }
  }

  return {
    nodes,
    edges,
    meta: {
      name: workflow.name ?? 'imported-workflow',
      description: workflow.description ?? '',
      args: workflow.args,
      env: workflow.env,
      cwd: workflow.cwd,
    },
  };
}

function matchStepToAction(step: LobsterStep): { actionId: string; config: Record<string, unknown> } {
  const cmd = step.command ?? '';

  if (step.approval === true || step.approval === 'required') {
    return { actionId: 'require-approval', config: { message: cmd } };
  }
  if (cmd.startsWith('openclaw agent invoke')) {
    const nameMatch = cmd.match(/--name\s+(\S+)/);
    const taskMatch = cmd.match(/--task\s+'([^']+)'/);
    return { actionId: 'call-agent', config: { agent: nameMatch?.[1] ?? '', task: taskMatch?.[1] ?? '' } };
  }
  if (cmd.startsWith('openclaw llm')) {
    const modelMatch = cmd.match(/--model\s+(\S+)/);
    const promptMatch = cmd.match(/--prompt\s+'([^']+)'/);
    return { actionId: 'prompt-llm', config: { model: modelMatch?.[1] ?? 'sonnet', prompt: promptMatch?.[1] ?? '' } };
  }
  if (cmd.startsWith('openclaw search')) {
    const queryMatch = cmd.match(/--query\s+'([^']+)'/);
    return { actionId: 'web-search', config: { query: queryMatch?.[1] ?? '', count: 5 } };
  }
  if (cmd.startsWith('openclaw fetch')) {
    const urlMatch = cmd.match(/--url\s+'([^']+)'/);
    return { actionId: 'web-fetch', config: { url: urlMatch?.[1] ?? '', mode: 'markdown' } };
  }
  if (cmd.startsWith('openclaw http')) {
    const methodMatch = cmd.match(/--method\s+(\S+)/);
    const urlMatch = cmd.match(/--url\s+'([^']+)'/);
    return { actionId: 'http-request', config: { method: methodMatch?.[1] ?? 'GET', url: urlMatch?.[1] ?? '', headers: '', body: '' } };
  }
  if (cmd.startsWith('openclaw flow wait')) {
    const durationMatch = cmd.match(/--duration\s+(\d+)/);
    const unitMatch = cmd.match(/--unit\s+(\S+)/);
    return { actionId: 'delay-wait', config: { duration: parseInt(durationMatch?.[1] ?? '5'), unit: unitMatch?.[1] ?? 'seconds' } };
  }
  if (cmd.startsWith('openclaw flow branch')) {
    const condMatch = cmd.match(/--condition\s+'([^']+)'/);
    return { actionId: 'conditional-branch', config: { condition: condMatch?.[1] ?? '' } };
  }
  if (cmd.startsWith('openclaw file read')) {
    const pathMatch = cmd.match(/--path\s+'([^']+)'/);
    return { actionId: 'read-file', config: { path: pathMatch?.[1] ?? '' } };
  }
  if (cmd.startsWith('openclaw file write')) {
    const pathMatch = cmd.match(/--path\s+'([^']+)'/);
    return { actionId: 'write-file', config: { path: pathMatch?.[1] ?? '' } };
  }
  if (cmd.startsWith('openclaw workflow run')) {
    const fileMatch = cmd.match(/--file\s+'([^']+)'/);
    return { actionId: 'run-sub-workflow', config: { file: fileMatch?.[1] ?? '' } };
  }
  if (cmd.startsWith('openclaw data set')) {
    const nameMatch = cmd.match(/--name\s+'([^']+)'/);
    const valueMatch = cmd.match(/--value\s+'([^']+)'/);
    return { actionId: 'set-variable', config: { name: nameMatch?.[1] ?? '', value: valueMatch?.[1] ?? '' } };
  }

  // Fallback
  return { actionId: 'run-shell-command', config: { command: cmd } };
}
