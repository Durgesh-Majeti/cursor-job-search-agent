---
description: Use for pipeline logging, duplicate detection, and response follow-ups across applications.
---

# Track

## Steps

1. `list_applications` / `list_jobs` for current pipeline.
2. Detect duplicates (same company+title or same URL) and recommend skip/merge.
3. Update statuses and attempt notes via `upsert_application`.
4. Flag stale `needs_human` / `blocked` items for the user.
5. Never silently change `approved` → `applied` without verify evidence.

## Rules

- Durable state lives in `host.kv` tools, not only in chat.
- Canvas inbox remains the human approve surface (separate Project).
