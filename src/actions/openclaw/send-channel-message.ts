import { registerAction } from '../registry';
import type { ActionDefinition } from '../../types/actions';
import { createOpenClawNativeToolStep } from './native';

const sendChannelMessage: ActionDefinition = {
  id: 'send-channel-message',
  name: 'Send Channel Message',
  category: 'openclaw',
  icon: 'message',
  description: 'Send a message through the invoking agent OpenClaw message tool',
  requiredTools: ['lobster', 'message'],
  inputs: [{ id: 'input', label: 'Message input', kind: 'text' }],
  outputs: [{ id: 'output', label: 'Send result', kind: 'json' }],
  configFields: [
    {
      id: 'channel',
      label: 'Channel',
      type: 'select',
      required: true,
      gatewaySource: 'channels',
      options: [
        { label: '(connect Gateway to discover channels)', value: '' },
        { label: 'Discord', value: 'discord' },
        { label: 'Slack', value: 'slack' },
        { label: 'Telegram', value: 'telegram' },
      ],
    },
    {
      id: 'guildId',
      label: 'Discord Guild/Server ID',
      type: 'text',
      placeholder: 'optional; required when Discord channel lookup needs a server',
      description: 'Optional Discord server id. Use this when the same channel name or id needs server context.',
    },
    {
      id: 'target',
      label: 'Target',
      type: 'text',
      required: true,
      gatewaySource: 'channelTargets',
      placeholder: 'channel:<id>, thread, user, or route',
      description: 'Uses gateway target suggestions when available. Otherwise enter the OpenClaw message target manually.',
    },
    { id: 'message', label: 'Message', type: 'textarea', required: true, placeholder: 'Workflow finished: $previous.stdout' },
    { id: 'useInputAsMessage', label: 'Use input as message body', type: 'boolean' },
  ],
  defaults: { channel: '', target: '', message: '', useInputAsMessage: false },
  compile: (config, ctx) => {
    const useInputAsMessage = Boolean(config.useInputAsMessage) && ctx.incomingEdges.length > 0;
    const args: Record<string, unknown> = {
      provider: String(config.channel ?? ''),
      to: String(config.target ?? ''),
      message: useInputAsMessage ? '' : String(config.message ?? ''),
    };
    const guildId = String(config.guildId ?? '').trim();
    if (guildId) args.guildId = guildId;

    const step = createOpenClawNativeToolStep(ctx.nodeId, {
      tool: 'message',
      action: 'send',
      args,
      requiredTools: ['lobster', 'message'],
      each: useInputAsMessage,
      itemKey: 'message',
    });

    if (useInputAsMessage) {
      step.stdin = `$${ctx.incomingEdges[0].sourceNodeId}.stdout`;
    }
    return [step];
  },
};

registerAction(sendChannelMessage);
