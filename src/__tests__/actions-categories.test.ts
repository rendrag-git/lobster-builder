import { describe, it, expect } from 'vitest';
import { getAction, getActionsByCategory } from '../actions/init';
import type { CompileContext } from '../types/actions';

function compileContext(
  context: Omit<CompileContext, 'outgoingEdges'> & Partial<Pick<CompileContext, 'outgoingEdges'>>,
): CompileContext {
  return {
    ...context,
    outgoingEdges: context.outgoingEdges ?? [],
  };
}

describe('Flow actions', () => {
  it('registers 5 flow actions', () => {
    expect(getActionsByCategory('flow')).toHaveLength(5);
  });

  it('conditional-branch compiles with condition', () => {
    const action = getAction('conditional-branch');
    expect(action).toBeDefined();
    const steps = action!.compile(
      { condition: '${score} > 80' },
      { nodeId: 'n1', incomingEdges: [], outgoingEdges: [] },
    );
    expect(steps).toHaveLength(1);
    expect(steps[0].command).toBe('exec --shell "true"');
    // condition goes into flow rules when outgoing edges are connected; no flow when none connected
    expect(steps[0].flow).toBeUndefined();
  });

  it('delay-wait compiles with duration and unit', () => {
    const action = getAction('delay-wait');
    const steps = action!.compile(
      { duration: 30, unit: 'seconds' },
      { nodeId: 'n2', incomingEdges: [], outgoingEdges: [] },
    );
    expect(steps[0].command).toContain('30');
    expect(steps[0].command).toContain('seconds');
  });
});

describe('Data actions', () => {
  it('registers 5 data actions', () => {
    expect(getActionsByCategory('data')).toHaveLength(5);
  });

  it('set-variable compiles with name and value', () => {
    const action = getAction('set-variable');
    const steps = action!.compile(
      { name: 'result', value: '42' },
      { nodeId: 'n3', incomingEdges: [], outgoingEdges: [] },
    );
    expect(steps[0].command).toContain('result');
    expect(steps[0].command).toContain('42');
  });

  it('json-renderer compiles with template', () => {
    const action = getAction('json-renderer');
    const steps = action!.compile(
      { template: '{"msg":"${input}"}' },
      { nodeId: 'n4', incomingEdges: [], outgoingEdges: [] },
    );
    expect(steps[0].command).toContain('{"msg":"${input}"}');
  });
});

describe('IO actions', () => {
  it('registers 5 io actions', () => {
    expect(getActionsByCategory('io')).toHaveLength(5);
  });

  it('run-shell-command compiles with command', () => {
    const action = getAction('run-shell-command');
    const steps = action!.compile(
      { command: 'ls -la' },
      { nodeId: 'n5', incomingEdges: [], outgoingEdges: [] },
    );
    expect(steps[0].command).toContain('ls -la');
  });

  it('http-request compiles with method and url', () => {
    const action = getAction('http-request');
    const steps = action!.compile(
      { method: 'POST', url: 'https://api.example.com/data' },
      { nodeId: 'n6', incomingEdges: [], outgoingEdges: [] },
    );
    expect(steps[0].command).toContain('POST');
    expect(steps[0].command).toContain('https://api.example.com/data');
  });

  it('write-file passes stdin when incoming edge exists', () => {
    const action = getAction('write-file');
    const steps = action!.compile(
      { path: '/tmp/out.txt' },
      {
        nodeId: 'n7',
        incomingEdges: [{ sourceNodeId: 'n6', sourcePortId: 'output', targetPortId: 'input' }],
        outgoingEdges: [],
      },
    );
    expect(steps[0].stdin).toBe('$n6.stdout');
  });
});

