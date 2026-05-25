# OpenClaw Native Lobster Actions PRD

## Problem Statement

Lobster Builder can publish and run workflows through an OpenClaw gateway, but it still does not let users express the most important OpenClaw-native actions a normal agent can already use. A user building a workflow cannot add an obvious "send a channel message when this is done" step, cannot choose a discovered OpenClaw tool and provide typed arguments, and cannot see which agent permissions are required for a workflow to run safely.

The current action catalog still nudges users toward shell-shaped commands such as `openclaw notify` or ad hoc `openclaw.invoke` strings. That is not intuitive and it is the wrong runtime boundary. In the intended product model, an agent uses the Lobster tool; the Lobster workflow should then invoke OpenClaw-native tools under that invoking agent's existing tool permissions. If the agent has `lobster` and `message`, the workflow can send messages. If the user has not granted `message`, the builder should show the missing permission instead of pretending the workflow will work.

## Solution

Add an OpenClaw-native action family to Lobster Builder and support the matching embedded runtime bridge in the Lobster/OpenClaw integration. Builder users should be able to add blocks such as Send Channel Message, OpenClaw Tool Call, LLM JSON Task, Run Agent, and Node Action. These blocks compile to structured Lobster workflow steps that invoke OpenClaw tools through the invoking agent's current tool context, not through separate gateway bearer auth embedded in the workflow.

The builder should use live gateway discovery where possible, show required tool permissions for each OpenClaw-native block, and validate workflow readiness against the selected gateway. The runtime should enforce the same tool policy that would apply if the agent called the tool directly. Lobster must remain an orchestration layer, not a privilege escalation layer.

This is a product PRD, not a slice plan. The full product surface remains in scope for the PRD. Implementation issues may still ship it in narrow vertical slices.

## Current Status

Requirements remain open unless the configured gatekeeper and recorded evidence mark them complete. The native-action child gates are accepted evidence, but they do not by themselves complete the full Lobster Builder product gate.

The native action slices, plugin-hosted lifecycle path, nested/bundle support, broader browser E2E coverage, self-contained installed-package Builder plugin path, and live hosted browser Deploy/list/run path have current proof. The latest installed-package proofs load the Builder package as the only `lobster` provider with bundled Lobster explicitly disabled. The full product gate remains active until the configured gatekeeper accepts publish/polish closure. The delivery path is not an OpenClaw core/main PR unless a future minimal upstream plugin API gap is explicitly identified and accepted as separate upstream work.

