import { describe, it, expect } from 'vitest';
import { getAction, getActionsByCategory } from '../actions/init';

describe('Flow actions', () => {
  it('registers 5 flow actions', () => {
    expect(getActionsByCategory('flow')).toHaveLength(5);
  });

  it('conditional-branch compiles with condition', () => {
    const action = getAction('conditional-branch');
    expect(action).toBeDefined();
    const steps = action!.compile(
      { condition: '${score} > 80' },
      { nodeId: 'n1', incomingEdges: [] },
    );
    expect(steps).toHaveLength(1);
    expect(steps[0].command).toContain('${score} > 80');
  });

  it('delay-wait compiles with duration and unit', () => {
    const action = getAction('delay-wait');
    const steps = action!.compile(
      { duration: 30, unit: 'seconds' },
      { nodeId: 'n2', incomingEdges: [] },
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
      { nodeId: 'n3', incomingEdges: [] },
    );
    expect(steps[0].command).toContain('result');
    expect(steps[0].command).toContain('42');
  });

  it('json-renderer compiles with template', () => {
    const action = getAction('json-renderer');
    const steps = action!.compile(
      { template: '{"msg":"${input}"}' },
      { nodeId: 'n4', incomingEdges: [] },
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
      { nodeId: 'n5', incomingEdges: [] },
    );
    expect(steps[0].command).toContain('ls -la');
  });

  it('http-request compiles with method and url', () => {
    const action = getAction('http-request');
    const steps = action!.compile(
      { method: 'POST', url: 'https://api.example.com/data' },
      { nodeId: 'n6', incomingEdges: [] },
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
      },
    );
    expect(steps[0].stdin).toBe('$n6.stdout');
  });
});

describe('Meta actions', () => {
  it('registers 1 meta action', () => {
    expect(getActionsByCategory('meta')).toHaveLength(1);
  });

  it('run-sub-workflow compiles with file', () => {
    const action = getAction('run-sub-workflow');
    const steps = action!.compile(
      { file: 'workflows/process-order.lobster' },
      { nodeId: 'n8', incomingEdges: [] },
    );
    expect(steps[0].command).toContain('process-order.lobster');
  });
});
