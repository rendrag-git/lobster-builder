import { describe, it, expect } from 'vitest';
import { getAction, getActionsByCategory } from '../actions/init';

describe('AI actions', () => {
  it('registers all 5 AI actions', () => {
    const aiActions = getActionsByCategory('ai');
    expect(aiActions).toHaveLength(5);
  });

  it('call-agent compiles correctly', () => {
    const action = getAction('call-agent');
    expect(action).toBeDefined();
    const steps = action!.compile(
      { agent: 'soren', task: 'review this PR' },
      { nodeId: 'n1', incomingEdges: [] },
    );
    expect(steps).toHaveLength(1);
    expect(steps[0].command).toContain('soren');
    expect(steps[0].command).toContain('review this PR');
  });

  it('prompt-llm compiles with model and prompt', () => {
    const action = getAction('prompt-llm');
    const steps = action!.compile(
      { model: 'sonnet', prompt: 'summarize this' },
      { nodeId: 'n2', incomingEdges: [] },
    );
    expect(steps).toHaveLength(1);
    expect(steps[0].command).toContain('sonnet');
    expect(steps[0].command).toContain('summarize this');
  });

  it('web-search compiles with query', () => {
    const action = getAction('web-search');
    const steps = action!.compile(
      { query: 'lobster workflow engine', count: 5 },
      { nodeId: 'n3', incomingEdges: [] },
    );
    expect(steps).toHaveLength(1);
    expect(steps[0].command).toContain('lobster workflow engine');
  });

  it('compiles with stdin when incoming edge exists', () => {
    const action = getAction('prompt-llm');
    const steps = action!.compile(
      { model: 'sonnet', prompt: 'summarize: ${input}' },
      {
        nodeId: 'n2',
        incomingEdges: [{ sourceNodeId: 'n1', sourcePortId: 'output', targetPortId: 'input' }],
      },
    );
    expect(steps).toHaveLength(1);
    expect(steps[0].stdin).toBe('$n1.stdout');
  });
});
