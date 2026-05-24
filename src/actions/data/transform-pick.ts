import { registerAction } from '../registry';
import type { ActionDefinition } from '../../types/actions';
import type { LobsterStep } from '../../types/lobster';

const transformPick: ActionDefinition = {
  id: 'transform-pick',
  name: 'Transform: Pick',
  category: 'data',
  icon: 'scissors',
  description: 'Extract specific fields from an object or array',
  inputs: [{ id: 'input', label: 'Object', kind: 'data' }],
  outputs: [{ id: 'output', label: 'Picked', kind: 'data' }],
  configFields: [
    { id: 'fields', label: 'Fields (comma-separated)', type: 'text', required: true, placeholder: 'id, name, email' },
  ],
  defaults: { fields: '' },
  compile: (config, ctx) => {
    const step: LobsterStep = {
      id: ctx.nodeId,
      command: `openclaw data pick --fields '${config.fields}'`,
    };
    if (ctx.incomingEdges.length > 0) {
      step.stdin = `$${ctx.incomingEdges[0].sourceNodeId}.stdout`;
    }
    return [step];
  },
};

registerAction(transformPick);
