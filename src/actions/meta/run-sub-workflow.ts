import { registerAction } from '../registry';
import type { ActionDefinition } from '../../types/actions';

const runSubWorkflow: ActionDefinition = {
  id: 'run-sub-workflow',
  name: 'Run Sub-Workflow',
  category: 'meta',
  icon: 'workflow',
  description: 'Execute another Lobster workflow file as a sub-process',
  inputs: [{ id: 'input', label: 'Input', kind: 'any' }],
  outputs: [{ id: 'output', label: 'Result', kind: 'any' }],
  configFields: [
    {
      id: 'file',
      label: 'Workflow File',
      type: 'text',
      placeholder: 'workflows/my-workflow.lobster',
      description: 'Path to .lobster file. Takes precedence over Name if both set.',
    },
    {
      id: 'name',
      label: 'Workflow Name',
      type: 'text',
      placeholder: 'my-workflow',
      description: 'Alternative to File path. Mutually exclusive — File takes precedence if both set.',
    },
    {
      id: 'argsJson',
      label: 'Args JSON',
      type: 'textarea',
      placeholder: '{"key": "$prev_step.json.value"}',
      description: 'Pass data to child workflow. Use Lobster ref syntax for dynamic values.',
    },
  ],
  defaults: { file: '', name: '', argsJson: '' },
  compile: (config, _ctx) => {
    const target = config.file
      ? `--file '${config.file}'`
      : config.name
      ? `--name '${config.name}'`
      : `--name ???`;

    const argsFlag = config.argsJson
      ? ` --args-json '${config.argsJson}'`
      : '';

    return [{
      id: _ctx.nodeId,
      command: `lobster.run ${target}${argsFlag}`,
    }];
  },
};

registerAction(runSubWorkflow);
