import { registerAction } from '../registry';
import type { ActionDefinition } from '../../types/actions';
import type { LobsterStep } from '../../types/lobster';

const callAgent: ActionDefinition = {
  id: 'call-agent',
  name: 'Call Agent',
  category: 'ai',
  icon: 'bot',
  description: 'Delegate a task to a named OpenClaw agent',
  inputs: [{ id: 'input', label: 'Context', kind: 'any' }],
  outputs: [{ id: 'output', label: 'Response', kind: 'json' }],
  configFields: [
    {
      id: 'agent',
      label: 'Agent',
      type: 'select',
      required: true,
      gatewaySource: 'agents',
      options: [
        { label: '(connect Gateway to discover agents)', value: '' },
      ],
      placeholder: 'e.g. soren, atlas, dave',
    },
    { id: 'task', label: 'Task', type: 'textarea', required: true, placeholder: 'What should the agent do?' },
  ],
  defaults: { agent: '', task: '' },
  compile: (config, ctx) => {
    const step: LobsterStep = {
      id: ctx.nodeId,
      command: `openclaw agent invoke --name ${config.agent} --task '${config.task}'`,
    };
    if (ctx.incomingEdges.length > 0) {
      step.stdin = `$${ctx.incomingEdges[0].sourceNodeId}.stdout`;
    }
    return [step];
  },
};

registerAction(callAgent);
