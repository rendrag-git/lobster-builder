# Full Product Audit - 2026-05-25

This audit maps the current Lobster Builder branch against the configured full-product gatekeeper and both product PRDs. It is public-safe: private tracker identifiers, private URLs, gateway tokens, and machine-local gateway URLs are intentionally omitted.

## Scope

- Branch: `feat/gateway-integration-polish`
- Delivery path: self-contained `lobster-builder` OpenClaw plugin
- Product path: gateway-served Builder UI, gateway-local workflow publish/list/get/delete methods, and Lobster runs through the invoking agent's OpenClaw permissions
- Current closure rule: do not close the Codex goal or gatekeeper until Linear and repo evidence agree

## Requirement Audit

| Requirement | Current Evidence | Audit Result |
| --- | --- | --- |
| Install as a self-contained OpenClaw plugin | Package dry-run contains README, built `dist`, `openclaw.plugin.json`, `package.json`, and runtime plugin files only. Development gateway package install/enable/restart and runtime inspect show plugin version `0.1.0`, one HTTP route, and `lobster.workflow.publish/list/get/delete`. | Proven for current package path. |
| Open the UI served by the gateway | Hosted route returns HTTP 200 and injects tokenless same-origin hosted config. Browser smoke opens the hosted Builder page and exercises UI controls. | Proven. |
| Make connection/auth state explicit and recoverable | UI distinguishes `Authorize browser` from `Gateway token needed`. Hosted URL/token fields remain blank by default. README and Gateway panel document dashboard-authenticated URL or manual-token fallback for token-auth gateways. | Proven with an explicit auth precondition; not unconditional hidden-token autoconnect. |
| Build or load a useful workflow | Browser E2E covers template loading, visual bundle composer, scheduled publish metadata, native message template, empty-canvas blocking, and YAML parsing. | Proven in browser fixtures. |
| Deploy to the hosting or selected gateway | Deploy uses `lobster.workflow.publish`, shows workflow id/revision or actionable failure, and refreshes the published workflow library. Live hosted proof deployed Hello World on the development gateway. | Proven. |
| List/refresh the published workflow library | Store state is keyed per gateway to prevent stale rows crossing gateways. Live proof listed the deployed revision after publish. | Proven. |
| Run published workflows through Lobster | Live proof invoked the published workflow through `tools.invoke` with `lobster` and `workflowId`, returning the expected output. | Proven for the product Hello World path. |
| Run/approval/resume/cancel/failure debugging | Managed TaskFlow handles are surfaced for status/cancel; pending approvals block conflicting actions; repeated approval resume and selected-gateway routing are covered by tests. Pre-return cancellation for long synchronous `tools.invoke` calls remains deferred future work unless reopened. | Proven for accepted managed-handle surface; deferred pre-return cancellation is documented. |
| Cron-ready reusable automations | Deploy + Cron uses native Cron methods and preserves published workflow output if scheduling fails. PRD status keeps richer delivery controls out of closure unless reopened. | Started and accepted for current gate evidence. |
| Bundles/chains/nested workflows | Builder has published workflow library picker, visual workflow-ref composer, executable child refs, and parallel fan-out. Installed-package proof covers parent workflow through stored child ref. | Proven for current composer/runtime path. |
| Channel target discovery and manual fallback | Builder uses target suggestions when gateway discovery exposes them and keeps manual target entry when it does not. Current OpenClaw `channels.status` lacks Discord guild/channel target lists, so richer directory discovery is a documented upstream gap, not a current plugin blocker. | Accepted with documented fallback. |
| Agent-context native actions | Installed-package proofs show the Builder package as the only `lobster` provider and prove allow/deny boundaries for `message`, generic tool calls, `llm-task`, `sessions_spawn`, and `nodes`. | Proven in disposable installed-package gateways. |
| Permission boundary | `lobster` alone does not grant nested tools; agents need the nested tool permissions they would need for direct OpenClaw tool use. README, PRDs, and runtime proofs agree. | Proven. |
| Local-only vs gateway actions | README distinguishes Download YAML/Save Project from Test Run, Deploy, library, and Cron gateway actions. UI status is operation-specific. | Proven by docs and tests. |
| Secret hygiene and public boundary | Public-boundary grep found no private tracker URLs, machine-local development gateway URL, gateway token env names, bearer-like tokens, `sk-` secrets, or local OpenClaw source paths in public surfaces. README states workflow YAML and published documents must not contain tokens or channel secrets. | Proven for current branch audit. |
| PR/public repo state | Public repository is visible, branch is pushed, and GitHub PR is open against `main`. PR has no reported checks and merge state is clean. | Proven; merge remains a gatekeeper decision. |

## Verification Snapshot

- `npm test`: 21 files, 225 tests passed.
- `npm run lint`: passed.
- `npm run build`: passed with the existing Vite chunk-size warning only.
- `npm run test:e2e`: 4 Playwright Chromium tests passed.
- `git diff --check`: passed.
- Public-boundary grep: no private tracker URLs, machine-local development gateway URL, gateway token env names, bearer-like tokens, `sk-` secrets, or local OpenClaw source paths.
- `npm pack --pack-destination /tmp --json`: 14 package files.
- Development gateway install/enable/restart: passed for the package tarball.
- Runtime plugin inspect: enabled/activated, one HTTP route, and `lobster.workflow.publish/list/get/delete`.
- `openclaw plugins doctor`: no plugin issues.
- Hosted browser smoke: Deploy on Hello World reports `Gateway token needed` for a bare token-auth URL, keeps URL/token blank, and does not show pending-device approval copy for token-missing.

## Audit Decision

No new code or documentation blocker was found in this audit. A later automated PR review found two concrete issues: legacy OpenClaw Control UI session-token migration and refreshed in-flight TaskFlow status mapping. Both were fixed and verified after the audit. The remaining gate is not an implementation item discovered here; it is gatekeeper acceptance of the full-product evidence, PR review/merge decision, or a newly recorded follow-up blocker.
