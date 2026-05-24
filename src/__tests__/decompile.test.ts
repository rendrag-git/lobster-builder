import { describe, it, expect } from 'vitest';
import { decompileWorkflow } from '../compiler/decompile';
import type { WorkflowNodeData } from '../types/graph';

describe('decompiler', () => {
  it('converts a simple workflow to canvas nodes', () => {
    const workflow = {
      name: 'test',
      steps: [
        { id: 'step1', command: 'echo hello' },
      ],
    };
    const { nodes, meta } = decompileWorkflow(workflow);
    expect(nodes).toHaveLength(1);
    expect(nodes[0].data.actionId).toBe('run-shell-command');
    expect(meta.name).toBe('test');
  });

  it('creates edges from stdin references', () => {
    const workflow = {
      name: 'piped',
      steps: [
        { id: 'a', command: 'echo hello' },
        { id: 'b', command: 'cat', stdin: '$a.stdout' },
      ],
    };
    const { nodes, edges } = decompileWorkflow(workflow);
    expect(nodes).toHaveLength(2);
    expect(edges).toHaveLength(1);
    expect(edges[0].source).toBe('a');
    expect(edges[0].target).toBe('b');
  });

  it('recognizes approval steps', () => {
    const workflow = {
      name: 'approval-test',
      steps: [
        { id: 'review', command: 'cat report.json', approval: 'required' as const },
      ],
    };
    const { nodes } = decompileWorkflow(workflow);
    expect(nodes[0].data.actionId).toBe('require-approval');
  });

  it('recognizes native Lobster workflow steps', () => {
    const workflow = {
      name: 'parent',
      steps: [
        { id: 'child', workflow: 'child.lobster', workflow_args: { customer: '$lookup.json.id' } },
      ],
    };
    const { nodes } = decompileWorkflow(workflow);
    expect(nodes[0].type).toBe('workflowNode');
    expect(nodes[0].data.actionId).toBe('run-sub-workflow');
    expect((nodes[0].data as WorkflowNodeData).config).toEqual({
      target: 'file',
      workflowId: '',
      workflowRevision: undefined,
      file: 'child.lobster',
      argsJson: '{\n  "customer": "$lookup.json.id"\n}',
      passInput: false,
    });
  });

  it('recognizes executable published workflow reference steps', () => {
    const workflow = {
      name: 'parent',
      steps: [
        {
          id: 'child',
          pipeline: "lobster.workflow --workflow-id 'child-flow' --workflow-revision '2' --args-json '{\"customer\":\"$lookup.json.id\"}'",
          openclaw_workflow_ref: {
            target: 'published' as const,
            workflowId: 'child-flow',
            workflowRevision: 2,
            args: { customer: '$lookup.json.id' },
          },
        },
      ],
    };
    const { nodes } = decompileWorkflow(workflow);
    expect(nodes[0].data.actionId).toBe('run-sub-workflow');
    expect((nodes[0].data as WorkflowNodeData).config).toEqual({
      target: 'published',
      workflowId: 'child-flow',
      workflowRevision: 2,
      file: '',
      argsJson: '{\n  "customer": "$lookup.json.id"\n}',
      passInput: false,
    });
  });

  it('restores Run Sub-Workflow input edges from workflow_args.input', () => {
    const workflow = {
      name: 'parent',
      steps: [
        { id: 'lookup', command: 'echo customer' },
        {
          id: 'child',
          workflow: 'child.lobster',
          workflow_args: {
            customer: '$lookup.json.id',
            input: '$lookup.stdout',
          },
        },
      ],
    };

    const { nodes, edges } = decompileWorkflow(workflow);
    expect(nodes).toHaveLength(2);
    expect(edges).toEqual([
      expect.objectContaining({
        source: 'lookup',
        sourceHandle: 'stdout',
        target: 'child',
        targetHandle: 'input',
      }),
    ]);
    expect((nodes[1].data as WorkflowNodeData).config).toEqual({
      target: 'file',
      workflowId: '',
      workflowRevision: undefined,
      file: 'child.lobster',
      argsJson: '{\n  "customer": "$lookup.json.id"\n}',
      passInput: true,
    });
  });

  it('recognizes structured OpenClaw native message steps', () => {
    const workflow = {
      name: 'notify',
      steps: [
        {
          id: 'notify',
          pipeline: 'openclaw.invoke --tool \'message\' --action \'send\' --args-json \'{"provider":"discord","to":"ops","message":"done"}\'',
          openclaw_action: {
            tool: 'message',
            action: 'send',
            args: { provider: 'discord', to: 'ops', message: 'done' },
            requiredTools: ['lobster', 'message'],
          },
        },
      ],
    };

    const { nodes } = decompileWorkflow(workflow);
    expect(nodes[0].data.actionId).toBe('send-channel-message');
    expect((nodes[0].data as WorkflowNodeData).config).toEqual({
      channel: 'discord',
      target: 'ops',
      message: 'done',
      useInputAsMessage: false,
    });
  });

  it('falls back unknown OpenClaw native steps to the generic tool call block', () => {
    const workflow = {
      name: 'tool-call',
      steps: [
        {
          id: 'tool',
          openclaw_action: {
            tool: 'github',
            action: 'search',
            args: { query: 'lobster' },
            requiredTools: ['lobster', 'github'],
          },
          pipeline: 'openclaw.invoke --tool \'github\' --action \'search\' --args-json \'{"query":"lobster"}\'',
        },
      ],
    };

    const { nodes } = decompileWorkflow(workflow);
    expect(nodes[0].data.actionId).toBe('openclaw-tool-call');
    expect((nodes[0].data as WorkflowNodeData).config).toEqual({
      tool: 'github',
      action: 'search',
      argsJson: '{\n  "query": "lobster"\n}',
      mapInput: false,
      itemKey: 'item',
    });
  });

  it('recognizes structured OpenClaw LLM JSON Task steps', () => {
    const workflow = {
      name: 'classify',
      steps: [
        {
          id: 'classify',
          openclaw_action: {
            tool: 'llm-task',
            action: 'json',
            args: {
              prompt: 'Return JSON.',
              input: { subject: 'Hello' },
              schema: { type: 'object', required: ['intent'] },
              model: 'gpt-5.2',
              thinking: 'low',
              maxTokens: 800,
            },
            requiredTools: ['lobster', 'llm-task'],
          },
          pipeline: 'openclaw.invoke --tool \'llm-task\' --action \'json\' --args-json \'{"prompt":"Return JSON."}\'',
        },
      ],
    };

    const { nodes } = decompileWorkflow(workflow);
    expect(nodes[0].data.actionId).toBe('llm-json-task');
    expect((nodes[0].data as WorkflowNodeData).config).toEqual({
      prompt: 'Return JSON.',
      inputJson: '{\n  "subject": "Hello"\n}',
      useInputAsInput: false,
      schemaJson: '{\n  "type": "object",\n  "required": [\n    "intent"\n  ]\n}',
      provider: '',
      model: 'gpt-5.2',
      thinking: 'low',
      authProfileId: '',
      temperature: undefined,
      maxTokens: 800,
      timeoutMs: undefined,
    });
  });

  it('restores LLM JSON Task input wiring from stdin and pipeline mapping', () => {
    const workflow = {
      name: 'classify-upstream',
      steps: [
        {
          id: 'collect',
          command: 'printf "{}"',
        },
        {
          id: 'classify',
          stdin: '$collect.stdout',
          openclaw_action: {
            tool: 'llm-task',
            action: 'json',
            args: {
              prompt: 'Summarize input.',
            },
            requiredTools: ['lobster', 'llm-task'],
          },
          pipeline: 'openclaw.invoke --tool \'llm-task\' --action \'json\' --args-json \'{"prompt":"Summarize input."}\' --each --item-key \'input\'',
        },
      ],
    };

    const { nodes, edges } = decompileWorkflow(workflow);
    expect(edges).toHaveLength(1);
    expect(edges[0]).toMatchObject({ source: 'collect', target: 'classify' });
    expect(nodes[1].data.actionId).toBe('llm-json-task');
    expect((nodes[1].data as WorkflowNodeData).config).toMatchObject({
      prompt: 'Summarize input.',
      useInputAsInput: true,
    });
  });

  it('recognizes OpenClaw native tool calls from generated pipeline text', () => {
    const workflow = {
      name: 'pipeline-only',
      steps: [
        {
          id: 'notify',
          pipeline: 'openclaw.invoke --tool \'message\' --action \'send\' --args-json \'{"provider":"discord","to":"ops","message":"done"}\'',
        },
      ],
    };

    const { nodes } = decompileWorkflow(workflow);
    expect(nodes[0].data.actionId).toBe('send-channel-message');
  });

  it('recognizes structured OpenClaw Run Agent steps', () => {
    const workflow = {
      name: 'delegate',
      steps: [
        {
          id: 'delegate',
          openclaw_action: {
            tool: 'sessions_spawn',
            action: 'spawn',
            args: {
              agentId: 'researcher',
              task: 'Investigate the customer record.',
              taskName: 'investigate_customer',
              runtime: 'subagent',
              mode: 'run',
              model: 'gpt-5.4',
              thinking: 'high',
              runTimeoutSeconds: 120,
            },
            requiredTools: ['lobster', 'sessions_spawn'],
          },
          pipeline: 'openclaw.invoke --tool \'sessions_spawn\' --action \'spawn\' --args-json \'{"task":"Investigate the customer record."}\'',
        },
      ],
    };

    const { nodes } = decompileWorkflow(workflow);
    expect(nodes[0].data.actionId).toBe('run-agent');
    expect((nodes[0].data as WorkflowNodeData).config).toMatchObject({
      agentId: 'researcher',
      task: 'Investigate the customer record.',
      taskName: 'investigate_customer',
      runtime: 'subagent',
      mode: 'run',
      model: 'gpt-5.4',
      thinking: 'high',
      runTimeoutSeconds: 120,
    });
  });

  it('recognizes structured OpenClaw Node Action steps', () => {
    const workflow = {
      name: 'node',
      steps: [
        {
          id: 'node-status',
          openclaw_action: {
            tool: 'nodes',
            action: 'invoke',
            args: {
              node: 'macbook',
              invokeCommand: 'device.status',
              invokeParamsJson: '{"includeBattery":true}',
              invokeTimeoutMs: 5000,
            },
            requiredTools: ['lobster', 'nodes'],
          },
          pipeline: 'openclaw.invoke --tool \'nodes\' --action \'invoke\' --args-json \'{"node":"macbook"}\'',
        },
      ],
    };

    const { nodes } = decompileWorkflow(workflow);
    expect(nodes[0].data.actionId).toBe('node-action');
    expect((nodes[0].data as WorkflowNodeData).config).toEqual({
      node: 'macbook',
      command: 'device.status',
      paramsJson: '{\n  "includeBattery": true\n}',
      timeoutMs: 5000,
    });
  });

  it('falls back to run-shell-command for unknown patterns', () => {
    const workflow = {
      name: 'unknown',
      steps: [
        { id: 'weird', command: 'some-custom-binary --flag' },
      ],
    };
    const { nodes } = decompileWorkflow(workflow);
    expect(nodes[0].data.actionId).toBe('run-shell-command');
    expect((nodes[0].data as WorkflowNodeData).config.command).toBe('some-custom-binary --flag');
  });
});
