# Local apply — Chrome DevTools MCP + self-hosted worker

Real browser apply (LinkedIn, Indeed, multi-step Workday, logged-in ATS sessions)
needs a **self-hosted Cursor worker** on your machine and **Chrome DevTools MCP**
attached as a privileged host connection. Cloud-only runs can scout ATS URLs,
fit-score, and tailor — they must not pretend to submit applications.

## Why local

- Uses your real logged-in Chrome profile / session cookies
- Can screenshot confirmation pages for `verify`
- Stops cleanly on CAPTCHA / MFA / login → `needs_human`

## Setup sketch (not enabled in this scaffold)

1. Install and connect a Cursor **self-hosted worker** for this repo.
2. Enable Chrome DevTools MCP in Cursor (local browser automation).
3. Add a privileged connection under `bot/host-connections/` (start from
   `docs/examples/chrome-devtools-host.ts`) so only host/tool code can drive
   the browser — keep it out of casual model tool lists until ready.
4. Run apply turns on that worker, not on a disposable cloud VM without your
   profile.

## Safety

- Job must be `approved` / `ready_to_apply` before fill+submit.
- Never store passwords in `host.kv` or skills.
- Always finish with `verify` → `applied` | `blocked` | `needs_human`.

## Related

- Optional listing volume: `bot/mcp-connections/loopcv.example.ts`
- Approve inbox: separate Cursor Canvas Project UI (not this repo)
