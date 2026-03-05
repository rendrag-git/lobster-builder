import { registerAction } from '../registry';
import type { ActionDefinition } from '../../types/actions';

const webSearch: ActionDefinition = {
  id: 'web-search',
  name: 'Web Search',
  category: 'ai',
  icon: 'search',
  description: 'Search the web and return results',
  inputs: [{ id: 'input', label: 'Query Override', kind: 'text' }],
  outputs: [{ id: 'output', label: 'Results', kind: 'json' }],
  configFields: [
    { id: 'query', label: 'Search Query', type: 'text', required: true, placeholder: 'What to search for' },
    { id: 'count', label: 'Max Results', type: 'number', defaultValue: 5 },
  ],
  defaults: { query: '', count: 5 },
  compile: (config, ctx) => [{
    id: ctx.nodeId,
    command: `openclaw search --query '${config.query}' --count ${config.count ?? 5}`,
  }],
};

registerAction(webSearch);
