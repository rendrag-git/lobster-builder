# Lobster Builder Agent Instructions

## Core Rules

- Verify before claiming done. Run the relevant test, build, lint, browser, gateway, or Linear check and report what passed.
- If the same fix fails twice, stop and record the blocker in the canonical continuity surface instead of trying a third variant.
- Do not edit shared runtime config, gateway state, tokens, or generated external state unless the task explicitly requires it.
- Preserve user changes already present in the worktree. Do not revert unrelated files.
- Keep workflow files and exported Lobster documents free of bearer tokens and secrets.

## Project Context

Lobster Builder is a React Flow application for building OpenClaw-backed Lobster workflows, bundles, chains, and cron-ready reusable automations.

The product boundary is:

- Builder compiles visual graphs to Lobster workflow data.
- Gateway connection tokens are local Builder control-plane state only.
- Published workflows run on an OpenClaw gateway through Lobster/OpenClaw runtime tools.
- Agent-context native actions must execute under the invoking agent's existing OpenClaw tool permissions.
- Granting `lobster` must not implicitly grant nested tools such as `message`, `llm-task`, agent invocation, or node actions.

## Agent Skills

Use the repo-local agent docs before making tracker, triage, or domain decisions:

- Issue tracker: `docs/agents/issue-tracker.md`
- Triage labels: `docs/agents/triage-labels.md`
- Domain model: `docs/agents/domain.md`

Linear is the canonical tracker for this repo. Do not create new issues until the existing Linear project, PRDs, and gatekeeper issue have been checked.

## Goal-Loop Conventions

When a thread has an active Codex `/goal`, inspect `docs/agents/issue-tracker.md`, `GOAL.md`, Linear, and these repo conventions before deciding what is canonical. A Codex Goal is a thread-scoped completion contract; Linear and repo files are continuity surfaces around it.

Prefer the Linear gatekeeper issue model when this repo has one configured. The gatekeeper issue owns the live gate, active acceptance target, blockers, next checkpoint, and completion state. `GOAL.md`, when present, is a minimal pointer and repo-local contract, not a duplicate work queue. If no external tracker is canonical, treat full `GOAL.md` as the canonical local state file.

Keep the `/goal` command short. It should point at the configured Linear gatekeeper through `GOAL.md` plus these conventions, not restate the entire spec or hard-code issue numbers. The `/goal` command must not mention issue IDs, ticket keys, PR numbers, or tracker URLs; those belong in Linear, `docs/agents/issue-tracker.md`, or tracker metadata. `GOAL.md` should also avoid issue numbers and ticket keys; use stable gatekeeper labels there and keep the exact tracker identifier in `docs/agents/issue-tracker.md`. If the command conflicts with repo docs or tracker state, the repo docs and configured tracker win and `GOAL.md` must be corrected before continuing.

At the start of every continuation turn, re-read the canonical continuity surface before deciding what to do. In Linear-gated mode, read the gatekeeper issue first, then repo conventions and `GOAL.md` if present. In local-only mode, read `GOAL.md` first. Do not work from memory of prior iterations.

In Linear-gated mode, record live blockers, current gate changes, and next checkpoints in the Linear gatekeeper issue. Keep `GOAL.md` minimal unless repo-local evidence locations or conventions need to be discoverable from the codebase.

For any subtask with two or more independent threads of investigation, dispatch parallel subagents per the engineering-behavior rules above. Do not serialize independent work inside the goal loop.

Verify before marking any checklist item complete. Run the test, read the diff, confirm the output. No "should work" claims in progress notes. Only verified evidence.

Only call `update_goal { status: "complete" }` when the configured canonical tracker, if one exists, shows the work is actually complete and verified evidence supports it. In Linear-gated mode, the gatekeeper issue and evidence must agree. In local-only mode, require verified `GOAL.md` evidence. Budget exhaustion, elapsed effort, or a plausible final answer are not completion signals.

If an optional local SQLite state DB exists under `.goal-loop/`, use it only as a machine-readable mirror. If SQLite, `GOAL.md`, and the configured tracker disagree, report the mismatch and let the Linear gatekeeper or configured tracker win when repo docs say it is canonical; otherwise let `GOAL.md` win over SQLite.

If the same fix fails twice, stop and write the blocker into the canonical continuity surface instead of trying a third variant. In Linear-gated mode, update the gatekeeper issue. In local-only mode, update `GOAL.md` progress.

Resist scope drift toward whatever produced the most evidence last iteration. After completing a local sub-task, the next iteration's action must advance a different required capability or write the explicit blocker preventing that pivot.

Do not add concurrency, caching, or alternate code paths until a baseline run has actually demonstrated the need.

To set a token budget on the loop, ask in chat: "Use the create_goal tool with objective '...' and token_budget N". The slash command does not expose `token_budget`.

## Verification

Choose the narrowest proof that covers the change:

- Builder unit tests: `npm test`
- Builder lint: `npm run lint`
- Builder build: `npm run build`
- Browser proof: `npm run test:e2e`
- Diff hygiene: `git diff --check`

For OpenClaw runtime changes, also run the relevant OpenClaw Lobster plugin tests from the OpenClaw repo and record the exact command and result.
