import { registerAction } from '../registry';
import type { ActionDefinition } from '../../types/actions';
import { createOpenClawNativeToolStep } from './native';

function optionalString(value: unknown): string | undefined {
  const text = typeof value === 'string' ? value.trim() : '';
  return text || undefined;
}

function optionalNumber(value: unknown): number | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  const number = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(number) ? number : undefined;
}

const runAgent: ActionDefinition = {
  id: 'run-agent',
  name: 'Run Agent',
  category: 'openclaw',
  icon: 'bot',
  description: 'Spawn an OpenClaw agent turn through the invoking agent sessions tool',
  requiredTools: ['lobster', 'sessions_spawn'],
  inputs: [{ id: 'input', label: 'Context', kind: 'any' }],
  outputs: [{ id: 'output', label: 'Spawn result', kind: 'json' }],
  configFields: [
    {
      id: 'agentId',
      label: 'Agent',
      type: 'select',
      gatewaySource: 'agents',
      options: [{ label: 'Gateway default', value: '' }],
    },
    { id: 'task', label: 'Task', type: 'textarea', required: true, placeholder: 'Ask the agent to complete this step.' },
    { id: 'taskName', label: 'Task Name', type: 'text', placeholder: 'stable_task_handle' },
    { id: 'label', label: 'Label', type: 'text', placeholder: 'Human-readable run label' },
    {
      id: 'runtime',
      label: 'Runtime',
      type: 'select',
      options: [
        { label: 'Subagent', value: 'subagent' },
        { label: 'ACP', value: 'acp' },
      ],
    },
    {
      id: 'mode',
      label: 'Mode',
      type: 'select',
      options: [
        { label: 'Gateway default', value: '' },
        { label: 'Run', value: 'run' },
        { label: 'Session', value: 'session' },
      ],
    },
    { id: 'model', label: 'Model', type: 'select', gatewaySource: 'models', options: [{ label: 'Gateway default', value: '' }] },
    { id: 'thinking', label: 'Thinking', type: 'text', placeholder: 'low, medium, high...' },
    { id: 'cwd', label: 'Working Directory', type: 'text', placeholder: '/workspace' },
    { id: 'runTimeoutSeconds', label: 'Timeout seconds', type: 'number' },
    {
      id: 'cleanup',
      label: 'Cleanup',
      type: 'select',
      options: [
        { label: 'Keep', value: 'keep' },
        { label: 'Delete', value: 'delete' },
      ],
    },
    {
      id: 'sandbox',
      label: 'Sandbox',
      type: 'select',
      options: [
        { label: 'Inherit', value: 'inherit' },
        { label: 'Require', value: 'require' },
      ],
    },
    {
      id: 'context',
      label: 'Context',
      type: 'select',
      options: [
        { label: 'Gateway default', value: '' },
        { label: 'Isolated', value: 'isolated' },
        { label: 'Fork current context', value: 'fork' },
      ],
    },
    { id: 'lightContext', label: 'Light context', type: 'boolean' },
  ],
  defaults: {
    agentId: '',
    task: '',
    taskName: '',
    label: '',
    runtime: 'subagent',
    mode: '',
    model: '',
    thinking: '',
    cwd: '',
    runTimeoutSeconds: undefined,
    cleanup: 'keep',
    sandbox: 'inherit',
    context: '',
    lightContext: false,
  },
  compile: (config, ctx) => {
    const runTimeoutSeconds = optionalNumber(config.runTimeoutSeconds);
    const args: Record<string, unknown> = {
      task: String(config.task ?? ''),
      ...(optionalString(config.agentId) ? { agentId: optionalString(config.agentId) } : {}),
      ...(optionalString(config.taskName) ? { taskName: optionalString(config.taskName) } : {}),
      ...(optionalString(config.label) ? { label: optionalString(config.label) } : {}),
      ...(optionalString(config.runtime) ? { runtime: optionalString(config.runtime) } : {}),
      ...(optionalString(config.mode) ? { mode: optionalString(config.mode) } : {}),
      ...(optionalString(config.model) ? { model: optionalString(config.model) } : {}),
      ...(optionalString(config.thinking) ? { thinking: optionalString(config.thinking) } : {}),
      ...(optionalString(config.cwd) ? { cwd: optionalString(config.cwd) } : {}),
      ...(runTimeoutSeconds !== undefined ? { runTimeoutSeconds } : {}),
      ...(optionalString(config.cleanup) ? { cleanup: optionalString(config.cleanup) } : {}),
      ...(optionalString(config.sandbox) ? { sandbox: optionalString(config.sandbox) } : {}),
      ...(optionalString(config.context) ? { context: optionalString(config.context) } : {}),
      ...(config.lightContext === true ? { lightContext: true } : {}),
    };

    const step = createOpenClawNativeToolStep(ctx.nodeId, {
      tool: 'sessions_spawn',
      action: 'spawn',
      args,
      requiredTools: ['lobster', 'sessions_spawn'],
    });

    if (ctx.incomingEdges.length > 0) {
      step.stdin = `$${ctx.incomingEdges[0].sourceNodeId}.stdout`;
    }
    return [step];
  },
};

registerAction(runAgent);
