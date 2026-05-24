import { registerAction } from '../registry';
import type { ActionDefinition } from '../../types/actions';
import type { LobsterStep } from '../../types/lobster';

const httpRequest: ActionDefinition = {
  id: 'http-request',
  name: 'HTTP Request',
  category: 'io',
  icon: 'globe',
  description: 'Make an HTTP request to an external API',
  inputs: [{ id: 'body', label: 'Request Body', kind: 'data' }],
  outputs: [
    { id: 'response', label: 'Response', kind: 'data' },
    { id: 'status', label: 'Status Code', kind: 'text' },
  ],
  configFields: [
    {
      id: 'method', label: 'Method', type: 'select',
      options: [
        { label: 'GET', value: 'GET' },
        { label: 'POST', value: 'POST' },
        { label: 'PUT', value: 'PUT' },
        { label: 'PATCH', value: 'PATCH' },
        { label: 'DELETE', value: 'DELETE' },
      ],
    },
    { id: 'url', label: 'URL', type: 'text', required: true, placeholder: 'https://api.example.com/endpoint' },
    { id: 'headers', label: 'Headers (JSON)', type: 'code', placeholder: '{"Authorization": "Bearer ${token}"}' },
  ],
  defaults: { method: 'GET', url: '', headers: '{}' },
  compile: (config, ctx) => {
    const step: LobsterStep = {
      id: ctx.nodeId,
      command: `openclaw http --method ${config.method ?? 'GET'} --url '${config.url}' --headers '${config.headers ?? '{}'}'`,
    };
    if (ctx.incomingEdges.length > 0) {
      step.stdin = `$${ctx.incomingEdges[0].sourceNodeId}.stdout`;
    }
    return [step];
  },
};

registerAction(httpRequest);