| Area | Status | Notes |
| --- | --- | --- |
| Plugin-hosted Builder UI | Live hosted browser proof passed | The repo declares an OpenClaw plugin entry that serves the built UI and hosted startup uses OpenClaw browser device auth for same-origin gateway RPC. Installed-package disposable proofs passed with bundled Lobster disabled. A later development-gateway browser proof opened the hosted UI, required browser authorization, deployed a workflow, listed the published revision, and ran it through `tools.invoke(lobster workflowId)`. |
| Agent-context Lobster bridge | Installed-package proofs passed locally | OpenClaw source proofs cover embedded Lobster calls through `runtime.tools.invoke` under invoking-agent policy, including loopback coverage for high-risk tools and live throwaway-gateway proofs across message, generic tools, LLM task, agent spawn, and node action. The self-contained Builder plugin now carries the bridge, avoids bundled-plugin-only state APIs, and disposable gateway proofs loaded the installed Builder package with bundled Lobster explicitly disabled to prove nested native tool allow/deny for `message`, generic `agents_list`, `llm-task`, `sessions_spawn`, and `nodes`. |
| Send Channel Message block | Installed-package proof passed locally | Builder-side block, required-tools UI, compile/decompile, readiness, E2E fixture coverage, and a simple template exist. Live throwaway-gateway proof covers `lobster -> openclaw.invoke -> message(action=send)` with `qa-channel`, plus denial for a restrictive `lobster`-only agent; the latest proof uses the installed Builder plugin's `lobster` tool rather than the bundled OpenClaw Lobster plugin. Target suggestions are used when gateway discovery exposes them; otherwise the field remains manual and explicitly says the target cannot be verified by discovery. |
| Generic OpenClaw Tool Call block | Installed-package proof passed locally | Builder-side generic block, JSON args handling, compile/decompile, and tests exist. The installed-package proof loads only `lobster-builder` as the `lobster` provider and proves a generic `openclaw.invoke` workflow succeeds for an invoking agent with `lobster + agents_list` and is denied for a restrictive `lobster`-only agent. |
| LLM JSON Task block | Installed-package proof passed locally | Builder-side block, required-tools UI, structured `llm-task` compile/decompile, readiness validation, and invalid JSON guards exist. The installed-package proof loads `lobster-builder` plus bundled `llm-task`, proves `lobster -> openclaw.invoke -> llm-task` with `mock-openai/gpt-5.5` for an invoking agent allowed `lobster + llm-task`, and proves a restrictive `lobster`-only agent is denied before the mock provider receives a request. |
| Run Agent block | Installed-package proof passed locally | Builder-side block uses upstream `sessions_spawn` with task/agent/runtime args, required-tools UI, discovered agent options, readiness validation, compile/decompile, and input-wiring import tests. The installed-package proof loads only `lobster-builder` as the `lobster` provider and proves `lobster -> openclaw.invoke -> sessions_spawn`, denial for a restrictive `lobster`-only agent, accepted child spawn for an invoking agent with `lobster + sessions_spawn`, `agent.wait` completion, and QA mock provider receipt for the spawned child task. |
| Node Action block | Installed-package proof passed locally | Builder-side block uses upstream `nodes` with `action: "invoke"` and explicit node/command/params args, required-tools UI, node discovery suggestions from `node.list`, readiness validation, compile/decompile, and import tests. The installed-package proof loads only `lobster-builder` as the `lobster` provider and proves nested `nodes` denial for a restrictive `lobster`-only agent, denial for a write-scoped non-owner caller even when the invoking agent allows `lobster + nodes`, and allowed invocation for an admin-scoped caller with `lobster + nodes` against an approved paired node declaring `device.status`. |
| Live discovery/readiness | Live-proofed with channel target gap | Builder discovery reads upstream `tools.catalog`, `channels.status`, `node.list`, and `tools.effective` when a live session key is available; preview lists required native tools/channels and blocks run/deploy when the selected gateway catalog, selected channel availability, invoking-agent effective policy, or action-specific required fields prove a required native action requirement is missing. Live throwaway-gateway proof covers the discovery/readiness path with bundled `lobster` and `qa-channel`. Current OpenClaw `channels.status` exposes provider/account status but not Discord guild/channel target lists, so Builder offers target suggestions only when a gateway exposes target metadata and otherwise uses an explicit manual fallback. |
| Native message example and E2E | Live-proofed | Builder ships an OpenClaw Message template that prepares a result, has an approval gate before the side-effecting message, and sends through the native `message` tool. Browser E2E loads the template, verifies credential-free YAML, runs it through the selected gateway fixture, and publishes through `lobster.workflow.publish`. Live throwaway-gateway proof verifies the same message policy boundary and records a real QA bus outbound message. |
| Nested workflow and bundle support | Installed-package child-ref proof passed locally | Builder emits executable `lobster.workflow` child refs and executable `lobster.parallel` fan-out steps with structured metadata, publish stores bundle metadata, OpenClaw live proof covers a parent workflow invoking a pinned published child revision and a parallel parent workflow invoking published child refs, and Builder now has a published workflow library picker plus visual workflow-ref composer for reusable refs, ordered chain steps, and parallel branches with explicit wait-for-all join labeling. The self-contained package proof also loaded the installed Builder plugin with bundled Lobster disabled and ran a stored parent workflow through a stored `lobster.workflow` child ref. |

## User Stories

