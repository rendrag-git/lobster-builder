import type { Node, Edge } from '@xyflow/react';
import type { LobsterWorkflowFile, LobsterStep } from '../types/lobster';
import type { WorkflowMeta } from '../types/graph';

interface DecompileResult {
  nodes: Node[];
  edges: Edge[];
  meta: WorkflowMeta;
}

export function decompileWorkflow(workflow: LobsterWorkflowFile): DecompileResult {
  const nodes: Node[] = [];
  const edges: Edge[] = [];

  for (let i = 0; i < workflow.steps.length; i++) {
    const step = workflow.steps[i];
    if (isCompiledParallelBundleStep(step)) {
      continue;
    }
    const { actionId, config } = matchStepToAction(step);

    nodes.push({
      id: step.id,
      type: 'workflowNode',
      position: { x: 250, y: i * 150 },
      data: { actionId, config },
    });

    const inputRef = readInputReference(step);
    if (inputRef) {
      edges.push({
        id: `e-${inputRef.source}-${step.id}`,
        source: inputRef.source,
        sourceHandle: inputRef.sourceHandle,
        target: step.id,
        targetHandle: 'input',
      });
    }
  }

  return {
    nodes,
    edges,
    meta: {
      name: workflow.name ?? 'imported-workflow',
      description: workflow.description ?? '',
      args: workflow.args,
      env: workflow.env,
      cwd: workflow.cwd,
      gateway: workflow.openclaw?.gateway,
      schedule: workflow.openclaw?.schedule,
      bundle: workflow.openclaw?.bundle,
    },
  };
}

function isCompiledParallelBundleStep(step: LobsterStep): boolean {
  return step.id === 'openclaw_parallel_bundle' && Boolean(step.openclaw_parallel_bundle);
}

function parseStepReference(value: unknown): { source: string; sourceHandle: string } | null {
  if (typeof value !== 'string') return null;
  const match = value.match(/^\$([A-Za-z0-9_-]+)\.(stdout|json|output)$/);
  if (!match) return null;
  return { source: match[1], sourceHandle: match[2] };
}

function readInputReference(step: LobsterStep): { source: string; sourceHandle: string } | null {
  return parseStepReference(step.stdin) ?? parseStepReference(step.workflow_args?.input);
}

function workflowArgsWithoutInputEdge(step: LobsterStep): Record<string, unknown> | undefined {
  if (!step.workflow_args) return undefined;
  if (!parseStepReference(step.workflow_args.input)) return step.workflow_args;

  const rest = { ...step.workflow_args };
  delete rest.input;
  return Object.keys(rest).length > 0 ? rest : undefined;
}

function numberPipelineOption(pipeline: string, option: string): number | undefined {
  const value = readPipelineOption(pipeline, option);
  if (!value) return undefined;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
}

function unquotePipelineArg(value: string): string {
  return value.replaceAll("'\\''", "'");
}

function readPipelineOption(pipeline: string, option: string): string | undefined {
  const pattern = new RegExp(`--${option}\\s+(?:'((?:'\\\\''|[^'])*)'|(\\S+))`);
  const match = pipeline.match(pattern);
  if (!match) return undefined;
  return unquotePipelineArg(match[1] ?? match[2] ?? '');
}

function parseJsonObjectOption(value: string | undefined): Record<string, unknown> | undefined {
  if (!value) return undefined;
  try {
    const parsed = JSON.parse(value);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  } catch {
    return undefined;
  }
  return undefined;
}

function parseOpenClawInvokePipeline(step: LobsterStep): {
  tool: string
  action: string
  args: Record<string, unknown>
  each: boolean
  itemKey: string
} | null {
  const pipeline = step.pipeline?.trim();
  if (!pipeline || (!pipeline.startsWith('openclaw.invoke ') && !pipeline.startsWith('clawd.invoke '))) {
    return null;
  }

  const tool = readPipelineOption(pipeline, 'tool')?.trim() ?? '';
  const action = readPipelineOption(pipeline, 'action')?.trim() ?? '';
  if (!tool || !action) return null;

  let args: Record<string, unknown> = {};
  const argsJson = readPipelineOption(pipeline, 'args-json');
  if (argsJson) {
    try {
      const parsed = JSON.parse(argsJson);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        args = parsed as Record<string, unknown>;
      }
    } catch {
      args = {};
    }
  }

  return {
    tool,
    action,
    args,
    each: /\s--each(\s|$)/.test(pipeline),
    itemKey: readPipelineOption(pipeline, 'item-key')?.trim() || 'item',
  };
}

