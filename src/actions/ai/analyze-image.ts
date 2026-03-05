import { registerAction } from '../registry';
import type { ActionDefinition } from '../../types/actions';

const analyzeImage: ActionDefinition = {
  id: 'analyze-image',
  name: 'Analyze Image',
  category: 'ai',
  icon: 'image',
  description: 'Analyze an image using a vision model',
  inputs: [{ id: 'input', label: 'Image Path', kind: 'text' }],
  outputs: [{ id: 'output', label: 'Analysis', kind: 'text' }],
  configFields: [
    { id: 'path', label: 'Image Path or URL', type: 'text' },
    { id: 'prompt', label: 'Analysis Prompt', type: 'textarea', required: true, placeholder: 'What to look for...' },
  ],
  defaults: { path: '', prompt: 'Describe this image' },
  compile: (config, ctx) => [{
    id: ctx.nodeId,
    command: `openclaw image --path '${config.path}' --prompt '${config.prompt}'`,
  }],
};

registerAction(analyzeImage);
