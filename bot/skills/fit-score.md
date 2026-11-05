---
description: Use to score a job 0–100 against the profile and constraints; flag or skip below threshold.
---

# Fit score

## Steps

1. `get_profile` and `get_job` for the target id.
2. Score 0–100 using: role match, skills overlap with experience library,
   location/constraints, seniority, must-have keywords in the JD.
3. Write `fitScore` and short `fitNotes` via `upsert_job`.
4. Suggest a threshold (default **70**). Below threshold → recommend skip;
   create application with status `skipped` only if the user agrees.

## Rules

- Score from real profile facts only.
- Explain the top reasons in `fitNotes` (2–4 bullets).
- Do not approve or apply from this skill.
