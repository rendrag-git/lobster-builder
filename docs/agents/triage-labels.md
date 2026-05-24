# Triage Labels

Use Linear labels to make work routing explicit. The default five-role vocabulary is:

- `needs-triage`: the request needs classification, scoping, or duplicate search.
- `needs-info`: the request is blocked on missing product intent, runtime details, credentials, reproduction steps, or acceptance criteria.
- `ready-for-agent`: an agent can pick up the issue with the repo, environment, scope, and acceptance criteria as written.
- `ready-for-human`: a human decision, approval, credential, live-system action, or product judgment is required.
- `wontfix`: the request is intentionally declined or superseded.

Observed Lobster Builder labels:

- `Implementation`
- `frontend`
- `system:lobster`
- `ready-for-agent`

Use `ready-for-agent` only when the issue has enough context for Codex to start without inventing product intent. Use `ready-for-human` for gateway credentials, production deployment choices, manual Codex environment setup, or OpenClaw policy decisions that cannot be inferred from repo docs.