describe('OpenClaw actions', () => {
  it('registers 5 OpenClaw native actions', () => {
    expect(getActionsByCategory('openclaw')).toHaveLength(5);
  });

  it('send-channel-message compiles to an OpenClaw message tool pipeline with permission metadata', () => {
    const action = getAction('send-channel-message');
    expect(action?.requiredTools).toEqual(['lobster', 'message']);
    const steps = action!.compile(
      { channel: 'discord', target: 'ops', message: 'done' },
      compileContext({ nodeId: 'notify', incomingEdges: [] }),
    );

    expect(steps[0]).toMatchObject({
      id: 'notify',
      pipeline: expect.stringContaining('openclaw.invoke'),
      openclaw_action: {
        tool: 'message',
        action: 'send',
        args: { provider: 'discord', to: 'ops', message: 'done' },
        requiredTools: ['lobster', 'message'],
      },
    });
    expect(steps[0].pipeline).toContain("--tool 'message'");
    expect(steps[0].pipeline).toContain("--action 'send'");
  });

  it('send-channel-message can map upstream output into the message body', () => {
    const action = getAction('send-channel-message');
    const steps = action!.compile(
      { channel: 'discord', target: 'ops', message: '', useInputAsMessage: true },
      compileContext({
        nodeId: 'notify',
        incomingEdges: [{ sourceNodeId: 'build', sourcePortId: 'output', targetPortId: 'input' }],
      }),
    );

    expect(steps[0].stdin).toBe('$build.stdout');
    expect(steps[0].pipeline).toContain('--each');
    expect(steps[0].pipeline).toContain("--item-key 'message'");
  });

  it('openclaw-tool-call compiles generic tool args and validates JSON objects', () => {
    const action = getAction('openclaw-tool-call');
    const steps = action!.compile(
      { tool: 'github', action: 'search', argsJson: '{"query":"repo:openclaw/openclaw lobster"}' },
      compileContext({ nodeId: 'tool', incomingEdges: [] }),
    );

    expect(steps[0].openclaw_action).toEqual({
      tool: 'github',
      action: 'search',
      args: { query: 'repo:openclaw/openclaw lobster' },
      requiredTools: ['lobster', 'github'],
    });
    expect(() =>
      action!.compile(
        { tool: 'github', action: 'search', argsJson: '[]' },
        compileContext({ nodeId: 'bad', incomingEdges: [] }),
      ),
    ).toThrow(/Args JSON must be a JSON object/);
  });

  it('llm-json-task compiles to the OpenClaw llm-task tool with schema metadata', () => {
    const action = getAction('llm-json-task');
    expect(action?.requiredTools).toEqual(['lobster', 'llm-task']);
    const steps = action!.compile(
      {
        prompt: 'Return intent and draft.',
        inputJson: '{"subject":"Hello"}',
        schemaJson: '{"type":"object","required":["intent"]}',
        model: 'gpt-5.2',
        thinking: 'low',
        maxTokens: 800,
      },
      compileContext({ nodeId: 'classify', incomingEdges: [] }),
    );

    expect(steps[0]).toMatchObject({
      id: 'classify',
      pipeline: expect.stringContaining('openclaw.invoke'),
      openclaw_action: {
        tool: 'llm-task',
        action: 'json',
        args: {
          prompt: 'Return intent and draft.',
          input: { subject: 'Hello' },
          schema: { type: 'object', required: ['intent'] },
          model: 'gpt-5.2',
          thinking: 'low',
          maxTokens: 800,
        },
        requiredTools: ['lobster', 'llm-task'],
      },
    });
  });

  it('llm-json-task rejects invalid input and schema JSON before export', () => {
    const action = getAction('llm-json-task');

    expect(() =>
      action!.compile(
        { prompt: 'Return JSON.', inputJson: '[]' },
        compileContext({ nodeId: 'bad-input', incomingEdges: [] }),
      ),
    ).toThrow(/Input JSON must be a JSON object/);

    expect(() =>
      action!.compile(
        { prompt: 'Return JSON.', schemaJson: '{' },
        compileContext({ nodeId: 'bad-schema', incomingEdges: [] }),
      ),
    ).toThrow(/Schema JSON must be valid JSON/);
  });

  it('llm-json-task can map upstream output into the llm-task input arg', () => {
    const action = getAction('llm-json-task');
    const steps = action!.compile(
      { prompt: 'Summarize input.', useInputAsInput: true },
      compileContext({
        nodeId: 'classify',
        incomingEdges: [{ sourceNodeId: 'collect', sourcePortId: 'output', targetPortId: 'input' }],
      }),
    );

    expect(steps[0].stdin).toBe('$collect.stdout');
    expect(steps[0].pipeline).toContain('--each');
    expect(steps[0].pipeline).toContain("--item-key 'input'");
    expect(steps[0].openclaw_action?.args).toEqual({ prompt: 'Summarize input.' });
  });

  it('run-agent compiles to the OpenClaw sessions_spawn tool with agent args', () => {
    const action = getAction('run-agent');
    expect(action?.requiredTools).toEqual(['lobster', 'sessions_spawn']);
    const steps = action!.compile(
      {
        agentId: 'researcher',
        task: 'Investigate the customer record.',
        taskName: 'investigate_customer',
        runtime: 'subagent',
        mode: 'run',
        model: 'gpt-5.4',
        thinking: 'high',
        runTimeoutSeconds: 120,
      },
      compileContext({ nodeId: 'delegate', incomingEdges: [] }),
    );

    expect(steps[0]).toMatchObject({
      id: 'delegate',
      pipeline: expect.stringContaining('openclaw.invoke'),
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
    });
    expect(steps[0].pipeline).toContain("--tool 'sessions_spawn'");
    expect(steps[0].pipeline).toContain("--action 'spawn'");
  });

  it('run-agent keeps upstream context wiring as stdin metadata', () => {
    const action = getAction('run-agent');
    const steps = action!.compile(
      { task: 'Use the attached context.' },
      compileContext({
        nodeId: 'delegate',
        incomingEdges: [{ sourceNodeId: 'collect', sourcePortId: 'output', targetPortId: 'input' }],
      }),
    );

    expect(steps[0].stdin).toBe('$collect.stdout');
  });

  it('node-action compiles to the OpenClaw nodes invoke surface', () => {
    const action = getAction('node-action');
    expect(action?.requiredTools).toEqual(['lobster', 'nodes']);
    const steps = action!.compile(
      {
        node: 'macbook',
        command: 'device.status',
        paramsJson: '{"includeBattery":true}',
        timeoutMs: 5000,
      },
      compileContext({ nodeId: 'node-status', incomingEdges: [] }),
    );

    expect(steps[0]).toMatchObject({
      id: 'node-status',
      pipeline: expect.stringContaining('openclaw.invoke'),
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
    });
    expect(steps[0].pipeline).toContain("--tool 'nodes'");
    expect(steps[0].pipeline).toContain("--action 'invoke'");
    expect(() =>
      action!.compile(
        { node: 'macbook', command: 'device.status', paramsJson: '[]' },
        compileContext({ nodeId: 'bad-node', incomingEdges: [] }),
      ),
    ).toThrow(/Params JSON must be a JSON object/);
  });

  it('node-action preserves incoming edge wiring for ordered native node steps', () => {
    const action = getAction('node-action');
    const steps = action!.compile(
      { node: 'macbook', command: 'device.status', paramsJson: '{}' },
      compileContext({
        nodeId: 'node-status',
        incomingEdges: [{ sourceNodeId: 'delegate', sourcePortId: 'output', targetPortId: 'input' }],
      }),
    );

    expect(steps[0].stdin).toBe('$delegate.stdout');
  });

  it('node-action validates params JSON variants before export', () => {
    const action = getAction('node-action');

    const nestedSteps = action!.compile(
      {
        node: 'macbook',
        command: 'device.status',
        paramsJson: '{"nested":{"ok":true},"items":[1,2]}',
      },
      compileContext({ nodeId: 'nested-node', incomingEdges: [] }),
    );
    expect(nestedSteps[0]!.openclaw_action!.args!.invokeParamsJson).toBe('{"nested":{"ok":true},"items":[1,2]}');

    const emptySteps = action!.compile(
      { node: 'macbook', command: 'device.status', paramsJson: '{}' },
      compileContext({ nodeId: 'empty-node', incomingEdges: [] }),
    );
    expect(emptySteps[0]!.openclaw_action!.args!.invokeParamsJson).toBe('{}');

    expect(() =>
      action!.compile(
        { node: 'macbook', command: 'device.status', paramsJson: '{' },
        compileContext({ nodeId: 'bad-node', incomingEdges: [] }),
      ),
    ).toThrow(/Params JSON must be valid JSON/);
  });
});

