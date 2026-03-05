import { registerAction } from '../registry';
import type { ActionDefinition } from '../../types/actions';

const runSubWorkflow: ActionDefinition = {
  id: 'run-sub-workflow',
  name: 'Run Sub-Workflow',
  category: 'meta',
  icon: 'workflow',
  description: 'Execute another Lobster workflow file as a sub-process',
  inputs: [{ id: 'input', label: 'Input', kind: 'any' }],
  outputs: [{ id: 'output', label: 'Result', kind: 'any' }],
  configFields: [
    { id: 'file', label: 'Workflow File', type: 'text', required: true, placeholder: 'workflows/my-workflow.lobster' },
    { id: 'passInput', label: 'Pass Input', type: 'boolean' },
  ],
  defaults: { file: '', passInput: true },
  compile: (config, ctx) => {
    const step: any = {
      id: ctx.nodeId,
      command: `openclaw workflow run --file '${config.file}'`,
    };
    if (ctx.incomingEdges.length > 0 && config.passInput !== false) {
      step.stdin = `$${ctx.incomingEdges[0].sourceNodeId}.stdout`;
    }
    return [step];
  },
};

registerAction(runSubWorkflow);
