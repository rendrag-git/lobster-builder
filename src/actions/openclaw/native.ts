import type { LobsterStep } from '../../types/lobster';

export interface OpenClawNativeToolCall {
  tool: string
  action?: string
  args?: Record<string, unknown>
  requiredTools?: string[]
  each?: boolean
  itemKey?: string
}

function quotePipelineArg(value: string): string {
  return `'${value.replaceAll("'", "'\\''")}'`;
}

export function parseJsonObject(value: unknown, label: string): Record<string, unknown> {
  if (value === undefined || value === null || value === '') return {};
  if (typeof value !== 'string') {
    if (typeof value === 'object' && !Array.isArray(value)) return value as Record<string, unknown>;
    throw new Error(`${label} must be a JSON object`);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    throw new Error(`${label} must be valid JSON`);
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error(`${label} must be a JSON object`);
  }
  return parsed as Record<string, unknown>;
}

export function createOpenClawNativeToolStep(
  stepId: string,
  call: OpenClawNativeToolCall,
): LobsterStep {
  const tool = call.tool.trim();
  const action = call.action?.trim() || 'invoke';
  if (!tool) throw new Error('OpenClaw tool is required');
  if (!action) throw new Error('OpenClaw action is required');

  const args = call.args ?? {};
  const pipelineParts = [
    'openclaw.invoke',
    '--tool',
    quotePipelineArg(tool),
    '--action',
    quotePipelineArg(action),
    '--args-json',
    quotePipelineArg(JSON.stringify(args)),
  ];

  if (call.each) {
    pipelineParts.push('--each', '--item-key', quotePipelineArg(call.itemKey?.trim() || 'item'));
  }

  return {
    id: stepId,
    pipeline: pipelineParts.join(' '),
    openclaw_action: {
      tool,
      action,
      args,
      ...(call.requiredTools ? { requiredTools: call.requiredTools } : {}),
    },
  };
}
