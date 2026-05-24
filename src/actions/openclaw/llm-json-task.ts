import { registerAction } from '../registry';
import type { ActionDefinition } from '../../types/actions';
import { createOpenClawNativeToolStep, parseJsonObject } from './native';

function optionalString(value: unknown): string | undefined {
  const text = typeof value === 'string' ? value.trim() : '';
  return text || undefined;
}

function optionalNumber(value: unknown): number | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  const number = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(number) ? number : undefined;
}

const llmJsonTask: ActionDefinition = {
  id: 'llm-json-task',
  name: 'LLM JSON Task',
  category: 'openclaw',
  icon: 'sparkles',
  description: 'Run a JSON-only model task through the invoking agent OpenClaw llm-task tool',
  requiredTools: ['lobster', 'llm-task'],
  inputs: [{ id: 'input', label: 'Input', kind: 'json' }],
  outputs: [{ id: 'output', label: 'JSON result', kind: 'json' }],
  configFields: [
    { id: 'prompt', label: 'Prompt', type: 'textarea', required: true, placeholder: 'Classify the input and return JSON.' },
    { id: 'inputJson', label: 'Input JSON', type: 'code', placeholder: '{\n  "subject": "Hello"\n}' },
    { id: 'useInputAsInput', label: 'Use upstream output as input', type: 'boolean' },
    { id: 'schemaJson', label: 'Schema JSON', type: 'code', placeholder: '{\n  "type": "object",\n  "properties": {}\n}' },
    { id: 'model', label: 'Model', type: 'select', gatewaySource: 'models', options: [{ label: 'Gateway default', value: '' }] },
    { id: 'provider', label: 'Provider', type: 'text', placeholder: 'openai-codex, anthropic...' },
    { id: 'thinking', label: 'Thinking', type: 'select', options: [
      { label: 'Gateway default', value: '' },
      { label: 'Off', value: 'off' },
      { label: 'Minimal', value: 'minimal' },
      { label: 'Low', value: 'low' },
      { label: 'Medium', value: 'medium' },
      { label: 'High', value: 'high' },
    ] },
    { id: 'authProfileId', label: 'Auth Profile', type: 'text', placeholder: 'main' },
    { id: 'temperature', label: 'Temperature', type: 'number' },
    { id: 'maxTokens', label: 'Max Tokens', type: 'number' },
    { id: 'timeoutMs', label: 'Timeout ms', type: 'number' },
  ],
  defaults: {
    prompt: '',
    inputJson: '',
    useInputAsInput: false,
    schemaJson: '',
    model: '',
    provider: '',
    thinking: '',
    authProfileId: '',
    temperature: undefined,
    maxTokens: undefined,
    timeoutMs: undefined,
  },
  compile: (config, ctx) => {
    const input = parseJsonObject(config.inputJson, 'Input JSON');
    const schema = parseJsonObject(config.schemaJson, 'Schema JSON');
    const useInputAsInput = Boolean(config.useInputAsInput) && ctx.incomingEdges.length > 0;
    const args: Record<string, unknown> = {
      prompt: String(config.prompt ?? ''),
      ...(useInputAsInput ? {} : Object.keys(input).length > 0 ? { input } : {}),
      ...(Object.keys(schema).length > 0 ? { schema } : {}),
      ...(optionalString(config.provider) ? { provider: optionalString(config.provider) } : {}),
      ...(optionalString(config.model) ? { model: optionalString(config.model) } : {}),
      ...(optionalString(config.thinking) ? { thinking: optionalString(config.thinking) } : {}),
      ...(optionalString(config.authProfileId) ? { authProfileId: optionalString(config.authProfileId) } : {}),
      ...(optionalNumber(config.temperature) !== undefined ? { temperature: optionalNumber(config.temperature) } : {}),
      ...(optionalNumber(config.maxTokens) !== undefined ? { maxTokens: optionalNumber(config.maxTokens) } : {}),
      ...(optionalNumber(config.timeoutMs) !== undefined ? { timeoutMs: optionalNumber(config.timeoutMs) } : {}),
    };

    const step = createOpenClawNativeToolStep(ctx.nodeId, {
      tool: 'llm-task',
      action: 'json',
      args,
      requiredTools: ['lobster', 'llm-task'],
      each: useInputAsInput,
      itemKey: 'input',
    });

    if (useInputAsInput) {
      step.stdin = `$${ctx.incomingEdges[0].sourceNodeId}.stdout`;
    }
    return [step];
  },
};

registerAction(llmJsonTask);
