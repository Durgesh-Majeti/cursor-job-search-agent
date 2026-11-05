---
description: Use to produce a per-JD resume from the experience library — facts only, no invented employers/dates/metrics.
---

# Tailor resume

## Steps

1. Confirm application is `approved` or the user explicitly asked to draft materials.
2. `get_profile`, `get_job`, and load experience library.
3. Select and rewrite bullets that map to JD keywords — **reorder and rephrase only**.
4. Store artifact path on the application via `upsert_application`
   (`status: tailoring` → `ready_to_apply`, `artifactPaths.resume`).
5. Call out keyword coverage gaps honestly; do not invent bullets to fill them.

## Facts-only rules (mandatory)

- Never invent employers, job titles, dates, education, certifications, or metrics.
- Never add technologies you cannot ground in the experience library or profile.
- If a JD asks for something missing, note the gap; do not fabricate coverage.
- Prefer STAR bullets already in the library; light wording changes are OK.
