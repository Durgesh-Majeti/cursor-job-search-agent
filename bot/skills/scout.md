---
description: Use when finding or refreshing job listings from ATS careers pages, optional LoopCV, or local LinkedIn/Indeed.
---

# Scout

Pull listings into durable job records. Do not apply during scout.

## Sources (priority)

1. Company careers / ATS APIs (Greenhouse, Ashby, Lever, Workday) — most reliable
2. Optional LoopCV MCP — copy `docs/examples/loopcv.ts` into `bot/mcp-connections/` first
3. Local LinkedIn / Indeed via Chrome DevTools MCP on a **self-hosted worker**
   (see `docs/local-apply.md`) — expect bot resistance; never claim success without evidence

## Steps

1. Confirm targets from `get_profile` (roles, locations, constraints).
2. **LinkedIn search recency (Durgesh):** Date posted = **last 48 hours**
   (`f_TPR=r172800`) first. If that window returns no matches for the query,
   fall back once to **last 7 days** (`f_TPR=r604800`). Do not widen past 7
   days without an explicit ask. Note which window was used in the summary.
   (Same rule as `linkedin-easy-apply`.)
3. For each listing worth keeping, call `upsert_job` with a stable `id`
   (prefer URL hash or ATS job id), `url`, `title`, `company`, `source`, and JD text.
4. Optionally hand off to `fit-score` for each new job.
5. Summarize new jobs with ids and fit scores. Do not mark applications approved.

## Rules

- Deduplicate by URL / ATS id before upserting.
- Cloud agents: prefer ATS URLs. Local worker: LinkedIn/Indeed scrape only.
- LoopCV is optional listing volume — never required.
- LinkedIn Jobs search: **48h first**, then **7d** fallback only if empty.
