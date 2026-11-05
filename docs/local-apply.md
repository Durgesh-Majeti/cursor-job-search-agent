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
   apply (LinkedIn / employer MFA). See Project doc `docs/gmail-mcp-setup.md`
   (Context store). Scope must stay `gmail.readonly`.
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
3. On `durgesh-laptop`, ask the agent to Easy Apply the approved LinkedIn job
   URL. The skill will: open the listing → Easy Apply → fill from profile /
   answer memory → upload resume PDF → submit → hand off to `verify`.
4. If LinkedIn shows CAPTCHA, login challenge, or MFA:
   - Agent sets `needs_human` (does not invent `applied`).
   - If a code is emailed and Gmail readonly MCP is connected, the agent may
     read the code and continue; otherwise you complete the challenge in Chrome
     and re-run.
5. Mark `applied` only when confirmation UI / evidence is clear.

External “Apply” buttons that leave LinkedIn → use the `apply` skill for the
destination ATS (Greenhouse → Lever → Ashby → Workday).

## Safety

- Job must be `approved` / `ready_to_apply` before fill+submit.
- Never store passwords in `host.kv` or skills.
- Always finish with `verify` → `applied` | `blocked` | `needs_human`.
- Never invent employers, dates, metrics, or an `applied` outcome.

## Related

- Skill: `bot/skills/linkedin-easy-apply.md`
- Optional listing volume: copy `docs/examples/loopcv.ts` → `bot/mcp-connections/`
- Approve inbox: separate Cursor Canvas Project UI (not this repo)
