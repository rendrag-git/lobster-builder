import { registerAction } from '../registry';
import type { ActionDefinition } from '../../types/actions';

const conditionalBranch: ActionDefinition = {
  id: 'conditional-branch',
  name: 'Conditional Branch',
  category: 'flow',
  icon: 'git-branch',
  description: 'Route execution based on a condition',
  inputs: [{ id: 'input', label: 'Value', kind: 'any' }],
  outputs: [
    { id: 'true', label: 'True', kind: 'any' },
    { id: 'false', label: 'False', kind: 'any' },
  ],
  configFields: [
    { id: 'condition', label: 'Condition', type: 'text', required: true, placeholder: '${score} > 80' },
  ],
  defaults: { condition: '' },
  compile: (config, ctx) => [{
    id: ctx.nodeId,
    command: `openclaw flow branch --condition '${config.condition}'`,
    ...(ctx.incomingEdges.length > 0 ? { stdin: `$${ctx.incomingEdges[0].sourceNodeId}.stdout` } : {}),
  }],
};

registerAction(conditionalBranch);
