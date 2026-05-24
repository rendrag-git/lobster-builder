import { registerAction } from '../registry';
import type { ActionDefinition } from '../../types/actions';
import type { LobsterStep } from '../../types/lobster';

const jsonRenderer: ActionDefinition = {
  id: 'json-renderer',
  name: 'JSON Renderer',
  category: 'data',
  icon: 'braces',
  description: 'Render a JSON template with variable interpolation',
  inputs: [{ id: 'input', label: 'Variables', kind: 'data' }],
  outputs: [{ id: 'output', label: 'JSON', kind: 'text' }],
  configFields: [
    { id: 'template', label: 'Template', type: 'code', required: true, placeholder: '{"key": "${input}"}' },
  ],
  defaults: { template: '{}' },
  compile: (config, ctx) => {
    const step: LobsterStep = {
      id: ctx.nodeId,
      command: `openclaw data render --template '${config.template}'`,
    };
    if (ctx.incomingEdges.length > 0) {
      step.stdin = `$${ctx.incomingEdges[0].sourceNodeId}.stdout`;
    }
    return [step];
  },
};

registerAction(jsonRenderer);
