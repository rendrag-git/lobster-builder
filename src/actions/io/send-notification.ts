import { registerAction } from '../registry';
import type { ActionDefinition } from '../../types/actions';
import type { LobsterStep } from '../../types/lobster';

const sendNotification: ActionDefinition = {
  id: 'send-notification',
  name: 'Send Notification',
  category: 'io',
  icon: 'bell',
  description: 'Send a notification via email, Slack, or webhook',
  inputs: [{ id: 'input', label: 'Message', kind: 'text' }],
  outputs: [{ id: 'output', label: 'Receipt', kind: 'text' }],
  configFields: [
    {
      id: 'channel', label: 'Channel', type: 'select',
      gatewaySource: 'channels',
      options: [
        { label: 'Email', value: 'email' },
        { label: 'Slack', value: 'slack' },
        { label: 'Webhook', value: 'webhook' },
      ],
    },
    { id: 'recipient', label: 'Recipient / URL', type: 'text', required: true, placeholder: 'user@example.com' },
    { id: 'message', label: 'Message', type: 'textarea', placeholder: 'Notification content...' },
  ],
  defaults: { channel: 'email', recipient: '', message: '' },
  compile: (config, ctx) => {
    const step: LobsterStep = {
      id: ctx.nodeId,
      command: `openclaw notify --channel ${config.channel ?? 'email'} --recipient '${config.recipient}' --message '${config.message}'`,
    };
    if (ctx.incomingEdges.length > 0) {
      step.stdin = `$${ctx.incomingEdges[0].sourceNodeId}.stdout`;
    }
    return [step];
  },
};

registerAction(sendNotification);
