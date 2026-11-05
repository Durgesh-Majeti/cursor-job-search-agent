# Job search agent — architecture plan

## Goal

Approve a job once → agent customizes materials and applies → feedback loop reports **applied**, **blocked**, or **needs_human**. Built in Cursor (Agent SDK + skills + MCP), borrowing the proven patterns from today’s popular Claude job-search stacks — not wrapping a SaaS as the whole product.

## What the popular stacks teach us

| Stack | Pattern to keep | Pattern to skip / replace |
| --- | --- | --- |
| **LoopCV** (MCP SaaS) | Huge daily inventory; CV score; cover letters; status queries; Greenhouse/Lever/Workday/Ashby submit | Owning your search only through their paid apply pipe — optional MCP later, not the core |
| **Proficiently** (open skills) | Slash skills: setup → search → tailor → cover → apply; ATS-specific fill; answer approval; Telegram remote loop | Claude Code–only plugin install; their hosted apply product |
| **Job Application Automator / Workday copilots** | Multi-step Workday wizards; field inventory → fill → sense-check; resume + inline tailor | Blind submit without confirmation evidence |
| **Job Search OS** (Aakash Gupta) | Experience library as source of truth; fit scorer; morning briefing; app tracker; no fabricated bullets | Paid 18-skill dump as a black box — we encode the same *capabilities* as our own Agent SDK skills |

### Core capabilities we must ship (from those stacks)

1. **Onboarding / profile parsing** — resume + structured profile + work-history interview → durable `profile` + experience library  
2. **ATS optimization / resume tailoring** — per-JD rewrite from *real* experience only; keyword coverage; optional CV score  
3. **Automated form filling** — Greenhouse, Lever, Ashby, Workday multi-step; LinkedIn/Indeed where local browser allows; answer memory for recurring Qs  
4. **Status tracking** — pipeline states, blockers, evidence (screenshot/confirmation), weekly/morning briefing

## Stack we reuse in Cursor

| Piece | Role |
| --- | --- |
| **Agent SDK** (`@grok/agent-sdk`) | Orchestrator: tools, skills, schedules, `host.kv` |
| **Chrome DevTools MCP** | Local browser scrape + form fill in your logged-in profile |
| **Self-hosted worker** | Privileged apply/scrape on your machine |
| **Cloud agents** | Scout ATS, tailor, fit score, briefings |
| **Canvas** | MVP approve inbox + status |
| **cursor-subscriptions timers** | Status / briefing schedules |
| **LoopCV MCP (optional)** | Bolt-on listing volume if you already have an account — never required |

## Skill map (Agent SDK `bot/skills/`)

Mapped to Proficiently + Job Search OS, trimmed to what MVP needs:

| Skill | Does |
| --- | --- |
| `setup` | Parse resume, preferences, experience library interview |
| `scout` | Pull listings (ATS APIs + local LinkedIn/Indeed) |
| `fit-score` | 0–100 fit; below threshold → skip / flag |
| `tailor-resume` | Per-JD resume from experience library (facts only) |
| `cover-letter` | Short letter only when required |
| `apply` | Browser fill + submit on approved jobs (ATS playbooks) |
| `verify` | Confirmation / blocker / needs_human + evidence |
| `track` | Pipeline log, duplicates, response follow-ups |
| `briefing` | Morning digest: new matches, stuck apps, next actions |

Later (Job Search OS–style): interview prep, outreach, negotiate — after apply loop works.

## Agents (runtime)

1. **Scout** — cloud ATS + local LinkedIn/Indeed  
2. **Inbox** — approve / skip (Canvas); approval is the human gate  
3. **Tailor** — cloud; artifacts into Context  
4. **Applicant** — local Chrome; ATS playbooks (Greenhouse → Lever → Ashby → Workday)  
5. **Verifier** — local evidence + cloud classification → status in `host.kv` + inbox  

Approve once at the **job** level (your preference). Verifier still stops on CAPTCHA / login / ambiguous fields and sets `needs_human` — same safety net Proficiently’s two-phase fill provides, without asking twice for every field when the mapping is known.

## Load split

```
Cloud                              Local machine
─────────────────────────          ──────────────────────────
setup parse, fit-score, tailor     LinkedIn / Indeed scout
ATS / careers scout                apply + Workday wizards
briefing + track aggregation       Chrome profile + screenshots
optional LoopCV MCP queries        self-hosted worker
```

## Data model

- `profile` + **experience library** (STAR bullets, skills, constraints — Job Search OS pattern)  
- `job` — url, source, JD, fit score  
- `application` — status, attempt log, blocker, evidence  
- `artifacts` — tailored resume, cover, Q&A map  
- `answer_memory` — confirmed answers for recurring form questions  

## MVP sequence

1. `setup` + experience library in Context; self-hosted worker + Chrome DevTools  
2. `scout` Greenhouse/Ashby (+ optional LoopCV) → Canvas inbox with fit scores  
3. Approve → `tailor-resume` → `apply` → `verify` → `track`  
4. Workday multi-step + LinkedIn Easy Apply; `briefing` schedule  
5. Optional: LoopCV MCP, Telegram-style remote approve (Proficiently pattern)

## Honest constraints

- LinkedIn/Indeed fight bots — Verifier + human handoff required  
- ATS portals are more reliable than LinkedIn scrape for auto-submit  
- No self-hosted worker connected yet  
- Tailoring must not invent employers, dates, or metrics (Job Search OS / ApplyPilot rule)

## Locked product choices

- New GitHub repo: `cursor-job-search-agent` (scaffolding in progress)  
- Inbox: [Job Search Inbox](https://cursor.com/canvas/store-21b16146-1671-4ab0-96d9-abeb558f5a09/cf43eedc-4912-467e-be8a-2d8fa4fde0fe) Canvas  
- LoopCV MCP: optional listing source only  
- Resume / targets: user will supply later
