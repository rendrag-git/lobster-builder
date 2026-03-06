import { registerAction } from '../registry';
import type { ActionDefinition } from '../../types/actions';
import type { FlowRule } from '../../types/lobster';

const conditionalBranch: ActionDefinition = {
  id: 'conditional-branch',
  name: 'Conditional Branch',
  category: 'flow',
  icon: 'git-branch',
  description: 'Route execution based on a condition',
  inputs: [{ id: 'input', label: 'Value', kind: 'any' }],
  outputs: [
    { id: 'true', label: 'True', kind: 'any' },
    { id: 'false', label: 'False', kind: 'any' },
  ],
  configFields: [
    {
      id: 'condition',
      label: 'Condition',
      type: 'text',
      required: true,
      placeholder: '$prev_step.json.score > 80',
      description: 'Lobster condition syntax: $stepId.json.field operator value',
    },
  ],
  defaults: { condition: '' },
  compile: (config, ctx) => {
    const trueTarget = ctx.outgoingEdges.find((e) => e.sourcePortId === 'true')?.targetNodeId;
    const falseTarget = ctx.outgoingEdges.find((e) => e.sourcePortId === 'false')?.targetNodeId;

    const flow: FlowRule[] = [];
    if (config.condition && trueTarget) {
      flow.push({ when: String(config.condition), goto: trueTarget });
    }
    if (falseTarget) {
      flow.push({ default: falseTarget });
    }

    return [{
      id: ctx.nodeId,
      command: 'exec --shell "true"',
      ...(flow.length > 0 ? { flow } : {}),
      ...(ctx.incomingEdges.length > 0
        ? { stdin: `$${ctx.incomingEdges[0].sourceNodeId}.stdout` }
        : {}),
    }];
  },
};

registerAction(conditionalBranch);
