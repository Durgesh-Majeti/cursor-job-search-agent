# Local apply — Chrome DevTools MCP + self-hosted worker

Real browser apply (LinkedIn Easy Apply, Indeed, multi-step Workday, logged-in
ATS sessions) needs a **self-hosted Cursor worker** on your machine and
**Chrome DevTools MCP** attached as a privileged host connection. Cloud-only
runs can scout ATS URLs, fit-score, and tailor — they must not pretend to
submit applications.

## Why local

- Uses your real logged-in Chrome profile / session cookies
- Can screenshot confirmation pages for `verify`
- Stops cleanly on CAPTCHA / MFA / login → `needs_human`

## Setup (self-hosted worker)

1. Install and connect a Cursor **self-hosted worker** for this repo.
   Worker name in use: **`durgesh-laptop`**.
2. Enable **Chrome DevTools MCP** in Cursor (local browser automation), e.g. in
   `%USERPROFILE%\.cursor\mcp.json` on Windows:

   ```json
   {
     "mcpServers": {
       "chrome-devtools": {
         "command": "cmd",
         "args": ["/c", "npx", "-y", "chrome-devtools-mcp@latest"]
       }
     }
   }
   ```

3. Optional: enable **Gmail readonly MCP** for email verification codes during
   apply (LinkedIn / employer MFA). See `docs/project/gmail-mcp-setup.md`.
   Scope must stay `gmail.readonly`. The local dashboard Sync Gmail button also
   reads the same `%USERPROFILE%\.gmail-mcp` tokens (no Cursor MCP mid-request).
4. Add a privileged connection under `bot/host-connections/` (start from
   `docs/examples/chrome-devtools-host.ts`) so only host/tool code can drive
   the browser — keep it out of casual model tool lists until ready.
5. Restart the worker so it picks up MCP:

   ```powershell
   cd "D:\Python Projects\cursor-job-search-agent"
   agent worker start --name "durgesh-laptop" --worker-dir .
   ```

6. Run apply / LinkedIn Easy Apply turns on that worker, not on a disposable
   cloud VM without your profile.

## LinkedIn Easy Apply (Chrome logged in)

Use skill **`linkedin-easy-apply`** (not the generic ATS `apply` playbook).

1. Open Chrome on the worker machine and **log into LinkedIn** as Durgesh
   (`https://www.linkedin.com/in/majeti-durgesh/`). Keep that profile session
   available to Chrome DevTools MCP.
2. Confirm the job is `approved` or `ready_to_apply` in durable state.
3. **Recency when searching LinkedIn Jobs:** Date posted = **last 48 hours**
   (`f_TPR=r172800`) first. If no Easy Apply matches, fall back once to
   **last 7 days** (`f_TPR=r604800`). Do not widen further unless asked.
4. On `durgesh-laptop`, ask the agent to Easy Apply the approved LinkedIn job
   URL. The skill will: open the listing → Easy Apply → fill from profile /
   answer memory → upload resume PDF → submit → hand off to `verify`.
5. If LinkedIn shows CAPTCHA, login challenge, or MFA:
   - Agent sets `needs_human` (does not invent `applied`).
   - If a code is emailed and Gmail readonly MCP is connected, the agent may
     read the code and continue; otherwise you complete the challenge in Chrome
     and re-run.
6. Mark `applied` only when confirmation UI / evidence is clear.

External “Apply” buttons that leave LinkedIn → use the `apply` skill for the
destination ATS (Greenhouse → Lever → Ashby → Workday).

## Dashboard apply queue

The local Vite dashboard (`apps/dashboard`, `npm run dashboard`) is the human
inbox. Clicking **Apply** on a job:

1. Writes/updates `docs/project/approvals.json` (`status: approved`)
2. Enqueues the job in **`docs/project/apply-queue.json`** (`status: queued`)

The self-hosted worker / agent should **watch** `docs/project/apply-queue.json`,
run Chrome DevTools apply (ATS or `linkedin-easy-apply`), then update
`apply-status*.json` / workspace `status.json` with evidence. The dashboard
never drives the browser or invents `applied`.

Skip/Block from the UI writes `docs/project/job-decisions.json` and removes the
job from the queue.

## Safety

- Job must be `approved` / `ready_to_apply` (or queued via dashboard Apply) before fill+submit.
- Never store passwords in `host.kv` or skills.
- Always finish with `verify` → `applied` | `blocked` | `needs_human`.
- Never invent employers, dates, metrics, or an `applied` outcome.

## Related

- Skill: `bot/skills/linkedin-easy-apply.md`
- Optional listing volume: copy `docs/examples/loopcv.ts` → `bot/mcp-connections/`
- Local inbox: `apps/dashboard` (`npm run dashboard`) — not Canvas, not hosted
