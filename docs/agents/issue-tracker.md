# Issue Tracker

This public repository keeps tracker guidance generic. Do not commit private tracker URLs, private workspace identifiers, customer data, or personal credentials to this file.

## Project

- Repository: `rendrag-git/lobster-builder`
- Default branch: `main`
- Public delivery branch for the OpenClaw plugin work: `feat/gateway-integration`
- Canonical execution tracker: private project tracker

Private tracker IDs and URLs belong in the tracker system, not in public repository files.

## Current Gatekeeper Pointer

`GOAL.md` points to the current gatekeeper by stable label, without issue numbers or ticket keys. This file intentionally omits exact private tracker identifiers.

Earlier local fixture work around `lobster-flow` is historical evidence only. Do not treat the original builder PRD gate, publish/list/status/cancel lifecycle, cron installation, bundle composer, plugin-hosted UI, or visual E2E proof as complete unless the configured gatekeeper and fresh upstream-aligned evidence say so.

Current gatekeeper label:

- Implement agent-context OpenClaw native actions for Lobster Builder

Active delivery path:

- Deliver the Lobster Builder gateway integration as a self-contained OpenClaw plugin from this repository.
- Install the plugin into an OpenClaw gateway and auto-connect the hosted UI to that gateway.
- Keep the OpenClaw core/main PR path superseded unless a minimal upstream plugin API gap is explicitly identified and accepted as separate upstream work.

Current proof state:

- Self-contained package proof is complete locally and the configured gatekeeper is closed.
- A tarball install path was packed, unpacked into `/tmp`, production dependencies were installed, and disposable OpenClaw gateways loaded that installed package path with bundled Lobster explicitly disabled.
- Verified proof covers hosted UI lifecycle, stored parent-child workflow execution through `lobster.workflow`, native message allow/deny, generic tool allow/deny, LLM JSON Task allow/deny, Run Agent allow/deny plus child-run completion, and Node Action allow/deny plus owner-only enforcement through the Builder plugin's `lobster` tool.
- No minimal upstream OpenClaw/Lobster API gap is currently required for this gate.

## Codex-Ready Issue Format

Codex-ready tracker issues should include:

- repository name
- target branch or environment
- a clear acceptance checklist with verification commands or proof artifacts
- labels matching `docs/agents/triage-labels.md`

## Goal Loops

For persistent Codex `/goal` work, prefer a single private tracker gatekeeper issue. The issue owns live acceptance, blockers, next checkpoint, and completion state. `GOAL.md` stays a public-safe pointer and evidence index.
