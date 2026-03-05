import { registerAction } from '../registry';
import type { ActionDefinition } from '../../types/actions';

const mergeJoin: ActionDefinition = {
  id: 'merge-join',
  name: 'Merge / Join',
  category: 'data',
  icon: 'merge',
  description: 'Combine multiple upstream outputs into one object',
  inputs: [
    { id: 'left', label: 'Left', kind: 'any' },
    { id: 'right', label: 'Right', kind: 'any' },
  ],
  outputs: [{ id: 'output', label: 'Merged', kind: 'data' }],
  configFields: [
    {
      id: 'strategy', label: 'Strategy', type: 'select',
      options: [
        { label: 'Object Spread', value: 'spread' },
        { label: 'Array Concat', value: 'concat' },
      ],
    },
  ],
  defaults: { strategy: 'spread' },
  compile: (config, ctx) => [{
    id: ctx.nodeId,
    command: `openclaw data merge --strategy ${config.strategy ?? 'spread'}`,
    ...(ctx.incomingEdges.length > 0
      ? { stdin: ctx.incomingEdges.map((e) => `$${e.sourceNodeId}.stdout`).join(' ') }
      : {}),
  }],
};

registerAction(mergeJoin);