1. As an OpenClaw operator, I want to add a Send Channel Message block, so that a workflow can post completion output to Discord, Slack, Telegram, iMessage, or another configured channel.
2. As an OpenClaw operator, I want the Send Channel Message block to use the OpenClaw `message` tool, so that it behaves like native agent messaging instead of a builder-only notification shortcut.
3. As an OpenClaw operator, I want to choose the channel provider from gateway discovery, so that I only configure channels that exist on the selected gateway.
4. As an OpenClaw operator, I want to enter a message target such as a channel, thread, user, or route, so that the workflow can send visible output to the right place.
5. As an OpenClaw operator, I want to pass prior step output into the message body, so that completion messages can include real workflow results.
6. As an OpenClaw operator, I want message blocks to show that they require `lobster` plus `message`, so that I know what the invoking agent must be allowed to use.
7. As an OpenClaw operator, I want the builder to warn when the selected agent lacks `message`, so that I do not publish a workflow that cannot send its final notification.
8. As an OpenClaw operator, I want to add a generic OpenClaw Tool Call block, so that I can call any allowed tool without waiting for a custom builder block.
9. As an OpenClaw operator, I want the generic tool block to accept tool name and JSON args, so that advanced workflows can use newly installed OpenClaw plugins immediately.
10. As an OpenClaw operator, I want the generic tool block to populate tool options from gateway discovery, so that I can choose real installed tool names rather than guess.
11. As an OpenClaw operator, I want tool args to be validated as JSON before publish, so that invalid arguments are caught in the builder instead of failing after execution starts.
12. As an OpenClaw operator, I want to add an LLM JSON Task block, so that a Lobster workflow can run a structured model step through OpenClaw's `llm-task` tool.
13. As an OpenClaw operator, I want the LLM JSON Task block to expose prompt, input, schema, and model/thinking controls, so that deterministic workflows can still use model classification or drafting.
14. As an OpenClaw operator, I want the LLM JSON Task block to show that it requires `lobster` plus `llm-task`, so that permission requirements are explicit.
15. As an OpenClaw operator, I want to add a Run Agent block that delegates work to a configured OpenClaw agent, so that a workflow can ask a specialist agent to complete a repeatable step.
16. As an OpenClaw operator, I want the Run Agent block to use discovered agents, so that it reflects the selected gateway's actual agent list.
17. As an OpenClaw operator, I want to add a Node Action block for paired node capabilities, so that workflows can use native device actions when the agent has those permissions.
18. As an OpenClaw operator, I want the Node Action block to make node, command, and params explicit, so that device actions are auditable and reviewable.
19. As an OpenClaw operator, I want each OpenClaw-native block to compile to structured workflow data, so that imports and diffs preserve intent better than opaque shell commands.
20. As an OpenClaw operator, I want imported workflows with native OpenClaw action steps to decompile back into the same blocks, so that round-tripping does not lose the visual model.
21. As an OpenClaw operator, I want unsupported native tool steps to fall back to a generic OpenClaw Tool Call block, so that the workflow remains editable.
22. As an OpenClaw operator, I want the workflow readiness panel to list missing plugins or tool permissions, so that I can fix agent policy before running or publishing.
23. As an OpenClaw operator, I want Builder to distinguish gateway connection auth from agent tool permissions, so that I do not confuse browser connection setup with runtime authorization.
24. As an OpenClaw operator, I want published workflows to omit bearer tokens and secrets, so that exported Lobsters remain safe to share or store.
25. As an OpenClaw operator, I want the runtime to execute nested tool calls under the invoking agent's context, so that workflow behavior matches what the agent is already allowed to do.
26. As an OpenClaw operator, I want Lobster to reject nested tool calls that the invoking agent cannot use directly, so that granting `lobster` alone does not grant every OpenClaw tool.
27. As an OpenClaw operator, I want approval gates to remain available around side-effecting native actions, so that message sends, file writes, and external calls can require review.
28. As an OpenClaw operator, I want runtime errors to identify the blocked tool and missing permission, so that failures are actionable.
29. As an OpenClaw operator, I want the builder to ship a simple end-to-end example that runs a workflow and sends a channel message, so that I can prove the integration on my gateway.
30. As an OpenClaw maintainer, I want the embedded Lobster bridge to reuse OpenClaw's existing tool policy and tool execution paths, so that native action behavior stays consistent with normal agent turns.
31. As an OpenClaw maintainer, I want the bridge to be testable without a browser, so that permission enforcement and tool dispatch regressions are caught in unit tests.
32. As an OpenClaw maintainer, I want Builder action definitions to stay declarative, so that new native action blocks can be added without rewriting the compiler.
33. As an OpenClaw maintainer, I want Builder to keep generic and specialized action blocks separate, so that common workflows are intuitive but advanced tools remain reachable.
34. As an OpenClaw maintainer, I want docs and tooltips to explain required tools per block, so that users understand why a block is available but not runnable.
35. As an OpenClaw maintainer, I want live gateway discovery failures to degrade gracefully, so that users can still author generic tool calls manually.

## Implementation Decisions

