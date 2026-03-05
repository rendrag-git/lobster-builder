import { registerAction } from '../registry';
import type { ActionDefinition } from '../../types/actions';

const filterWhere: ActionDefinition = {
  id: 'filter-where',
  name: 'Filter: Where',
  category: 'data',
  icon: 'filter',
  description: 'Filter an array by a condition expression',
  inputs: [{ id: 'input', label: 'Array', kind: 'data' }],
  outputs: [{ id: 'output', label: 'Filtered', kind: 'data' }],
  configFields: [
    { id: 'condition', label: 'Condition', type: 'text', required: true, placeholder: 'item.status == "active"' },
  ],
  defaults: { condition: '' },
  compile: (config, ctx) => {
    const step: any = {
      id: ctx.nodeId,
      command: `openclaw data filter --condition '${config.condition}'`,
    };
    if (ctx.incomingEdges.length > 0) {
      step.stdin = `$${ctx.incomingEdges[0].sourceNodeId}.stdout`;
    }
    return [step];
  },
};

registerAction(filterWhere);
