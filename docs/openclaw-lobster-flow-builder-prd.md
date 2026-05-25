# OpenClaw Lobster Flow Builder PRD

## Problem Statement

Lobster Builder can draw a single workflow and export a `.lobster` file, but it is not yet a real OpenClaw runtime surface. Users cannot choose which OpenClaw gateway owns a workflow, publish a workflow directly to the Lobster runtime, compose reusable workflow bundles, or turn a visual workflow into a recurring OpenClaw cron. The current run path treats the canvas as a shell pipeline, which loses workflow-file semantics such as approval gates, sub-workflows, branching, parallel work, retry policy, and durable resume.

## Solution

Turn Lobster Builder into a gateway-aware React Flow application for designing, validating, publishing, and operating Lobster workflows on OpenClaw gateways. The builder should compile the visual graph into valid Lobster workflow documents, attach OpenClaw assignment metadata, publish/run the document through the core Lobster runtime, and expose reusable bundle and cron concepts as first-class builder primitives.

This is a product PRD, not a slice plan. Requirements remain in scope even when the current implementation has not started them yet.

## Current Status

Requirements remain open unless the configured gatekeeper and recorded evidence mark them complete. Historical `lobster-flow` fixture evidence does not satisfy this PRD.

The current full-product gate is active and not complete. Self-contained package and disposable-gateway proofs are accepted slice evidence; the latest accepted product proof is the live hosted browser Deploy/list/run path through the gateway-served plugin UI. Channel/guild target discovery is handled by conditional suggestions plus an explicit manual fallback because current OpenClaw `channels.status` does not expose Discord guild/channel target lists. Remaining publish/polish work is owned by the configured gatekeeper.

| Area | Status | Notes |
| --- | --- | --- |
| Plugin-hosted Builder UI | Live hosted browser proof passed | The repo declares an OpenClaw plugin entry that serves the built UI and hosted startup uses OpenClaw browser device auth for same-origin gateway RPC. Installed-package disposable proofs passed with bundled Lobster disabled, and the development gateway hosted the current built UI, required browser authorization, accepted Deploy, listed the published revision, and ran the workflow through `tools.invoke(lobster workflowId)`. |
| Upstream-rebased workflow run path | Live-proofed | Builder run calls the selected gateway's existing `lobster` tool with inline workflow YAML or a published workflow id; OpenClaw materializes inline YAML as a workflow file before execution. |
| Gateway assignment metadata | Started | Builder preserves workflow-level target gateway selection for authoring and run/deploy routing. Gateway tokens stay local and are not embedded in workflow YAML or published workflow documents. |
| Deploy/list/status/cancel lifecycle | Started | Deploy calls `lobster.workflow.publish`, shows workflow id/revision or actionable failure, refreshes the published workflow library, and supports run/status/cancel through returned managed TaskFlow handles. A separate async-start handle for pre-return cancellation of long synchronous runs is deferred future runtime/product work unless reopened. |
| Cron installation | Started | Builder publishes through `lobster.workflow.publish`, installs schedules through OpenClaw's native `cron.add`, updates existing jobs through `cron.update`, removes schedule jobs through `cron.remove`, and live gateway Cron lifecycle proof passed. Richer delivery controls remain pending. |
| Bundle/chain composer | Started | Builder emits executable `lobster.workflow` child refs and executable `lobster.parallel` fan-out steps with structured metadata, publish passes bundle metadata to OpenClaw, live gateway proof covers pinned parent-child execution and parallel parent execution, and the Builder has a published workflow library picker plus a visual workflow-ref composer for reusable refs, ordered chain steps, and parallel branches with wait-for-all join labeling. |
| Visual E2E proof | Started | Browser E2E exercises the Builder Deploy path through `lobster.workflow.publish` fixtures, including empty-canvas blocking, scheduled publish/Cron YAML, native message template run/deploy, bundle metadata, executable child refs, and no `lobster-flow` runtime path. Live runtime proof exists for workflow lifecycle, Cron, managed run status/cancel, parent-child execution, parallel published-child execution, and the hosted browser Deploy/list/run path. |

## User Stories