- The product model is agent-context execution: an agent invokes the `lobster` tool, and nested OpenClaw-native workflow steps execute under that invoking agent's existing tool context and policy.
- OpenClaw tool availability is not the same as Lobster embedded runtime availability. A normal OpenClaw agent may have a tool, and the gateway may expose it through `tools.invoke`, but Lobster workflow execution still needs an injected bridge/registry so nested calls run under the invoking agent context without workflow-stored bearer tokens.
- Lobster Builder should be installable as an OpenClaw plugin. In that mode, the plugin serves the local UI from the gateway and the UI auto-connects to the hosting gateway instead of asking the user to manually enter the gateway URL/token.
- Lobster must not carry a separate gateway bearer token inside workflow YAML. Gateway connection tokens are for Builder's browser-to-gateway control plane only.
- Granting `lobster` alone must not grant nested OpenClaw tools. Each nested tool call must pass the same allowlist/group/tool policy gate that a direct agent tool call would pass.
- Add or package the runtime bridge through the Lobster Builder OpenClaw plugin so structured native tool steps dispatch against the current agent tool context. Reuse existing OpenClaw tool construction, policy, and execution where possible; do not assume OpenClaw core/main changes are the product delivery path.
- Add a deep Builder module for OpenClaw-native action specs. The module should describe block metadata, required tool permissions, compile behavior, decompile matching, and readiness validation through a small stable interface.
- Add a deep Builder module for tool-call argument handling. It should parse, validate, and normalize JSON args for generic and specialized tool blocks without scattering ad hoc string manipulation through action definitions.
- Add a readiness validator that compares workflow-native action requirements against selected gateway discovery and the invoking agent's effective tool inventory when OpenClaw exposes it. Static catalog discovery remains a graceful fallback when no live session context is available.
- Channel discovery failures should keep manual authoring usable. Builder should distinguish "discovery failed, cannot verify" from "discovery succeeded and this selected channel is missing or disabled." Channel target suggestions should appear when the gateway exposes target metadata; if OpenClaw exposes only provider/account status, Builder should say so and preserve manual `channel:<id>` entry.
- Add specialized blocks for high-value common actions: Send Channel Message, LLM JSON Task, Run Agent, and Node Action.
- Add a generic OpenClaw Tool Call block for all other tools. Specialized blocks can compile to the same internal native action representation as the generic block.
- Send Channel Message compiles to the OpenClaw `message` tool with `action: "send"` and explicit channel/target/message args.
- LLM JSON Task compiles to the OpenClaw `llm-task` tool with structured prompt, input, schema, and runtime options.
- Run Agent uses OpenClaw's existing `sessions_spawn` tool through `openclaw.invoke` with `action: "spawn"` rather than a Builder-only agent RPC. The action name is required by the `openclaw.invoke` command surface, but `sessions_spawn` itself consumes structured args such as `task`, `agentId`, `runtime`, `mode`, `runTimeoutSeconds`, `cleanup`, `sandbox`, `context`, and `lightContext`.
- Explicit Run Agent `agentId` targets are governed by OpenClaw subagent allowlists. Builder can author the target, but OpenClaw remains the source of truth for whether the invoking agent may spawn that configured agent.
- Node Action uses the upstream `nodes` tool with `action: "invoke"` and args `node`, `invokeCommand`, `invokeParamsJson`, and `invokeTimeoutMs`. It remains explicit about node, command, and params, and OpenClaw's owner-only `nodes` policy remains authoritative at runtime.
- Existing shell-oriented actions remain available. They should not be removed or silently reinterpreted as native OpenClaw tool calls.
- The existing Send Notification block should not be overloaded for OpenClaw channel messaging. A new Send Channel Message block should make the native `message` tool path explicit.
- Native action steps should round-trip through compile, YAML export, YAML import, and decompile. Unknown native actions should become a generic OpenClaw Tool Call block rather than being dropped.
- Tooltips should name the native tool and required permission set for each block. Example: "Requires the invoking agent to allow `lobster` and `message`."
- Runtime errors should preserve the nested tool name, action name, and policy failure reason where available.

## Testing Decisions

- Tests should verify external behavior and runtime contracts, not component implementation details.
- Builder unit tests should cover compile output for each native action block.
- Builder decompile tests should prove native OpenClaw action steps round-trip back into specialized blocks when recognized and the generic block when unknown.
- Builder argument tests should cover valid JSON args, invalid JSON args, interpolation strings, empty args, and nested objects.
- Builder readiness tests should cover connected gateway with required tools, connected gateway missing required tools, missing effective invoking-agent tools, no gateway discovery, and manually entered generic tool names.
- Gateway store/client tests should cover discovered tools/channels flowing into native action option fields.
- UI tests should cover user-visible tooltips and missing-permission warnings without depending on exact DOM layout.
- OpenClaw Lobster plugin tests should prove nested native tool calls execute through the invoking agent context.
- OpenClaw Lobster plugin tests should prove a workflow with only `lobster` permission cannot call `message`.
- OpenClaw Lobster plugin tests should prove a workflow with `lobster` plus `message` can call `message`.
- OpenClaw Lobster plugin tests should cover error reporting for blocked nested tools.
- End-to-end proof should build a simple workflow in Builder, publish/run it against a gateway fixture, and assert the workflow invokes the `message` tool for a final channel message.
- Live gateway proof should be kept separate from deterministic CI tests. CI should use fixtures or local runtime test doubles.

## Out of Scope

- Granting broad automatic permissions to Lobster workflows.
- Storing gateway tokens or channel secrets in workflow YAML.
- Replacing OpenClaw's existing tool policy system.
- Building a full visual schema editor for every OpenClaw plugin tool.
- Implementing marketplace sharing of native-action workflows.
- Per-node or per-step gateway switching.
- Full channel-specific rich message builders for every provider in the first slice.
- Browser-side direct calls to channel plugins or node runtimes.

## Further Notes

The key architectural correction is that Builder should not model native actions as shell commands or bearer-token-backed gateway calls. It should model them as agent-authorized OpenClaw tool invocations inside Lobster. Send Channel Message, Generic OpenClaw Tool Call, LLM JSON Task, Run Agent, and Node Action are accepted child-gate evidence. The full hosted-plugin path, channel target UX/manual fallback, public docs, and managed run/debug surface have evidence, but the configured product gate remains open for the current publish/polish audit.
