import { registerAction } from '../registry';
import type { ActionDefinition } from '../../types/actions';

const requireApproval: ActionDefinition = {
  id: 'require-approval',
  name: 'Require Approval',
  category: 'flow',
  icon: 'user-check',
  description: 'Pause workflow and wait for human approval',
  inputs: [{ id: 'input', label: 'Context', kind: 'any' }],
  outputs: [
    { id: 'approved', label: 'Approved', kind: 'any' },
    { id: 'rejected', label: 'Rejected', kind: 'any' },
  ],
  configFields: [
    { id: 'message', label: 'Approval Message', type: 'textarea', required: true, placeholder: 'Please review and approve...' },
    { id: 'timeout', label: 'Timeout (hours)', type: 'number' },
  ],
  defaults: { message: '', timeout: 24 },
  compile: (config, ctx) => [{
    id: ctx.nodeId,
    command: `openclaw flow approval --message '${config.message}' --timeout ${config.timeout ?? 24}`,
  }],
};

registerAction(requireApproval);
