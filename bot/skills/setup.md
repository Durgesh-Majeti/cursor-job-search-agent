---
description: Use for onboarding — parse resume, preferences, and experience-library interview into durable profile state.
---

# Setup

Build the durable profile and experience library. The user may not have uploaded
a resume yet — use placeholders and ask, never invent.

## Steps

1. Call `get_profile`. If empty or `placeholder: true`, say what is missing.
2. Ask for (or parse from files in the workspace):
   - Contact basics, target roles, locations, constraints
   - Work history as an **experience library** (employer, title, dates, STAR bullets, real metrics only)
3. Save with `save_profile`. Set `placeholder: false` only when real data landed.
4. Remind the user that Canvas approve-inbox is a separate Project UI; this agent
   stores pipeline state in `host.kv`.

## Rules

- Facts only. If a metric is unknown, omit it.
- Do not invent employers, titles, dates, or credentials.
- Prefer structured bullets with stable `id`s so tailor-resume can cite them.
