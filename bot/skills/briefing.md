---
description: Use for a morning or weekly digest — new matches, stuck applications, and next actions.
---

# Briefing

## Steps

1. `list_jobs` and `list_applications`.
2. Summarize:
   - New high-fit jobs (score ≥ threshold) awaiting approval
   - In-flight (`tailoring`, `ready_to_apply`, `applying`)
   - Stuck (`needs_human`, `blocked`) with blocker one-liners
   - Recent `applied`
3. Propose at most 3 next actions.
4. Keep the digest short enough to read in under a minute.

## Rules

- No new applies from a briefing.
- Optional later: wire a `bot/schedules/` cron; never auto-fire under `--dev`.
