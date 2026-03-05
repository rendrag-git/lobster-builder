import { registerAction } from '../registry';
import type { ActionDefinition } from '../../types/actions';

const webFetch: ActionDefinition = {
  id: 'web-fetch',
  name: 'Web Fetch',
  category: 'ai',
  icon: 'globe',
  description: 'Fetch and extract content from a URL',
  inputs: [{ id: 'input', label: 'URL Override', kind: 'text' }],
  outputs: [{ id: 'output', label: 'Content', kind: 'text' }],
  configFields: [
    { id: 'url', label: 'URL', type: 'text', required: true, placeholder: 'https://...' },
    {
      id: 'mode', label: 'Extract Mode', type: 'select', defaultValue: 'markdown',
      options: [
        { label: 'Markdown', value: 'markdown' },
        { label: 'Plain Text', value: 'text' },
      ],
    },
  ],
  defaults: { url: '', mode: 'markdown' },
  compile: (config, ctx) => [{
    id: ctx.nodeId,
    command: `openclaw fetch --url '${config.url}' --mode ${config.mode ?? 'markdown'}`,
  }],
};

registerAction(webFetch);
