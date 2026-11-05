# Project status docs

Snapshot of Job Search Project status documents, plus local dashboard JSON.

## Status snapshots

| File | Description |
|------|-------------|
| [architecture-plan.md](./architecture-plan.md) | Agent architecture and workflow plan |
| [profile-summary.md](./profile-summary.md) | Candidate profile summary |
| [scout-batch-1.md](./scout-batch-1.md) | First scout batch results |
| [scout-batch-1.json](./scout-batch-1.json) | Scout batch 1 machine-readable twin |
| [approved-batch-1.md](./approved-batch-1.md) | Approved roles from batch 1 |
| [approved-batch-1.json](./approved-batch-1.json) | Approved batch 1 machine-readable twin |
| [apply-status-batch-1.md](./apply-status-batch-1.md) | Application status for batch 1 |
| [apply-status-batch-1.json](./apply-status-batch-1.json) | Apply status batch 1 machine-readable twin |
| [gmail-mcp-setup.md](./gmail-mcp-setup.md) | Gmail MCP setup notes |

## Dashboard + agent (local)

| File | Role |
| --- | --- |
| `scout-batch-1.json` | Scouted listings (fit scores, URLs) — shared with dashboard |
| `apply-status-batch-1.json` | Honest apply outcomes — never invent `applied` |
| `approvals.json` | Dashboard approvals; agent reads before apply |
| `apply-queue.json` | **Worker watch file** — Chrome apply queue from dashboard Apply |
| `job-decisions.json` | Skip / block from dashboard |
| `resume-analysis.json` | Last heuristic resume analysis (created on Analyse) |
| `search-request.json` | Last platform search request |
| `gmail-confirmations.json` | Gmail sync stub / ingested confirmation rows |

Workspace artifacts under `bot/sandbox/workspace/applications/<job-id>/` are merged at runtime (`meta.json`, `status.json`). Uploads land in `bot/sandbox/workspace/uploads/`.

Local UI: `apps/dashboard` via `npm run dashboard` (do not deploy).
