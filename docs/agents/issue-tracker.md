# Issue Tracker

This public repository keeps tracker guidance generic. Do not commit private tracker URLs, private workspace identifiers, customer data, or personal credentials to this file.

## Project

- Repository: `rendrag-git/lobster-builder`
- Default branch: `main`
- Public delivery branch for the OpenClaw plugin publish/polish work: `feat/gateway-integration-polish`
- Canonical execution tracker: private project tracker

Private tracker IDs and URLs belong in the tracker system, not in public repository files.

## Current Gatekeeper Pointer

`GOAL.md` points to the current gatekeeper by stable label, without issue numbers or ticket keys. This file intentionally omits exact private tracker identifiers.

Earlier local fixture work around `lobster-flow` is historical evidence only. Do not treat the original builder PRD gate, publish/list/status/cancel lifecycle, cron installation, bundle composer, plugin-hosted UI, or visual E2E proof as complete unless the configured gatekeeper and fresh upstream-aligned evidence say so.

Current gatekeeper label:

- Ship the full Lobster Builder OpenClaw plugin product

Active delivery path:

- Deliver the Lobster Builder gateway integration as a self-contained OpenClaw plugin from this repository.
- Install the plugin into an OpenClaw gateway and have the hosted UI use that gateway by default, with explicit browser-auth or token-missing recovery when the gateway requires auth.
- Keep the OpenClaw core/main PR path superseded unless a minimal upstream plugin API gap is explicitly identified and accepted as separate upstream work.

Current proof state:

- The full-product gate is complete in the configured private tracker. The prior closure was premature, but the reopened publish/polish gate now has current product-audit evidence, review-fix evidence, and a merged public delivery branch.
- Self-contained package and disposable-gateway proofs are accepted slice evidence, not product closure.
- Live hosted browser deploy/list/run proof passed on the development gateway: the self-contained plugin served the current built asset from the gateway plugin path, the browser UI showed `Authorize browser`, an operator approved the `Lobster Builder` device request, Deploy reported `Deployed hello-world@3`, `lobster.workflow.list` showed the new revision, and `tools.invoke` with `lobster` by workflow id returned `Hello from Lobster!`.
- Deploy/setup visibility and the real hosted publish/list/run path now have accepted evidence.
- Current publish/polish audit repairs have landed and are verified: hosted install freshness on the development gateway, hosted same-origin auth copy with URL/token blank, distinct `Authorize browser` and `Gateway token needed` states, approval blocking, repeated approval resume handling, selected-gateway status/cancel/schedule routing, managed run status refresh, stale published-library isolation, partial Deploy + Cron failure feedback with workflow output preserved, package metadata, and packed UI hygiene.
- Channel targeting has an accepted plugin-only path: when gateway discovery exposes Discord/channel targets, Builder offers them; when discovery cannot prove targets, the Target field stays manual and explicitly says the gateway did not expose targets or channel target discovery is unavailable. Current OpenClaw `channels.status` exposes provider/account status but not Discord guild/channel target lists, so selectable Discord targets require a future upstream read method if reopened.
- README and product PRDs now lead with install/open/authorize/deploy/verify/troubleshoot for the plugin-hosted path and document local-only vs gateway actions, deploy result/library visibility, channel target manual fallback, managed run status/cancel, and secret hygiene. The normal README setup path now separates managed install/enable from source-link config editing and container tarball installation, states the OpenClaw version floor, opens the hosted UI on the gateway origin, explains first-run browser authorization in the main usage path, records the public-but-unlicensed boundary, package metadata uses a public HTTPS repository URL, container install starts from `npm run pack:plugin`, and post-install proof uses runtime plugin inspection plus plugin doctor.
- The hosted Gateway panel no longer exposes stale legacy discovery-route copy. Connected discovery summaries use the native gateway discovery model and include agents, models, channels, skills, tools, nodes, channel targets, and effective tools when available; unavailable channel-target discovery keeps the manual target fallback explicit.
- Live hosted auth retest found that a bare token-auth plugin URL can fail before OpenClaw creates a pending browser/device request. Builder now reports that state as `Gateway token needed` instead of telling users to approve a non-existent pending request, and README documents the dashboard-authenticated URL or manual-token recovery path.
- Current full local verification has been refreshed after the package/open clarity follow-up: unit tests, lint, build, browser E2E, package dry-run, diff hygiene, public-boundary grep, stale deploy/Vite grep, and non-mutating development-gateway plugin inspection all passed. The development gateway still reports OpenClaw `2026.5.24`, `lobster-builder` `0.1.0` enabled/activated with one HTTP route and `lobster.workflow.publish/list/get/delete`, plugin doctor has no issues, and the hosted route returns tokenless same-origin config.
- The verified publish/polish work was committed, pushed to the public delivery branch, reviewed, and merged into `main`.
- Public PR automated review comments about legacy hosted token migration, same-origin scope for that migration, remote-scope isolation for that migration, and stale in-flight status refresh were addressed and verified with focused and full local checks.
- Full product audit is recorded in `docs/full-product-audit-2026-05-25.md`; it found no new implementation or documentation blocker in the merged delivery. The configured private gatekeeper is complete unless reopened with a concrete follow-up blocker.
- No minimal upstream OpenClaw/Lobster API gap is currently accepted. If plugin-only delivery cannot satisfy the gate, record the exact upstream gap in the private tracker before changing the delivery path.

## Codex-Ready Issue Format

Codex-ready tracker issues should include:

- repository name
- target branch or environment
- a clear acceptance checklist with verification commands or proof artifacts
- labels matching `docs/agents/triage-labels.md`

## Goal Loops

For persistent Codex `/goal` work, prefer a single private tracker gatekeeper issue. The issue owns live acceptance, blockers, next checkpoint, and completion state. `GOAL.md` stays a public-safe pointer and evidence index.