1. As an OpenClaw operator, I want to save multiple gateway connections, so that I can build flows for home, business, rescue, or customer gateways without re-entering tokens.
2. As an OpenClaw operator, I want each workflow to declare its target gateway, so that exported projects preserve where they are intended to run.
3. As an OpenClaw operator, I want the Run button to execute the compiled workflow file through the selected gateway, so that approvals, branching, sub-workflows, and resume semantics match Lobster runtime behavior.
4. As an OpenClaw operator, I want the builder to show the selected gateway and connection status near execution controls, so that I do not run a side-effecting flow on the wrong gateway.
5. As an OpenClaw operator, I want to visually compose reusable workflow bundles, so that common automation patterns can be reused across agents and gateways.
6. As an OpenClaw operator, I want to chain workflows together, so that one Lobster can call another and pass outputs into downstream work.
7. As an OpenClaw operator, I want to define a bundle as sequential, parallel, or reusable, so that the builder can emit the right workflow-file structure.
8. As an OpenClaw operator, I want to schedule a workflow or bundle with a cron expression, so that recurring work runs through OpenClaw without hand-written config edits.
9. As an OpenClaw operator, I want cron metadata to include timezone and enabled state, so that exported projects can be staged before activation.
10. As an OpenClaw operator, I want the builder to discover gateway agents, models, channels, skills, and tools, so that node config fields reflect the target gateway's real capabilities.
11. As an OpenClaw operator, I want unsupported imported Lobster constructs to be preserved or clearly reported, so that imports do not silently lose runtime behavior.
12. As an OpenClaw operator, I want a publish result with flow id, cron id, task status, and assignment metadata, so that I can audit what the builder created.
13. As an OpenClaw operator, I want approval pauses to be visible and resumable in the builder, so that I can complete gated workflows without leaving the UI.
14. As an OpenClaw operator, I want cancelled and failed runs to remain inspectable, so that I can debug automation without reading gateway internals.
15. As an OpenClaw operator, I want a visual end-to-end test harness that builds a flow in the UI and proves it parses and assigns to the selected gateway, so that this surface stays credible.

## Implementation Decisions

- The builder compiles to Lobster workflow files, not shell pipeline strings. Pipeline execution remains available for individual actions, but whole-workflow execution uses the embedded Lobster runtime through OpenClaw.
- Builder should be installable as an OpenClaw plugin. In the normal path, OpenClaw serves the local Builder UI and the UI is already connected to the hosting gateway.
- Gateway assignment is workflow metadata. The builder must persist a non-secret gateway id/name/profile with exported YAML and builder project JSON. Tokens stay in local gateway connection storage and are never embedded in workflow files.
- Gateway selection is product state, not a node-level setting. Per-node gateway routing can come later through explicit OpenClaw runtime support.
- The first runtime API extension should accept inline workflow documents for execution. Existing `pipeline` and file-path behavior must continue to work.
- Collections and bundles use Lobster's existing composition semantics first: sub-workflows, workflow args, flow rules, parallel branches, and reusable workflow refs. New runtime APIs should only be added where the existing format cannot represent the builder intent.
- Cron authoring belongs to the builder as workflow metadata, while cron installation belongs to OpenClaw gateway control-plane APIs. The builder should not hand-edit gateway config.
- OpenClaw assignment and lifecycle APIs should live in the gateway control plane, reusing the existing TaskFlow and cron runtimes instead of hiding persistent resources behind ad hoc plugin internals.

## Testing Decisions

- Unit tests should cover compile/decompile/export/import behavior for gateway metadata, schedule metadata, bundle metadata, and inline workflow execution payloads.
- Runtime plugin tests should prove inline workflow documents are persisted durably and passed to the core Lobster runtime as workflow files.
- Store tests should cover saved gateway selection and workflow-level gateway assignment.
- Visual end-to-end tests should drive the actual React Flow UI: connect/select a gateway fixture, place nodes, connect them, set schedule/bundle metadata, run/publish, and assert the gateway receives a parseable workflow assigned to that gateway.
- Tests should verify external behavior and wire contracts rather than internal component layout.

## Out of Scope

- Per-node multi-gateway execution.
- Replacing the Lobster workflow runtime with builder-specific execution logic.
- Storing bearer tokens in exported workflow files.
- Direct gateway config-file edits from the browser.
- Full marketplace sharing of Lobster bundles.

## Further Notes

The near-term implementation moved in vertical slices. Inline workflow execution, the durable workflow document registry, Cron-backed workflow scheduling, managed run status/cancel handles, published parent-child workflow execution, the published workflow library picker, visual bundle/chain authoring, and executable parallel published-child fan-out have started against OpenClaw's native Lobster and Cron surfaces. Async-start handles for pre-return cancellation of long synchronous runs are deferred future runtime/product work unless reopened.
