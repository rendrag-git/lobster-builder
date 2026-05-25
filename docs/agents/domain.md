# Lobster Builder Domain

## Product Model

Lobster Builder is a visual React Flow builder for OpenClaw-backed Lobster workflows. It is not a standalone automation runtime and should not invent a separate permission model.

The intended distribution path is an OpenClaw plugin that serves the Builder UI from the gateway. When installed this way, the UI should use the hosting gateway by default and make gateway auth state explicit; token-auth gateways may require opening Builder from a dashboard-authenticated URL or adding a manual connection token. Manually saved gateway connections are a secondary/multi-gateway authoring path.

The intended runtime path is:

`user or agent -> OpenClaw gateway -> lobster tool -> Lobster workflow -> allowed OpenClaw-native tool`

## Core Concepts

- Lobster workflow: a structured workflow document consumed by the Lobster runtime.
- Builder graph: the visual React Flow canvas that compiles to a Lobster workflow document.
- OpenClaw gateway: the target runtime/control plane that runs or publishes workflows.
- Gateway connection: local Builder state for reaching a gateway. Tokens stay local and are never embedded in exported workflows.
- Published flow: a workflow document registered with the gateway through upstream-aligned `lobster.workflow.publish/list/get/delete` methods and runnable by the `lobster` tool through `workflowId`. Status: verified locally and through a live throwaway gateway proof.
- Cron flow: a published workflow with schedule metadata installed through OpenClaw Cron-backed session turns. Status: verified locally and through a live throwaway gateway proof for `cron.add/list/update/remove` after `lobster.workflow.publish`.
- Managed Lobster run: a Lobster tool invocation that returns an OpenClaw TaskFlow handle for approval waits, status checks, resume targeting, and cancellation. Status: verified for returned managed flow handles through `tasks.flows.list/get/cancel`; pre-return cancellation of a still-blocking synchronous `tools.invoke` call is deferred future runtime/product work unless reopened.
- Bundle or chain: reusable workflow composition using published Lobster workflow refs and bundle metadata. Status: live-proofed locally for parent workflows that call pinned published child workflow revisions; Builder has a published workflow library picker plus a visual workflow-ref composer for reusable refs, ordered chain steps, and parallel branches with explicit wait-for-all join labeling. Parallel bundle refs compile to an executable `lobster.parallel` fan-out step, and OpenClaw live proof covers a parent workflow running parallel published child refs.
- Agent-context native action: a Lobster step that calls an OpenClaw-native tool under the invoking agent's existing permissions.
- Send Channel Message: the first native action slice, wrapping the OpenClaw `message` tool with `action: "send"`.
- Native message example: a bundled Builder template that prepares a result, gates the side-effecting send behind approval, and then calls Send Channel Message without embedding gateway credentials.
- Generic OpenClaw Tool Call: an escape hatch block for installed tools that do not have a specialized Builder block yet.
- Node Action: a native action block wrapping OpenClaw `nodes` with `action: "invoke"` for approved paired-node commands.
- Readiness validation: Builder checks that the selected gateway and invoking agent context have the tools and permissions required by the workflow.

## Status Model

PRDs in this repo describe the product target. A requirement is not implemented unless a current issue or evidence entry says it is implemented against upstream OpenClaw/Lobster behavior. The local `lobster-flow` experiment is parked and must not be treated as the canonical upstream runtime surface.

## Permission Boundary

Granting `lobster` lets an agent run Lobster workflows. It must not grant every nested OpenClaw tool. Native action steps must pass the same OpenClaw tool policy that would apply if the invoking agent called the tool directly.

Examples:

- A workflow with Send Channel Message requires `lobster` plus `message`.
- A workflow with LLM JSON Task requires `lobster` plus `llm-task`.
- A workflow with Run Agent requires `lobster` plus `sessions_spawn`; explicit target agents are still governed by OpenClaw subagent allowlists.
- A workflow with Node Action requires `lobster` plus `nodes`, and `nodes` remains owner-only in OpenClaw; a non-owner/write-scoped caller cannot use Lobster to bypass that boundary.

Builder should make missing permissions visible before publish/run when discovery data is available. Runtime errors should name the blocked nested tool and policy reason where possible.

## Current PRDs

- OpenClaw Lobster Flow Builder PRD: `docs/openclaw-lobster-flow-builder-prd.md`
- OpenClaw Native Lobster Actions PRD: `docs/openclaw-native-lobster-actions-prd.md`

The original builder gate was previously treated as satisfied by local `lobster-flow` fixture evidence, but that evidence is historical only and is no longer a completion gate. The current active gatekeeper is the full Lobster Builder OpenClaw plugin product, tracked by the current Linear gatekeeper pointer in `docs/agents/issue-tracker.md`. Native-action and installed-package proofs are evidence for that gate, not completion by themselves.

## Out Of Bounds

- Do not store gateway bearer tokens or channel secrets in workflow YAML.
- Do not bypass OpenClaw's existing tool policy for nested native actions.
- Do not hand-edit gateway config from the browser.
- Do not replace Lobster runtime semantics with Builder-only execution logic.
- Do not overload shell-oriented blocks into native OpenClaw tool calls without preserving explicit user intent.
