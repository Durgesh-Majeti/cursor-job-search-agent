# Job Search Inbox (local dashboard)

Vite + React + Node API for Durgesh Majeti’s approve/apply desk.

- **Local only** — `npm run dev`; do not deploy (no Vercel).
- Resume upload + heuristic analyse
- Platform search checkboxes (ATS local; LinkedIn/Indeed/LoopCV stub → worker)
- Job list with fit scores, filters, Open JD, Skip/Block
- **Apply** → `docs/project/approvals.json` + `docs/project/apply-queue.json`; if `npm run apply-queue` is alive, claims for Chrome/agent; else UI says start the worker
- Gmail sync via local OAuth (`%USERPROFILE%\.gmail-mcp` → `docs/project/gmail-confirmations.json` + apply-status updates)

```bash
npm install
npm run dev
# UI  http://127.0.0.1:5173
# API http://127.0.0.1:8787
```

From repo root: `npm run dashboard`.

**Apply → Chrome:** keep the dashboard running, and in a second terminal:

```bash
npm run apply-queue
```

That heartbeats `docs/project/apply-runner-status.json` and claims queued jobs into `docs/project/apply-run-request.json`. A Cursor agent on **durgesh-laptop** with Chrome DevTools MCP fills/submits, then records `applied` | `blocked` | `needs_human` via `POST /api/apply-result`.

| API | Role |
| --- | --- |
| `POST /api/apply` | Approve + enqueue (+ claim if runner alive) |
| `GET /api/apply-runner` | Runner heartbeat / stale |
| `POST /api/apply-run` | Claim next (or `{ jobId }`) for Chrome |
| `POST /api/apply-result` | `{ jobId, status, reason?, evidence? }` |

**Gmail Sync** reads `%USERPROFILE%\.gmail-mcp\gcp-oauth.keys.json` + `credentials.json` (override with `GMAIL_MCP_CREDENTIALS_PATH`). Missing files → `{ connected: false, error: "…" }` with that path hint. Setup notes: `docs/project/gmail-mcp-setup.md`.

Smoke (credentials required):

```bash
node apps/dashboard/smoke-gmail.mjs
# or: POST http://127.0.0.1:8787/api/sync-gmail
```

Full guide: Project Context `docs/dashboard.md` (and `docs/project/` data files in this repo).
