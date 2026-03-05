import { registerAction } from '../registry';
import type { ActionDefinition } from '../../types/actions';

const promptLlm: ActionDefinition = {
  id: 'prompt-llm',
  name: 'Prompt LLM',
  category: 'ai',
  icon: 'sparkles',
  description: 'Send a prompt to a language model and get a response',
  inputs: [{ id: 'input', label: 'Context', kind: 'any' }],
  outputs: [{ id: 'output', label: 'Response', kind: 'text' }],
  configFields: [
    {
      id: 'model', label: 'Model', type: 'select', required: true,
      options: [
        { label: 'Sonnet', value: 'sonnet' },
        { label: 'Haiku', value: 'haiku' },
        { label: 'Opus', value: 'opus' },
      ],
    },
    { id: 'prompt', label: 'Prompt', type: 'textarea', required: true, placeholder: 'Enter your prompt...' },
  ],
  defaults: { model: 'sonnet', prompt: '' },
  compile: (config, ctx) => {
    const step: any = {
      id: ctx.nodeId,
      command: `openclaw llm --model ${config.model} --prompt '${config.prompt}'`,
    };
    if (ctx.incomingEdges.length > 0) {
      step.stdin = `$${ctx.incomingEdges[0].sourceNodeId}.stdout`;
    }
    return [step];
  },
};

registerAction(promptLlm);