describe('Meta actions', () => {
  it('registers 1 meta action', () => {
    expect(getActionsByCategory('meta')).toHaveLength(1);
  });

  it('run-sub-workflow compiles with file', () => {
    const action = getAction('run-sub-workflow');
    const steps = action!.compile(
      { target: 'file', file: 'workflows/process-order.lobster', argsJson: '{"orderId":"$lookup.json.id"}' },
      { nodeId: 'n8', incomingEdges: [], outgoingEdges: [] },
    );
    expect(steps[0].pipeline).toBe("lobster.workflow --file 'workflows/process-order.lobster' --args-json '{\"orderId\":\"$lookup.json.id\"}'");
    expect(steps[0].openclaw_workflow_ref).toEqual({
      target: 'file',
      file: 'workflows/process-order.lobster',
      args: { orderId: '$lookup.json.id' },
    });
  });

  it('run-sub-workflow compiles with a published workflow id and revision', () => {
    const action = getAction('run-sub-workflow');
    const steps = action!.compile(
      { target: 'published', workflowId: 'process-order', workflowRevision: 3, argsJson: '{"orderId":"$lookup.json.id"}' },
      compileContext({ nodeId: 'n8', incomingEdges: [] }),
    );
    expect(steps[0].pipeline).toBe("lobster.workflow --workflow-id 'process-order' --workflow-revision '3' --args-json '{\"orderId\":\"$lookup.json.id\"}'");
    expect(steps[0].openclaw_workflow_ref).toEqual({
      target: 'published',
      workflowId: 'process-order',
      workflowRevision: 3,
      args: { orderId: '$lookup.json.id' },
    });
  });

  it('run-sub-workflow can pass upstream output as workflow arg', () => {
    const action = getAction('run-sub-workflow');
    const steps = action!.compile(
      { target: 'published', workflowId: 'child-flow', passInput: true },
      compileContext({
        nodeId: 'n9',
        incomingEdges: [{ sourceNodeId: 'prepare', sourcePortId: 'output', targetPortId: 'input' }],
      }),
    );
    expect(steps[0].stdin).toBe('$prepare.stdout');
    expect(steps[0].pipeline).toBe("lobster.workflow --workflow-id 'child-flow' --input-key 'input'");
    expect(steps[0].openclaw_workflow_ref).toEqual({
      target: 'published',
      workflowId: 'child-flow',
      inputKey: 'input',
    });
  });
});
