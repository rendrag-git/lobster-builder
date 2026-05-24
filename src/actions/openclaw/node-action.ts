import { registerAction } from '../registry';
import type { ActionDefinition } from '../../types/actions';
import { createOpenClawNativeToolStep, parseJsonObject } from './native';

function optionalNumber(value: unknown): number | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  const number = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(number) ? number : undefined;
}

const nodeAction: ActionDefinition = {
  id: 'node-action',
  name: 'Node Action',
  category: 'openclaw',
  icon: 'wrench',
  description: 'Invoke an explicit paired-node command through the OpenClaw nodes tool',
  requiredTools: ['lobster', 'nodes'],
  inputs: [{ id: 'input', label: 'Context', kind: 'json' }],
  outputs: [{ id: 'output', label: 'Node result', kind: 'json' }],
  configFields: [
    { id: 'node', label: 'Node', type: 'text', required: true, placeholder: 'node id, name, or alias', gatewaySource: 'nodes' },
    { id: 'command', label: 'Command', type: 'text', required: true, placeholder: 'device.status' },
    { id: 'paramsJson', label: 'Params JSON', type: 'code', placeholder: '{\n  "key": "value"\n}' },
    { id: 'timeoutMs', label: 'Timeout ms', type: 'number' },
  ],
  defaults: { node: '', command: '', paramsJson: '{}', timeoutMs: undefined },
  compile: (config, ctx) => {
    const params = parseJsonObject(config.paramsJson, 'Params JSON');
    const timeoutMs = optionalNumber(config.timeoutMs);
    const args: Record<string, unknown> = {
      node: String(config.node ?? ''),
      invokeCommand: String(config.command ?? ''),
      invokeParamsJson: JSON.stringify(params),
      ...(timeoutMs !== undefined ? { invokeTimeoutMs: timeoutMs } : {}),
    };

    const step = createOpenClawNativeToolStep(ctx.nodeId, {
      tool: 'nodes',
      action: 'invoke',
      args,
      requiredTools: ['lobster', 'nodes'],
    });

    if (ctx.incomingEdges.length > 0) {
      step.stdin = `$${ctx.incomingEdges[0].sourceNodeId}.stdout`;
    }
    return [step];
  },
};

registerAction(nodeAction);
