---
description: Use on the self-hosted worker for approved LinkedIn Easy Apply jobs via Chrome DevTools MCP; never claim applied without confirmation.
---

# LinkedIn Easy Apply

Local-only playbook for LinkedIn **Easy Apply** using Chrome DevTools MCP on
the self-hosted worker (`durgesh-laptop`). For Greenhouse / Lever / Ashby /
Workday, use the `apply` skill instead.

## Recency filter (Durgesh — non-negotiable when searching)

When **searching** LinkedIn Jobs (Jobs search UI or search URL), only consider
Easy Apply listings in this order:

1. **Last 48 hours** first — LinkedIn Date posted / `f_TPR=r172800`
   (48 × 3600 seconds).
2. If that window returns **no** matching Easy Apply results for the current
   query (title/location/Easy Apply filters), **fall back once** to
   **last 7 days** — `f_TPR=r604800`.
3. Do **not** widen past 7 days unless Durgesh explicitly asks.
4. Record which window you used in the attempt note / scout summary
   (`posted_within: 48h` or `posted_within: 7d`).

Already-approved jobs with a concrete URL may proceed without re-searching,
but if the listing UI shows a posted age **older than 7 days**, do not Easy
Apply — set `blocked` (stale) or ask before continuing.

This same 48h → 7d rule applies whenever this skill (or `scout` on LinkedIn)
runs a LinkedIn Jobs search on Durgesh's behalf.

## Preconditions (hard gate)

1. `get_application` / `get_job` — status must be **`approved`** or
   **`ready_to_apply`** after human job-level approval.
2. Job `source` is `linkedin` (or the URL is a LinkedIn job posting with Easy
   Apply). If the listing redirects to an external ATS, stop this skill and
   use `apply` for that ATS.
3. Run on the **self-hosted worker** with Chrome DevTools MCP attached and
   Chrome logged into Durgesh's LinkedIn session. See `docs/local-apply.md`.
4. Without local browser / LinkedIn session, set `needs_human` and stop.
   Cloud VMs must not pretend to Easy Apply.

## Profile facts (fill only these)

Load with `get_profile` + `recall_answers` + application artifacts. For Durgesh:

| Field | Value |
| --- | --- |
| Application name | Durgesh Majeti |
| Legal / resume name | Majeti V S S S Durgesh (use only when the form asks for legal name) |
| Email | `durgesh.majeti.007@gmail.com` |
| Phone | `+91 8885261298` |
| Location | Visakhapatnam, India |
| LinkedIn | `https://www.linkedin.com/in/majeti-durgesh/` |
| Notice | 90 days (flexible to 30) |
| Comp | current 20 LPA INR; expected ~27 LPA+ |

Resume PDF: prefer the tailored artifact under
`bot/sandbox/workspace/applications/<id>/resume.pdf`; otherwise the workspace
base `resume.pdf`. Never invent employers, dates, metrics, visas, or answers.

## Procedure

1. **Gate + status** — Confirm approval. Set application status `applying` with
   an `attemptNote` that names LinkedIn Easy Apply (and recency window if
   search was used).
2. **Open job** — Via Chrome DevTools MCP, open the job URL when known. If you
   must **search** Jobs for company + title (or a role query), apply the
   **Recency filter** above: start at 48h (`f_TPR=r172800`), fall back to 7d
   (`f_TPR=r604800`) only if empty. Confirm title/company match the job
   record before continuing.
3. **Detect Easy Apply**
   - If **Easy Apply** is present, continue.
   - If only **Apply** (external) → hand off to `apply` / ATS playbook; do not
     force Easy Apply.
   - If already applied / closed / no longer accepting → `blocked` with
     evidence; do not mark `applied`.
4. **Start Easy Apply** — Click Easy Apply. Work modal steps in order.
5. **Fill fields** — From profile, `recall_answers`, and confirmed
   `answers.json` only:
   - Contact, location, work auth / sponsorship only if known and confirmed
   - Recurring Qs: reuse remembered answers; ask before `remember_answer` for
     new ones
   - Unknown required field, unpaid assessment, or ambiguous legal attestation
     → stop, set `needs_human` with the exact question text
6. **Upload resume** — Attach the tailored (or base) PDF. Do not upload a
   fabricated file. Skip cover letter unless the form requires one and an
   artifact exists.
7. **Review** — Sense-check required fields and resume filename before submit.
8. **Submit** — Click submit / next through the final step only when the form
   is complete and no blocker is visible.
9. **Verify** — Hand off immediately to `verify`. Collect confirmation text,
   thank-you / applied UI, or screenshot. Mark `applied` **only** with clear
   confirmation evidence. No confirmation → do **not** invent `applied`.

## Blockers → `needs_human`

Stop fill/submit and set `needs_human` with blocker text + evidence when any of
these appear:

- CAPTCHA / bot check / puzzle
- Login wall, session expired, or LinkedIn challenge
- Phone / email MFA or security verification the agent cannot complete alone
- Unexpected redirect away from Easy Apply that needs human judgment

Optional **Gmail readonly MCP** (`gmail.readonly`): if LinkedIn or the employer
emails a verification code and Gmail MCP is available on the worker, search/
read the latest matching message and enter the code. If Gmail MCP is missing,
the inbox cannot be read, or the code is ambiguous → stay `needs_human`. Never
send mail; never store passwords.

## Rules

- Facts only. Profile is Durgesh Majeti — never invent personal data.
- Never auto-apply without `approved` / `ready_to_apply`.
- Never mark `applied` without confirmation evidence.
- Prefer evidence over optimism; when unsure use `needs_human`.
- Deduplicate: if `list_applications` already shows `applied` for this job,
  do not submit again.
- LinkedIn **search** recency: **48 hours first**, then **7 days** only if
  none match — never broader without explicit ask.
