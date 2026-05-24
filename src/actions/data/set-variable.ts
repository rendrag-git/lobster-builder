import { registerAction } from '../registry';
import type { ActionDefinition } from '../../types/actions';
import type { LobsterStep } from '../../types/lobster';

const setVariable: ActionDefinition = {
  id: 'set-variable',
  name: 'Set Variable',
  category: 'data',
  icon: 'variable',
  description: 'Store a value in a named workflow variable',
  inputs: [{ id: 'input', label: 'Value', kind: 'any' }],
  outputs: [{ id: 'output', label: 'Value', kind: 'any' }],
  configFields: [
    { id: 'name', label: 'Variable Name', type: 'text', required: true, placeholder: 'myVar' },
    { id: 'value', label: 'Value', type: 'text', placeholder: '${input} or literal' },
  ],
  defaults: { name: '', value: '' },
  compile: (config, ctx) => {
    const step: LobsterStep = {
      id: ctx.nodeId,
      command: `openclaw data set --name '${config.name}' --value '${config.value}'`,
    };
    if (ctx.incomingEdges.length > 0) {
      step.stdin = `$${ctx.incomingEdges[0].sourceNodeId}.stdout`;
    }
    return [step];
  },
};

registerAction(setVariable);
