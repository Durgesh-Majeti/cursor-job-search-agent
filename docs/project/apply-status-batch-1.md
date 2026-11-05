# Apply status — batch 1

**Updated:** 2026-11-05T07:22Z (local `durgesh-laptop`)  
**Application name:** Durgesh Majeti  
**Artifacts on main:** `92bbdc0` — `bot/sandbox/workspace/applications/<job-id>/`

## Counts (honest — no invented applied)

| Status | Count |
| --- | ---: |
| applied | **1** |
| blocked | **1** |
| needs_human | **5** |
| pending_local | **13** |

## Summary table

| Status | Job id | Company | Title | Reason |
| --- | --- | --- | --- | --- |
| applied | `gh-databricks-8876680002` | Databricks | Senior Forward Deployed Engineer, Sr FDE (L5) | Greenhouse thank-you: “Thank you for applying to Databricks!” after user entered email security code |
| needs_human | `careers-h2o-Y4XkgBiojT` | H2O.ai | Senior AI Engineer | reCAPTCHA after form fill |
| blocked | `careers-h2o-yORWImeLx6` | H2O.ai | AI Engineer - Forward Deployed | Posting closed (“no longer available”) |
| needs_human | `lever-resilinc-98e013c3` | Resilinc | Senior Data Engineer | hCaptcha blocked submit |
| needs_human | `ashby-notion-79c18580` | Notion | Forward Deployed Engineer, India | reCAPTCHA Enterprise after submit |
| needs_human | `gh-gleanwork-4739975005` | Glean | Senior Data Engineer, Internal Data Platform & Analytics | reCAPTCHA; submit disabled |
| needs_human | `gh-karat-8880766002` | Karat | Senior Data Engineer (India) | Email verification code required |
| pending_local | `gh-databricks-8629999002` | Databricks | Senior Forward Deployed Engineer | Artifacts ready; local apply |
| pending_local | `gh-databricks-8878946002` | Databricks | Evergreen - AI Engineer, AI FDE | Artifacts ready; local apply |
| pending_local | `ashby-cursor-166c3951` | Cursor | Forward Deployed Engineer - India | Artifacts ready; local apply |
| pending_local | `lever-outreach-16657196` | Outreach | Senior Forward Deployed Engineer, Managed Services | Form partially filled locally; resume upload blocked by MCP path ACL |
| pending_local | `gh-arcana-4169688009` | Arcana | Senior AI Engineer — Inference & Agent Systems | Artifacts ready; local apply |
| pending_local | `gh-databricks-7845325002` | Databricks | Senior ML & AI Technical Solutions Engineer | Artifacts ready; local apply |
| pending_local | `gh-databricks-8585164002` | Databricks | Specialist Solutions Architect - AI/ML | Artifacts ready; local apply |
| pending_local | `careers-atlassian-27230` | Atlassian | Senior Data Platform Engineer | Artifacts ready; local apply |
| pending_local | `ashby-openai-4c078f82` | OpenAI | Forward Deployed Engineer - Singapore | Artifacts ready; local apply |
| pending_local | `gh-databricks-8530855002` | Databricks | Staff Forward Deployed Engineer | Artifacts ready; local apply |
| pending_local | `ashby-openai-8acfba11` | OpenAI | Applied AI Engineer | Artifacts ready; local apply |
| pending_local | `ashby-cursor-32350e7d` | Cursor | Solutions Architect - India | Artifacts ready; local apply |
| pending_local | `gh-gleanwork-4747460005` | Glean | Solutions Engineer (EMEA Shift) | Artifacts ready; local apply |

## Confirmed applied evidence

### `gh-databricks-8876680002`
- Confirmation URL (iframe): `https://job-boards.greenhouse.io/embed/job_app/confirmation?for=databricks&token=8876680002`
- Heading: **Thank you for applying to Databricks!**
- Body: *Your application has been received. If there is a fit, someone will be getting back to you shortly.*

## Local blockers note

Chrome DevTools MCP `upload_file` is ACL-blocked on this worker (“not within any of the configured workspace roots”). Greenhouse sometimes autofills a prior resume from the MCP Chrome profile; Lever/Ashby may still need a human attach of `bot/sandbox/workspace/resume.pdf` (also copied to `Downloads\durgesh-majeti-resume.pdf`).

Machine twin: [`/cursor/stores/self/internal/apply-status-batch-1.json`](/cursor/stores/self/internal/apply-status-batch-1.json)
