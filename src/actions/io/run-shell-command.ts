import { registerAction } from '../registry';
import type { ActionDefinition } from '../../types/actions';
import type { LobsterStep } from '../../types/lobster';

const runShellCommand: ActionDefinition = {
  id: 'run-shell-command',
  name: 'Run Shell Command',
  category: 'io',
  icon: 'terminal',
  description: 'Execute an arbitrary shell command',
  inputs: [{ id: 'input', label: 'Stdin', kind: 'text' }],
  outputs: [
    { id: 'stdout', label: 'Stdout', kind: 'text' },
    { id: 'stderr', label: 'Stderr', kind: 'text' },
  ],
  configFields: [
    { id: 'command', label: 'Command', type: 'code', required: true, placeholder: 'echo "hello"' },
    { id: 'cwd', label: 'Working Directory', type: 'text', placeholder: '/path/to/dir' },
  ],
  defaults: { command: '', cwd: '' },
  compile: (config, ctx) => {
    const step: LobsterStep = {
      id: ctx.nodeId,
      command: String(config.command ?? ''),
    };
    if (config.cwd) {
      step.cwd = String(config.cwd);
    }
    if (ctx.incomingEdges.length > 0) {
      step.stdin = `$${ctx.incomingEdges[0].sourceNodeId}.stdout`;
    }
    return [step];
  },
};

registerAction(runShellCommand);