function stringifyConfigJson(value: unknown): string {
  if (value === undefined || value === null || value === '') return '';
  if (typeof value === 'string') {
    try {
      return JSON.stringify(JSON.parse(value), null, 2);
    } catch {
      return value;
    }
  }
  return JSON.stringify(value, null, 2);
}

function matchOpenClawNativeAction(step: LobsterStep): { actionId: string; config: Record<string, unknown> } | null {
  const native = step.openclaw_action
    ? {
        tool: step.openclaw_action.tool,
        action: step.openclaw_action.action ?? 'invoke',
        args: step.openclaw_action.args ?? {},
        each: Boolean(step.pipeline && /\s--each(\s|$)/.test(step.pipeline)),
        itemKey: step.pipeline ? readPipelineOption(step.pipeline, 'item-key')?.trim() || 'item' : 'item',
      }
    : parseOpenClawInvokePipeline(step);

  if (!native) return null;

  if (native.tool === 'message' && native.action === 'send') {
    return {
      actionId: 'send-channel-message',
      config: {
        channel: native.args.provider ?? native.args.channel ?? '',
        target: native.args.to ?? native.args.target ?? '',
        message: native.args.message ?? '',
        useInputAsMessage: native.each && native.itemKey === 'message',
      },
    };
  }

  if (native.tool === 'llm-task' && native.action === 'json') {
    return {
      actionId: 'llm-json-task',
      config: {
        prompt: native.args.prompt ?? '',
        inputJson: native.args.input ? JSON.stringify(native.args.input, null, 2) : '',
        useInputAsInput: native.each && native.itemKey === 'input',
        schemaJson: native.args.schema ? JSON.stringify(native.args.schema, null, 2) : '',
        provider: native.args.provider ?? '',
        model: native.args.model ?? '',
        thinking: native.args.thinking ?? '',
        authProfileId: native.args.authProfileId ?? '',
        temperature: native.args.temperature,
        maxTokens: native.args.maxTokens,
        timeoutMs: native.args.timeoutMs,
      },
    };
  }

  if (native.tool === 'sessions_spawn' && (native.action === 'spawn' || native.action === 'run' || native.action === 'invoke')) {
    return {
      actionId: 'run-agent',
      config: {
        agentId: native.args.agentId ?? '',
        task: native.args.task ?? '',
        taskName: native.args.taskName ?? '',
        label: native.args.label ?? '',
        runtime: native.args.runtime ?? 'subagent',
        mode: native.args.mode ?? '',
        model: native.args.model ?? '',
        thinking: native.args.thinking ?? '',
        cwd: native.args.cwd ?? '',
        runTimeoutSeconds: native.args.runTimeoutSeconds,
        cleanup: native.args.cleanup ?? 'keep',
        sandbox: native.args.sandbox ?? 'inherit',
        context: native.args.context ?? '',
        lightContext: native.args.lightContext === true,
      },
    };
  }

  if (native.tool === 'nodes' && native.action === 'invoke') {
    return {
      actionId: 'node-action',
      config: {
        node: native.args.node ?? '',
        command: native.args.invokeCommand ?? '',
        paramsJson: stringifyConfigJson(native.args.invokeParamsJson),
        timeoutMs: native.args.invokeTimeoutMs,
      },
    };
  }

  return {
    actionId: 'openclaw-tool-call',
    config: {
      tool: native.tool,
      action: native.action,
      argsJson: JSON.stringify(native.args, null, 2),
      mapInput: native.each,
      itemKey: native.itemKey,
    },
  };
}

function matchWorkflowRef(step: LobsterStep): { actionId: string; config: Record<string, unknown> } | null {
  const ref = step.openclaw_workflow_ref;
  if (ref) {
    return {
      actionId: 'run-sub-workflow',
      config: {
        target: ref.target ?? (ref.workflowId ? 'published' : 'file'),
        workflowId: ref.workflowId ?? '',
        workflowRevision: ref.workflowRevision,
        file: ref.file ?? '',
        argsJson: ref.args ? JSON.stringify(ref.args, null, 2) : '',
        passInput: Boolean(parseStepReference(step.stdin) || ref.inputKey),
      },
    };
  }

  const pipeline = step.pipeline?.trim();
  if (!pipeline?.startsWith('lobster.workflow ')) return null;

  const workflowId = readPipelineOption(pipeline, 'workflow-id') ?? readPipelineOption(pipeline, 'workflowId');
  const file = readPipelineOption(pipeline, 'file');
  const args = parseJsonObjectOption(readPipelineOption(pipeline, 'args-json'));
  return {
    actionId: 'run-sub-workflow',
    config: {
      target: workflowId ? 'published' : 'file',
      workflowId: workflowId ?? '',
      workflowRevision: numberPipelineOption(pipeline, 'workflow-revision') ?? numberPipelineOption(pipeline, 'workflowRevision'),
      file: file ?? '',
      argsJson: args ? JSON.stringify(args, null, 2) : '',
      passInput: Boolean(parseStepReference(step.stdin) || readPipelineOption(pipeline, 'input-key')),
    },
  };
}

