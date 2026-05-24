import { registerAction } from '../registry';
import type { ActionDefinition } from '../../types/actions';
import { createOpenClawNativeToolStep, parseJsonObject } from './native';

const openClawToolCall: ActionDefinition = {
  id: 'openclaw-tool-call',
  name: 'OpenClaw Tool Call',
  category: 'openclaw',
  icon: 'wrench',
  description: 'Call an allowed OpenClaw tool from inside the Lobster workflow',
  requiredTools: ['lobster'],
  inputs: [{ id: 'input', label: 'Input', kind: 'json' }],
  outputs: [{ id: 'output', label: 'Tool result', kind: 'json' }],
  configFields: [
    {
      id: 'tool',
      label: 'Tool',
      type: 'select',
      required: true,
      gatewaySource: 'tools',
      options: [{ label: '(connect Gateway to discover tools)', value: '' }],
    },
    { id: 'action', label: 'Action', type: 'text', required: true, placeholder: 'send, invoke, search...' },
    { id: 'argsJson', label: 'Args JSON', type: 'code', placeholder: '{\n  "key": "value"\n}' },
    { id: 'mapInput', label: 'Map input item into args', type: 'boolean' },
    { id: 'itemKey', label: 'Input arg key', type: 'text', placeholder: 'item' },
  ],
  defaults: { tool: 'message', action: 'send', argsJson: '{}', mapInput: false, itemKey: 'item' },
  compile: (config, ctx) => {
    const tool = String(config.tool ?? 'message').trim() || 'message';
    const args = parseJsonObject(config.argsJson, 'Args JSON');
    const mapInput = Boolean(config.mapInput) && ctx.incomingEdges.length > 0;
    const step = createOpenClawNativeToolStep(ctx.nodeId, {
      tool,
      action: String(config.action ?? 'send'),
      args,
      requiredTools: ['lobster', tool].filter(Boolean),
      each: mapInput,
      itemKey: String(config.itemKey ?? 'item'),
    });

    if (mapInput) {
      step.stdin = `$${ctx.incomingEdges[0].sourceNodeId}.stdout`;
    }
    return [step];
  },
};

registerAction(openClawToolCall);
