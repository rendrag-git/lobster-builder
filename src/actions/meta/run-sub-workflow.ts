import { registerAction } from '../registry';
import type { ActionDefinition } from '../../types/actions';
import type { LobsterStep } from '../../types/lobster';

function readWorkflowArgs(value: unknown): Record<string, unknown> | undefined {
  if (typeof value !== 'string' || !value.trim()) return undefined;
  const parsed = JSON.parse(value) as unknown;
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('workflow_args must be a JSON object');
  }
  return parsed as Record<string, unknown>;
}

function quotePipelineArg(value: string): string {
  return `'${value.replaceAll("'", "'\\''")}'`;
}

function readTarget(config: Record<string, unknown>): 'file' | 'published' {
  if (config.target === 'file') return 'file';
  if (config.target === 'published') return 'published';
  return config.workflowId ? 'published' : 'file';
}

function readWorkflowRevision(value: unknown): number | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  const revision = typeof value === 'number' ? value : Number(value);
  if (!Number.isInteger(revision) || revision < 1) {
    throw new Error('Workflow Revision must be a positive integer');
  }
  return revision;
}

const runSubWorkflow: ActionDefinition = {
  id: 'run-sub-workflow',
  name: 'Run Sub-Workflow',
  category: 'meta',
  icon: 'workflow',
  description: 'Execute another published or file-based Lobster workflow',
  requiredTools: ['lobster'],
  inputs: [{ id: 'input', label: 'Input', kind: 'any' }],
  outputs: [{ id: 'output', label: 'Result', kind: 'any' }],
  configFields: [
    {
      id: 'target',
      label: 'Target',
      type: 'select',
      options: [
        { label: 'Published workflow', value: 'published' },
        { label: 'Workflow file', value: 'file' },
      ],
    },
    { id: 'workflowId', label: 'Published Flow ID', type: 'text', placeholder: 'daily-support-child' },
    { id: 'workflowRevision', label: 'Revision', type: 'number', placeholder: 'latest' },
    { id: 'file', label: 'Workflow File', type: 'text', placeholder: 'workflows/my-workflow.lobster' },
    { id: 'argsJson', label: 'Workflow Args JSON', type: 'code', placeholder: '{"customerId":"$lookup.json.id"}' },
    { id: 'passInput', label: 'Pass Input', type: 'boolean' },
  ],
  defaults: { target: 'published', workflowId: 'child-workflow', workflowRevision: undefined, file: '', argsJson: '', passInput: true },
  compile: (config, ctx) => {
    const target = readTarget(config);
    const workflowArgs = readWorkflowArgs(config.argsJson);
    const workflowRevision = readWorkflowRevision(config.workflowRevision);
    const workflowId = String(config.workflowId ?? '').trim();
    const file = String(config.file ?? '').trim();
    const targetValue = target === 'published' ? workflowId : file;
    if (!targetValue) {
      throw new Error(target === 'published' ? 'Published Flow ID is required' : 'Workflow File is required');
    }

    const pipelineParts = ['lobster.workflow'];
    if (target === 'published') {
      pipelineParts.push('--workflow-id', quotePipelineArg(workflowId));
      if (workflowRevision !== undefined) {
        pipelineParts.push('--workflow-revision', quotePipelineArg(String(workflowRevision)));
      }
    } else {
      pipelineParts.push('--file', quotePipelineArg(file));
    }
    if (workflowArgs) {
      pipelineParts.push('--args-json', quotePipelineArg(JSON.stringify(workflowArgs)));
    }
    if (ctx.incomingEdges.length > 0 && config.passInput !== false) {
      pipelineParts.push('--input-key', quotePipelineArg('input'));
    }

    const step: LobsterStep = {
      id: ctx.nodeId,
      pipeline: pipelineParts.join(' '),
      openclaw_workflow_ref: {
        target,
        ...(target === 'published' ? { workflowId } : { file }),
        ...(workflowRevision !== undefined ? { workflowRevision } : {}),
        ...(workflowArgs ? { args: workflowArgs } : {}),
        ...(ctx.incomingEdges.length > 0 && config.passInput !== false ? { inputKey: 'input' } : {}),
      },
    };
    if (ctx.incomingEdges.length > 0 && config.passInput !== false) {
      step.stdin = `$${ctx.incomingEdges[0].sourceNodeId}.stdout`;
    }
    return [step];
  },
};

registerAction(runSubWorkflow);
