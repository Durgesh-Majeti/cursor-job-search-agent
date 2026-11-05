# cursor-job-search-agent

Agent SDK job-search agent: onboard → scout → fit-score → tailor → (approve) →
apply → verify → track / briefing.

Built with [`@grok/agent-sdk`](https://www.npmjs.com/package/@grok/agent-sdk)
(**Node 22.13+, never Bun**).

## What this is

- Skills under `bot/skills/` for the MVP loop
- Durable job / application / profile state via `host.kv` tools
- Facts-only tailoring (never invent employers, dates, or metrics)
- **No auto-apply** without job-level `approved` status
- Optional LoopCV MCP stub (disabled) for listing volume only
- Notes for Chrome DevTools MCP + self-hosted worker for local apply

The **approve inbox** is a local web dashboard in `apps/dashboard` (Vite + React).
Canvas was an early MVP only — prefer the dashboard. **Local-only** (`npm run
dashboard`); do not deploy to Vercel.

## Prerequisites

- Node.js `>= 22.13`
- Cursor credential for model turns: `CURSOR_API_KEY` or `npx @grok/agent-sdk login`

## Run locally

```bash
git clone https://github.com/Durgesh-Majeti/cursor-job-search-agent.git
cd cursor-job-search-agent
npm install

# Structural checks (no API key required)
npx --yes "@grok/agent-sdk@0.6.0" validate --dir .
npx --yes "@grok/agent-sdk@0.6.0" info --dir . --json
npm run check

# Playground (needs Cursor login / API key)
npx --yes "@grok/agent-sdk@0.6.0" login   # if needed
npx --yes "@grok/agent-sdk@0.6.0" dev --dir .
# open http://127.0.0.1:3000/playground

# One-shot turn
npx --yes "@grok/agent-sdk@0.6.0" run --dir . --message "Check my profile setup status with get_profile."

# Evals (needs model credential)
npx --yes "@grok/agent-sdk@0.6.0" eval --dir .
```

## Optional: LoopCV MCP

LoopCV is **not required**. To enable listing queries:

1. Copy `docs/examples/loopcv.ts` → `bot/mcp-connections/loopcv.ts`
2. Set the API header/env LoopCV documents
3. Set `advertiseTools: true` if the model should call those tools by name
4. Re-run `validate`

Endpoint stubbed in the example: `https://api.loopcv.com/mcp`.

## Local dashboard (approve / status)

```bash
npm --prefix apps/dashboard install
npm run dashboard
# UI:  http://127.0.0.1:5173
# API: http://127.0.0.1:8787
```

Reads `docs/project/*.json` + `bot/sandbox/workspace/applications/`. Approve
writes `docs/project/approvals.json` for the agent. See Project Context
`docs/dashboard.md` for details.

## Local apply (Chrome + self-hosted worker)

See [`docs/local-apply.md`](docs/local-apply.md). Target worker:
**`durgesh-laptop`** with Chrome DevTools MCP and Chrome logged into LinkedIn.

- **ATS forms** (Greenhouse → Lever → Ashby → Workday): `apply` skill
- **LinkedIn Easy Apply**: `linkedin-easy-apply` skill (local only). When
  searching LinkedIn: **last 48 hours** first, fall back to **last 7 days**
  if none match.

Until the worker + Chrome session are connected, the agent must classify apply
attempts as `needs_human` rather than claiming `applied`. Optional Gmail
readonly MCP can supply email verification codes during apply.

## Profile materials

Resume + profile live under `bot/sandbox/workspace/` (`profile.json`,
`experience-library.json`, `resume.md`, `resume.pdf`). Run the `setup` skill
to load them into `host.kv`. Confirm target locations before scouting.
Application name on forms: **Durgesh Majeti**.

## Skills

| Skill | Role |
| --- | --- |
| `setup` | Profile + experience library |
| `scout` | Listings → `upsert_job` |
| `fit-score` | 0–100 fit |
| `tailor-resume` | Facts-only per-JD resume |
| `cover-letter` | Short letter when required |
| `apply` | Approved ATS jobs; local browser |
| `linkedin-easy-apply` | Approved LinkedIn Easy Apply on self-hosted worker |
| `verify` | `applied` / `blocked` / `needs_human` |
| `track` | Pipeline + duplicates |
| `briefing` | Digest of matches and stuck apps |

## Safety

- Do not invent credentials or work history
- Do not submit applications without approval in durable state
- Always report apply outcomes as `applied`, `blocked`, or `needs_human`
