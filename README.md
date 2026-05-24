# Lobster Builder

Lobster Builder is the visual editor for building and publishing OpenClaw-backed Lobster workflows.

The normal way to use it is as an OpenClaw gateway plugin. The gateway serves the UI, the UI auto-connects back to that same gateway, and published workflows become reusable Lobster runs that agents can invoke with their existing OpenClaw permissions.

## Use It In OpenClaw

Build the plugin assets:

```bash
npm install
npm run build
```

Load this repository as an OpenClaw plugin:

```json
{
  "plugins": {
    "enabled": true,
    "allow": ["lobster-builder"],
    "load": {
      "paths": ["/path/to/lobster-builder"]
    },
    "entries": {
      "lobster-builder": { "enabled": true }
    }
  }
}
```

Restart the gateway, then open:

```text
/plugins/lobster-builder/
```

When hosted by the gateway, Builder injects a same-origin connection. You should not paste a gateway bearer token into the hosted plugin page. Browser write operations use OpenClaw browser/device auth through the gateway.

## Build And Run A Workflow

1. Open Builder from `/plugins/lobster-builder/`.
2. Confirm the Gateway panel shows the hosted OpenClaw gateway as connected.
3. Start from a blank canvas or the native message template.
4. Drag blocks from the left sidebar onto the canvas.
5. Connect output handles to input handles to pass data between blocks.
6. Configure each block in the right panel.
7. Watch the readiness panel for missing tools, missing effective agent permissions, or unavailable channel/node targets.
8. Use Test Run to run the current canvas through the gateway.
9. Use Publish to save a reusable workflow revision on the gateway.
10. Agents can then run the published workflow through the `lobster` tool by `workflowId`.

Published workflow refs can be reused from Run Sub-Workflow, chains, bundles, and cron-ready scheduled metadata.

## Useful Blocks

- Send Channel Message: sends a Discord, Slack, Telegram, or other OpenClaw channel message through the `message` tool.
- OpenClaw Tool Call: calls another OpenClaw tool by name with JSON args.
- LLM JSON Task: asks the `llm-task` tool for structured JSON output.
- Run Agent: delegates work through `sessions_spawn`.
- Node Action: invokes a connected node through `nodes`.
- Run Sub-Workflow: runs a published workflow or file workflow from inside the current workflow.
- Parallel Bundle: fans out to multiple published child workflows.
- While Loop: emits Lobster flow rules for repeat-until behavior.

## Permissions

`lobster` is an orchestration permission. It does not grant every nested OpenClaw tool.

Examples:

- A workflow that sends a channel message needs `lobster` and `message`.
- A workflow that runs an LLM JSON task needs `lobster` and `llm-task`.
- A workflow that spawns another agent needs `lobster`, `sessions_spawn`, and whatever subagent policy OpenClaw requires.
- A workflow that invokes a node needs `lobster`, `nodes`, and OpenClaw's node owner/admin policy.

The invoking agent's effective tools decide what a published workflow can do. Giving an agent `lobster` alone lets it run Lobster workflows only until a nested step asks for a tool the agent does not have.

## Troubleshooting

- If the hosted plugin page is open, leave Gateway URL and token blank. The page uses same-origin gateway RPC.
- If local dev shows `NetworkError when attempting to fetch resource`, the browser is probably blocked by CORS. Use the hosted plugin path or configure the gateway for browser access.
- If readiness says a tool is missing, fix the invoking agent's OpenClaw tool policy. Browser auth is not the same as agent permission.
- If a channel is missing, verify the channel is configured and enabled in the gateway.
- If a node action is blocked, verify the node is connected and the invoking agent is allowed to use the node action.

## Local Development

Run the Vite app:

```bash
npm install
npm run dev
```

Open:

```text
http://localhost:5173
```

Local dev is useful for UI work. The plugin path is the product path for real gateway usage because it avoids CORS and uses gateway-local auth.

## Verification

```bash
npm test
npm run lint
npm run build
npm run test:e2e
npm pack --dry-run
git diff --check
```

## Public Data Boundary

Do not commit real gateway tokens, private keys, channel secrets, private customer data, Linear URLs, Codex environment URLs, or personal credentials. Tests use fixture values such as `test-token` and `team@example.com`.
