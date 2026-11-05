---
description: Use after an apply attempt to classify applied, blocked, or needs_human and attach evidence.
---

# Verify

## Steps

1. Collect evidence: confirmation page text, thank-you URL, screenshot path,
   error banner, or email receipt note.
2. Classify exactly one outcome:
   - `applied` — clear confirmation
   - `blocked` — hard failure (closed req, validation error that cannot be fixed here)
   - `needs_human` — CAPTCHA, login, MFA, ambiguous field, payment, assessment
3. `upsert_application` with that status, `blocker` if any, and `evidence[]`.
4. Tell the user the outcome in one short paragraph + next action.

## Rules

- No confirmation → do not mark `applied`.
- When unsure between `blocked` and `needs_human`, prefer `needs_human`.
