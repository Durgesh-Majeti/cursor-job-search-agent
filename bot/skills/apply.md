---
description: Use only for approved jobs — browser/ATS form fill on a self-hosted worker; never auto-apply without approval.
---

# Apply

## Preconditions (hard gate)

1. `get_application` / `get_job` — status must be **`approved`** or
   **`ready_to_apply`** after human job-level approval.
2. If not approved, stop. Tell the user to approve in the Canvas inbox (separate
   Project UI) or set status to `approved` deliberately.
3. Local Chrome DevTools MCP + self-hosted worker required for real form fill.
   See `docs/local-apply.md`. Without them, set `needs_human` and stop.

## ATS playbook order

Greenhouse → Lever → Ashby → Workday (multi-step). LinkedIn Easy Apply only on
local browser with the user's logged-in profile.

## Steps

1. Set status `applying` with `attemptNote`.
2. `recall_answers` for recurring questions; ask before saving new ones with
   `remember_answer` (confirmed only).
3. Fill fields from profile + artifacts. Sense-check required fields.
4. **Do not submit** if CAPTCHA, login wall, unpaid assessment, or ambiguous
   legal attestations appear — set `needs_human` with blocker text.
5. On submit, hand off to `verify` immediately.

## Rules

- Never invent credentials or personal data.
- Never apply to jobs that are not approved.
- Prefer evidence over optimism.
