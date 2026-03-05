import { registerAction } from '../registry';
import type { ActionDefinition } from '../../types/actions';

const delayWait: ActionDefinition = {
  id: 'delay-wait',
  name: 'Delay / Wait',
  category: 'flow',
  icon: 'clock',
  description: 'Pause execution for a specified duration',
  inputs: [],
  outputs: [{ id: 'output', label: 'Done', kind: 'trigger' }],
  configFields: [
    { id: 'duration', label: 'Duration', type: 'number' },
    {
      id: 'unit', label: 'Unit', type: 'select',
      options: [
        { label: 'Seconds', value: 'seconds' },
        { label: 'Minutes', value: 'minutes' },
        { label: 'Hours', value: 'hours' },
      ],
    },
  ],
  defaults: { duration: 5, unit: 'seconds' },
  compile: (config, ctx) => [{
    id: ctx.nodeId,
    command: `openclaw flow wait --duration ${config.duration} --unit ${config.unit ?? 'seconds'}`,
  }],
};

registerAction(delayWait);
