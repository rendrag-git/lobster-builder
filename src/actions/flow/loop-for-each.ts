import { registerAction } from '../registry';
import type { ActionDefinition } from '../../types/actions';
import type { FlowRule } from '../../types/lobster';

const loopForEach: ActionDefinition = {
  id: 'loop-for-each',
  name: 'While Loop',
  category: 'flow',
  icon: 'repeat',
  description: 'Loops until an exit condition is true. Uses Lobster flow directives with a self-referential default.',
  inputs: [{ id: 'input', label: 'Input', kind: 'data' }],
  outputs: [
    { id: 'done', label: 'Done', kind: 'trigger' },
  ],
  configFields: [
    {
      id: 'exitCondition',
      label: 'Exit Condition',
      type: 'text',
      placeholder: '$my_step.json.done == true',
      description: 'Lobster condition that exits the loop. Leave empty for infinite loop (capped by Max Iterations).',
    },
    {
      id: 'maxIterations',
      label: 'Max Iterations',
      type: 'number',
      defaultValue: 10,
    },
  ],
  defaults: { exitCondition: '', maxIterations: 10 },
  compile: (config, ctx) => {
    const doneTarget = ctx.outgoingEdges.find((e) => e.sourcePortId === 'done')?.targetNodeId;
    const maxIter = typeof config.maxIterations === 'number' ? config.maxIterations : 10;

    const flow: FlowRule[] = [];
    if (config.exitCondition && doneTarget) {
      flow.push({ when: String(config.exitCondition), goto: doneTarget });
    }
    flow.push({ default: ctx.nodeId });

    return [{
      id: ctx.nodeId,
      command: 'exec --shell "true"',
      max_iterations: maxIter,
      flow,
      ...(ctx.incomingEdges.length > 0
        ? { stdin: `$${ctx.incomingEdges[0].sourceNodeId}.stdout` }
        : {}),
    }];
  },
};

registerAction(loopForEach);
