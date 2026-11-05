# Job Search Inbox (local dashboard)

Vite + React + Node API for Durgesh Majeti’s approve/apply desk.

- **Local only** — `npm run dev`; do not deploy (no Vercel).
- Resume upload + heuristic analyse
- Platform search checkboxes (ATS local; LinkedIn/Indeed/LoopCV stub → worker)
- Job list with fit scores, filters, Open JD, Skip/Block
- **Apply** → `docs/project/approvals.json` + `docs/project/apply-queue.json` (Chrome on self-hosted worker)
- Gmail sync stub (`docs/project/gmail-confirmations.json` / MCP later)

```bash
npm install
npm run dev
# UI  http://127.0.0.1:5173
# API http://127.0.0.1:8787
```

From repo root: `npm run dashboard`.

Full guide: Project Context `docs/dashboard.md` (and `docs/project/` data files in this repo).