function matchStepToAction(step: LobsterStep): { actionId: string; config: Record<string, unknown> } {
  const cmd = step.command ?? '';

  const workflowRef = matchWorkflowRef(step);
  if (workflowRef) return workflowRef;

  if (typeof step.workflow === 'string' && step.workflow.trim()) {
    const workflowArgs = workflowArgsWithoutInputEdge(step);
    return {
      actionId: 'run-sub-workflow',
      config: {
        target: 'file',
        workflowId: '',
        workflowRevision: undefined,
        file: step.workflow,
        argsJson: workflowArgs ? JSON.stringify(workflowArgs, null, 2) : '',
        passInput: Boolean(parseStepReference(step.workflow_args?.input)),
      },
    };
  }
  const nativeAction = matchOpenClawNativeAction(step);
  if (nativeAction) return nativeAction;
  if (step.approval === true || step.approval === 'required') {
    return { actionId: 'require-approval', config: { message: cmd } };
  }
  if (cmd.startsWith('openclaw agent invoke')) {
    const nameMatch = cmd.match(/--name\s+(\S+)/);
    const taskMatch = cmd.match(/--task\s+'([^']+)'/);
    return { actionId: 'call-agent', config: { agent: nameMatch?.[1] ?? '', task: taskMatch?.[1] ?? '' } };
  }
  if (cmd.startsWith('openclaw llm')) {
    const modelMatch = cmd.match(/--model\s+(\S+)/);
    const promptMatch = cmd.match(/--prompt\s+'([^']+)'/);
    return { actionId: 'prompt-llm', config: { model: modelMatch?.[1] ?? 'sonnet', prompt: promptMatch?.[1] ?? '' } };
  }
  if (cmd.startsWith('openclaw search')) {
    const queryMatch = cmd.match(/--query\s+'([^']+)'/);
    return { actionId: 'web-search', config: { query: queryMatch?.[1] ?? '', count: 5 } };
  }
  if (cmd.startsWith('openclaw fetch')) {
    const urlMatch = cmd.match(/--url\s+'([^']+)'/);
    return { actionId: 'web-fetch', config: { url: urlMatch?.[1] ?? '', mode: 'markdown' } };
  }
  if (cmd.startsWith('openclaw http')) {
    const methodMatch = cmd.match(/--method\s+(\S+)/);
    const urlMatch = cmd.match(/--url\s+'([^']+)'/);
    return { actionId: 'http-request', config: { method: methodMatch?.[1] ?? 'GET', url: urlMatch?.[1] ?? '', headers: '', body: '' } };
  }
  if (cmd.startsWith('openclaw flow wait')) {
    const durationMatch = cmd.match(/--duration\s+(\d+)/);
    const unitMatch = cmd.match(/--unit\s+(\S+)/);
    return { actionId: 'delay-wait', config: { duration: parseInt(durationMatch?.[1] ?? '5'), unit: unitMatch?.[1] ?? 'seconds' } };
  }
  if (cmd.startsWith('openclaw flow branch')) {
    const condMatch = cmd.match(/--condition\s+'([^']+)'/);
    return { actionId: 'conditional-branch', config: { condition: condMatch?.[1] ?? '' } };
  }
  if (cmd.startsWith('openclaw file read')) {
    const pathMatch = cmd.match(/--path\s+'([^']+)'/);
    return { actionId: 'read-file', config: { path: pathMatch?.[1] ?? '' } };
  }
  if (cmd.startsWith('openclaw file write')) {
    const pathMatch = cmd.match(/--path\s+'([^']+)'/);
    return { actionId: 'write-file', config: { path: pathMatch?.[1] ?? '' } };
  }
  if (cmd.startsWith('openclaw workflow run')) {
    const fileMatch = cmd.match(/--file\s+'([^']+)'/);
    return { actionId: 'run-sub-workflow', config: { file: fileMatch?.[1] ?? '' } };
  }
  if (cmd.startsWith('openclaw data set')) {
    const nameMatch = cmd.match(/--name\s+'([^']+)'/);
    const valueMatch = cmd.match(/--value\s+'([^']+)'/);
    return { actionId: 'set-variable', config: { name: nameMatch?.[1] ?? '', value: valueMatch?.[1] ?? '' } };
  }

  // Fallback
  return { actionId: 'run-shell-command', config: { command: cmd } };
}
