# Job Search Inbox (local dashboard)

Minimal Vite + React approve/status UI for this Agent SDK repo.

- **Local only** — run with `npm run dev`; do not deploy (no Vercel).
- Reads `docs/project/*.json` and workspace application folders.
- Approve → writes `docs/project/approvals.json` (agent-readable).
- Never invents `applied` — those statuses come from apply evidence only.

```bash
npm install
npm run dev
# open http://127.0.0.1:5173
```

From repo root: `npm run dashboard`.
