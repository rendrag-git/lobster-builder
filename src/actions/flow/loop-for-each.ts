import { registerAction } from '../registry';
import type { ActionDefinition } from '../../types/actions';

const loopForEach: ActionDefinition = {
  id: 'loop-for-each',
  name: 'Loop: For Each',
  category: 'flow',
  icon: 'repeat',
  description: 'Iterate over a list and run a sub-workflow for each item',
  inputs: [{ id: 'input', label: 'Items', kind: 'data' }],
  outputs: [
    { id: 'item', label: 'Current Item', kind: 'data' },
    { id: 'done', label: 'Done', kind: 'trigger' },
  ],
  configFields: [
    { id: 'variable', label: 'Item Variable Name', type: 'text', placeholder: 'item' },
  ],
  defaults: { variable: 'item' },
  compile: (config, ctx) => {
    const step: any = {
      id: ctx.nodeId,
      command: `openclaw flow foreach --variable '${config.variable ?? 'item'}'`,
    };
    if (ctx.incomingEdges.length > 0) {
      step.stdin = `$${ctx.incomingEdges[0].sourceNodeId}.stdout`;
    }
    return [step];
  },
};

registerAction(loopForEach);
