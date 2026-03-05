import { registerAction } from '../registry';
import type { ActionDefinition } from '../../types/actions';

const errorHandler: ActionDefinition = {
  id: 'error-handler',
  name: 'Error Handler',
  category: 'flow',
  icon: 'alert-triangle',
  description: 'Catch and handle errors from upstream steps',
  inputs: [{ id: 'input', label: 'Watch Step', kind: 'any' }],
  outputs: [
    { id: 'error', label: 'Error', kind: 'text' },
    { id: 'success', label: 'Success', kind: 'any' },
  ],
  configFields: [
    {
      id: 'action', label: 'On Error', type: 'select',
      options: [
        { label: 'Continue', value: 'continue' },
        { label: 'Retry', value: 'retry' },
        { label: 'Abort', value: 'abort' },
      ],
    },
    { id: 'retries', label: 'Max Retries', type: 'number' },
  ],
  defaults: { action: 'continue', retries: 3 },
  compile: (config, ctx) => [{
    id: ctx.nodeId,
    command: `openclaw flow on-error --action ${config.action ?? 'continue'} --retries ${config.retries ?? 3}`,
  }],
};

registerAction(errorHandler);
