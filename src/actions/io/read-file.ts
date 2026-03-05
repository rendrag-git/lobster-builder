import { registerAction } from '../registry';
import type { ActionDefinition } from '../../types/actions';

const readFile: ActionDefinition = {
  id: 'read-file',
  name: 'Read File',
  category: 'io',
  icon: 'file-text',
  description: 'Read the contents of a file',
  inputs: [],
  outputs: [{ id: 'output', label: 'Contents', kind: 'text' }],
  configFields: [
    { id: 'path', label: 'File Path', type: 'text', required: true, placeholder: '/path/to/file.txt' },
    {
      id: 'encoding', label: 'Encoding', type: 'select',
      options: [
        { label: 'UTF-8', value: 'utf8' },
        { label: 'Base64', value: 'base64' },
      ],
    },
  ],
  defaults: { path: '', encoding: 'utf8' },
  compile: (config, ctx) => [{
    id: ctx.nodeId,
    command: `openclaw file read --path '${config.path}' --encoding ${config.encoding ?? 'utf8'}`,
  }],
};

registerAction(readFile);
