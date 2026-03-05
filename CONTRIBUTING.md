# Contributing to Lobster Builder

## Development Setup

```bash
git clone <repo>
cd lobster-builder
npm install
npm run dev
```

Run tests before submitting a PR:

```bash
npm test
npm run build
```

## Project Structure

See [README.md](README.md) for the full architecture overview.

## Adding a New Action

1. Create `src/actions/<category>/<action-id>.ts`.
2. Define and export an `ActionDefinition` object.
3. Call `registerAction(yourAction)` at the bottom.
4. Import the new file in `src/actions/init.ts`.
5. Add tests in `src/__tests__/actions-<category>.test.ts`.

**Minimal template:**

```typescript
import { registerAction } from '../registry';
import type { ActionDefinition } from '../../types/actions';

const myAction: ActionDefinition = {
  id: 'my-action',
  name: 'My Action',
  category: 'io',          // ai | flow | data | io | meta
  icon: 'terminal',
  description: 'Short description of what this action does.',
  inputs: [{ id: 'input', label: 'Input', kind: 'any' }],
  outputs: [{ id: 'output', label: 'Output', kind: 'any' }],
  configFields: [
    { id: 'param', label: 'Parameter', type: 'text', required: true },
  ],
  defaults: { param: '' },
  compile: (config, ctx) => [{
    id: ctx.nodeId,
    command: `my-tool --param '${config.param}'`,
    ...(ctx.incomingEdges.length > 0 && { stdin: `$${ctx.incomingEdges[0].sourceNodeId}.stdout` }),
  }],
};

registerAction(myAction);
```

## Compiler

- `src/compiler/compile.ts` — topological sort + action dispatch
- `src/compiler/decompile.ts` — pattern-matches Lobster YAML back to canvas nodes
- `src/compiler/toYaml.ts` — serialises `LobsterWorkflowFile` to YAML

When adding a new action with a distinctive command prefix, add a matching branch to `decompile.ts` so imports round-trip correctly.

## Code Style

- TypeScript strict mode.
- No `any` unless necessary (use `unknown` + narrowing).
- Keep components small and focused.
- Co-locate tests with their subjects where possible.

## Pull Requests

- One logical change per PR.
- All tests must pass (`npm test`).
- Build must succeed (`npm run build`).
- Keep commit messages in the conventional format: `feat:`, `fix:`, `chore:`, etc.
