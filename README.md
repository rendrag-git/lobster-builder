# Lobster Builder

Lobster Builder is the visual editor for building and publishing OpenClaw-backed Lobster workflows.

The normal way to use it is as an OpenClaw gateway plugin. The gateway serves the UI, the UI connects back to that same gateway using OpenClaw browser auth, and published workflows become reusable Lobster runs that agents can invoke with their existing OpenClaw permissions.

## Use It In OpenClaw

Install this repository as the self-contained `lobster-builder` OpenClaw plugin. This package expects OpenClaw `2026.5.24` or newer:

```bash
openclaw --version
```

For local development from a checkout, build the UI assets first, then install and enable the plugin in the target OpenClaw config:

```bash
npm install
npm run build
openclaw plugins install --force .
openclaw plugins enable lobster-builder
openclaw plugins inspect lobster-builder --runtime
```

Restart the gateway, then open the Builder route on that gateway origin. If the gateway uses token auth, open Builder from a dashboard URL that includes gateway auth rather than a bare plugin URL:

```text
https://<gateway-host>/plugins/lobster-builder/
```

For active source-link development, use `openclaw plugins install --force --link .` instead of a copied install. If you need to hand-edit the target gateway config, use `openclaw config file` to find the active config path and add the plugin entry. A source path configuration looks like:

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

To update an already installed checkout, rebuild and reinstall it, then restart the gateway:

```bash
npm run build
openclaw plugins install --force .
openclaw plugins enable lobster-builder
openclaw plugins inspect lobster-builder --runtime
openclaw gateway restart
```

If the gateway runs in a container without a managed OpenClaw user service, create a package tarball first:

```bash
npm run pack:plugin
```

Copy the generated `lobster-builder-*.tgz` into that container, run `openclaw plugins install --force <tarball>` and `openclaw plugins enable lobster-builder` inside the container, then restart it through the container supervisor.

When hosted by the gateway, Builder injects a same-origin connection to that gateway. You should not paste a gateway bearer token into the hosted plugin page during normal use. If the UI shows `Authorize browser`, approve the `Lobster Builder` device request in OpenClaw, then retry Test Run or Deploy. If it shows `Gateway token needed`, the page was opened without gateway auth; reopen it from an OpenClaw dashboard URL that carries gateway auth, or add a manual gateway token in the Gateway panel.

## Build And Run A Workflow

1. Open Builder from the gateway origin at `https://<gateway-host>/plugins/lobster-builder/`, using a dashboard-authenticated URL when the gateway requires auth.
2. Confirm the Gateway panel shows the hosted OpenClaw gateway as connected. If it shows `Authorize browser`, approve the pending browser/device request and retry. If it shows `Gateway token needed`, reopen Builder from a dashboard-authenticated URL or add a manual gateway token.
3. Start from a blank canvas or the native message template.
4. Drag blocks from the left sidebar onto the canvas.
5. Connect output handles to input handles to pass data between blocks.
6. Configure each block in the right panel.
7. Watch the readiness panel for missing tools, missing effective agent permissions, or unavailable channel/node targets.
8. Use Test Run to run the current canvas through the gateway.
9. Use Deploy to save a reusable workflow revision on the gateway.
10. Confirm the toolbar or preview panel reports a deploy result such as `workflowId@revision`.
11. Refresh or inspect the published workflow library to confirm the revision is listed.
12. Agents can then run the published workflow through the `lobster` tool by `workflowId`.

Published workflow refs can be reused from Run Sub-Workflow, chains, bundles, and cron-ready scheduled metadata.

## Local Vs Gateway Actions

Download YAML and Save Project write local files only. They do not install or run anything on a gateway.

Test Run, Deploy, published workflow library refresh/delete, and Deploy + Cron are gateway actions. They require browser/device auth for the hosted UI and the invoking agent still needs the runtime tools required by the workflow.

Deploy sends the current `.lobster` workflow document to `lobster.workflow.publish`. It stores a reusable workflow revision on the gateway, reports the workflow id and revision or an actionable error, and refreshes the published workflow library when the gateway accepts the document.

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
- If the UI says `Authorize browser`, approve the `Lobster Builder` browser/device request in OpenClaw and retry the action.
- If the UI says `Gateway token needed`, the page reached the gateway without a valid gateway or device token and no pending device request may exist. Reopen Builder from an OpenClaw dashboard URL that carries gateway auth, or add a manual gateway token in the Gateway panel.
- If local dev shows `NetworkError when attempting to fetch resource`, the browser is probably blocked by CORS. Use the hosted plugin path or configure the gateway for browser access.
- If Deploy succeeds, the result appears in the toolbar and preview panel as the workflow id/revision; the published workflow library should list the same revision after refresh.
- If readiness says a tool is missing, fix the invoking agent's OpenClaw tool policy. Browser auth is not the same as agent permission.
- If channel targets are discovered, the Send Channel Message Target field offers suggestions. If the gateway does not expose targets, enter the target manually, such as `channel:<id>`, and add the Discord Guild/Server ID when that lookup needs server context.
- If a channel provider is missing or disabled after discovery succeeds, fix the gateway channel config before running the workflow.
- If a node action is blocked, verify the node is connected and the invoking agent is allowed to use the node action.
- If a run pauses for approval, use the visible run or TaskFlow handle/status surfaced by OpenClaw to approve, reject, resume, or cancel. Returned managed TaskFlow handles are the supported status/cancel surface; cancellation before a long synchronous `tools.invoke` returns is future runtime work unless reopened.
- If a run fails, inspect the Builder readiness panel and the returned Lobster/OpenClaw error first. Nested native-action errors should name the blocked tool or policy reason when OpenClaw provides one.

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

Local checks:

```bash
npm test
npm run lint
npm run build
npm run test:e2e
npm pack --dry-run
git diff --check
```

After installing the plugin into the target OpenClaw environment, verify that OpenClaw loaded that installed plugin:

```bash
openclaw plugins inspect lobster-builder --runtime
openclaw plugins doctor
```

## Public Data Boundary

Do not commit real gateway tokens, private keys, channel secrets, private customer data, private tracker URLs, Codex environment URLs, or personal credentials. Exported YAML, saved project JSON, README examples, and published workflow documents must not contain bearer tokens or channel secrets. Tests use fixture values such as `test-token` and `team@example.com`.

This repository is public, but the package currently declares `UNLICENSED`. Public source visibility is not an open-source license grant.
