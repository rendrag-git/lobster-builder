import { registerAction } from '../registry';
import type { ActionDefinition } from '../../types/actions';

const writeFile: ActionDefinition = {
  id: 'write-file',
  name: 'Write File',
  category: 'io',
  icon: 'file-plus',
  description: 'Write content to a file on disk',
  inputs: [{ id: 'input', label: 'Content', kind: 'text' }],
  outputs: [{ id: 'output', label: 'Path', kind: 'text' }],
  configFields: [
    { id: 'path', label: 'File Path', type: 'text', required: true, placeholder: '/path/to/output.txt' },
    {
      id: 'mode', label: 'Write Mode', type: 'select',
      options: [
        { label: 'Overwrite', value: 'overwrite' },
        { label: 'Append', value: 'append' },
      ],
    },
  ],
  defaults: { path: '', mode: 'overwrite' },
  compile: (config, ctx) => {
    const step: any = {
      id: ctx.nodeId,
      command: `openclaw file write --path '${config.path}' --mode ${config.mode ?? 'overwrite'}`,
    };
    if (ctx.incomingEdges.length > 0) {
      step.stdin = `$${ctx.incomingEdges[0].sourceNodeId}.stdout`;
    }
    return [step];
  },
};

registerAction(writeFile);
