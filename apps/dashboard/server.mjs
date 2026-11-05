#!/usr/bin/env node
/**
 * Local dashboard API + static server.
 * Resume upload/analyse, platform search stubs, job inbox, apply queue,
 * skip/block, Gmail confirmation sync via local OAuth (.gmail-mcp).
 * Local-only — do not deploy.
 */
import http from "node:http";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import {
  probeGmailConnection,
  resolveGmailMcpDir,
  syncGmailConfirmations,
} from "./gmail-local.mjs";
import {
  claimQueuedJob,
  loadJobArtifacts,
  readRunnerStatus,
  recordApplyOutcome,
  RUN_REQUEST_FILE,
  upsertQueueEntry,
  readJson as readProjectJson,
} from "./apply-queue-lib.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "../..");
const PROJECT_DIR = path.join(REPO_ROOT, "docs/project");
const WORKSPACE_DIR = path.join(REPO_ROOT, "bot/sandbox/workspace");
const APPS_DIR = path.join(WORKSPACE_DIR, "applications");
const UPLOADS_DIR = path.join(WORKSPACE_DIR, "uploads");
const DIST_DIR = path.join(__dirname, "dist");

const API_PORT = Number(process.env.DASHBOARD_API_PORT || 8787);
const DEV = process.argv.includes("--dev");

const DISPLAY_STATUSES = [
  "pending",
  "approved",
  "queued",
  "applied",
  "blocked",
  "needs_human",
  "skipped",
];

const PLATFORM_SOURCES = {
  linkedin: ["linkedin"],
  indeed: ["indeed"],
  greenhouse: ["greenhouse", "lever", "ashby", "careers", "workday", "company"],
  loopcv: ["loopcv"],
};

async function readJson(file, fallback = null) {
  try {
    const raw = await fs.readFile(file, "utf8");
    return JSON.parse(raw);
  } catch (err) {
    if (err && err.code === "ENOENT") return fallback;
    throw err;
  }
}

async function writeJson(file, data) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, `${JSON.stringify(data, null, 2)}\n`, "utf8");
}

function httpError(status, message) {
  const err = new Error(message);
  err.status = status;
  return err;
}

function normalizeStatus(raw) {
  if (!raw) return null;
  const s = String(raw).toLowerCase();
  if (
    s === "pending_local" ||
    s === "draft" ||
    s === "ready_to_apply" ||
    s === "tailoring" ||
    s === "applying"
  ) {
    return "pending";
  }
  if (s === "approved") return "approved";
  if (s === "queued" || s === "in_progress") return "queued";
  if (s === "applied") return "applied";
  if (s === "blocked") return "blocked";
  if (s === "needs_human") return "needs_human";
  if (s === "skipped" || s === "withdrawn") return "skipped";
  return null;
}

async function loadWorkspaceApps() {
  const byId = new Map();
  let entries = [];
  try {
    entries = await fs.readdir(APPS_DIR, { withFileTypes: true });
  } catch (err) {
    if (err && err.code === "ENOENT") return byId;
    throw err;
  }

  for (const ent of entries) {
    if (!ent.isDirectory()) continue;
    const dir = path.join(APPS_DIR, ent.name);
    const meta = await readJson(path.join(dir, "meta.json"), null);
    const statusFile = await readJson(path.join(dir, "status.json"), null);
    const jobId = meta?.jobId || ent.name;
    byId.set(jobId, {
      jobId,
      company: meta?.company ?? null,
      title: meta?.title ?? null,
      url: meta?.url ?? null,
      source: meta?.source ?? null,
      fitScore: meta?.fitScore ?? null,
      metaStatus: normalizeStatus(meta?.status),
      workspaceStatus: normalizeStatus(statusFile?.status),
      reason: statusFile?.reason ?? meta?.reason ?? null,
      evidence: statusFile?.evidence ?? null,
      artifactPath: `bot/sandbox/workspace/applications/${ent.name}/`,
    });
  }
  return byId;
}

async function loadApplyStatus() {
  const primary = path.join(PROJECT_DIR, "apply-status-batch-1.json");
  const alias = path.join(PROJECT_DIR, "apply-status.json");
  const fromPrimary = await readJson(primary, null);
  if (fromPrimary) return { data: fromPrimary, file: primary };
  const fromAlias = await readJson(alias, { jobs: [], counts: {} });
  return { data: fromAlias, file: alias };
}

async function loadApplyQueue() {
  const file = path.join(PROJECT_DIR, "apply-queue.json");
  const data = await readJson(file, { updatedAt: null, queue: [] });
  return { file, data };
}

async function loadDecisions() {
  const file = path.join(PROJECT_DIR, "job-decisions.json");
  const data = await readJson(file, { updatedAt: null, decisions: [] });
  return { file, data };
}

async function buildJobs() {
  const scout = await readJson(path.join(PROJECT_DIR, "scout-batch-1.json"), {
    jobs: [],
  });
  const { data: applyStatus, file: applyStatusFile } = await loadApplyStatus();
  const approvalsDoc = await readJson(path.join(PROJECT_DIR, "approvals.json"), {
    approvals: [],
  });
  const { data: queueDoc, file: queueFile } = await loadApplyQueue();
  const { data: decisionsDoc, file: decisionsFile } = await loadDecisions();
  const workspace = await loadWorkspaceApps();
  const searchReq = await readJson(path.join(PROJECT_DIR, "search-request.json"), null);

  const approvalById = new Map();
  for (const a of approvalsDoc.approvals || []) {
    if (a?.jobId) approvalById.set(a.jobId, a);
  }

  const applyById = new Map();
  for (const j of applyStatus.jobs || []) {
    if (j?.jobId) applyById.set(j.jobId, j);
  }

  const queueById = new Map();
  for (const q of queueDoc.queue || []) {
    if (q?.jobId) queueById.set(q.jobId, q);
  }

  const decisionById = new Map();
  for (const d of decisionsDoc.decisions || []) {
    if (d?.jobId) decisionById.set(d.jobId, d);
  }

  const jobsMap = new Map();

  for (const j of scout.jobs || []) {
    if (!j?.id) continue;
    jobsMap.set(j.id, {
      id: j.id,
      title: j.title,
      company: j.company,
      location: j.location ?? null,
      url: j.url,
      source: j.source,
      fitScore: j.fitScore ?? null,
      fitNotes: j.fitNotes ?? null,
      status: "pending",
      reason: null,
      evidence: null,
      artifactPath: null,
      statusSource: "scout",
      queueStatus: null,
    });
  }

  for (const [jobId, w] of workspace) {
    const existing = jobsMap.get(jobId) || {
      id: jobId,
      title: w.title,
      company: w.company,
      location: null,
      url: w.url,
      source: w.source,
      fitScore: w.fitScore,
      fitNotes: null,
      status: "pending",
      reason: null,
      evidence: null,
      artifactPath: w.artifactPath,
      statusSource: "workspace",
      queueStatus: null,
    };
    existing.title = existing.title || w.title;
    existing.company = existing.company || w.company;
    existing.url = existing.url || w.url;
    existing.source = existing.source || w.source;
    existing.fitScore = existing.fitScore ?? w.fitScore;
    existing.artifactPath = w.artifactPath;
    if (w.workspaceStatus) {
      existing.status = w.workspaceStatus;
      existing.reason = w.reason;
      existing.evidence = w.evidence;
      existing.statusSource = "workspace-status";
    } else if (w.metaStatus && existing.status === "pending") {
      existing.status = w.metaStatus === "approved" ? "approved" : "pending";
      existing.statusSource = "workspace-meta";
    }
    jobsMap.set(jobId, existing);
  }

  for (const [jobId, a] of applyById) {
    const existing = jobsMap.get(jobId) || {
      id: jobId,
      title: a.title,
      company: a.company,
      location: null,
      url: a.url,
      source: a.source,
      fitScore: null,
      fitNotes: null,
      status: "pending",
      reason: null,
      evidence: null,
      artifactPath: a.artifactPath ?? null,
      statusSource: "apply-status",
      queueStatus: null,
    };
    existing.title = existing.title || a.title;
    existing.company = existing.company || a.company;
    existing.url = existing.url || a.url;
    existing.source = existing.source || a.source;
    existing.artifactPath = existing.artifactPath || a.artifactPath || null;
    const st = normalizeStatus(a.status);
    if (st) {
      existing.status = st;
      existing.reason = a.reason ?? existing.reason;
      existing.evidence = a.evidence ?? existing.evidence;
      existing.statusSource = "apply-status";
    }
    jobsMap.set(jobId, existing);
  }

  for (const [jobId, a] of approvalById) {
    const existing = jobsMap.get(jobId);
    if (!existing) continue;
    if (existing.status === "pending") {
      existing.status = "approved";
      existing.reason = a.note || "Approved via dashboard";
      existing.approvedAt = a.approvedAt ?? null;
      existing.statusSource = "approvals";
    } else if (existing.status === "approved" || existing.status === "queued") {
      existing.approvedAt = a.approvedAt ?? existing.approvedAt ?? null;
    }
  }

  for (const [jobId, q] of queueById) {
    const existing = jobsMap.get(jobId);
    if (!existing) continue;
    existing.queueStatus = q.status || "queued";
    existing.queuedAt = q.queuedAt ?? null;
    if (
      existing.status === "pending" ||
      existing.status === "approved" ||
      existing.status === "queued"
    ) {
      const qs = normalizeStatus(q.status) || "queued";
      if (qs === "queued") {
        existing.status = "queued";
        existing.reason =
          q.note ||
          "Queued for Chrome apply on self-hosted worker (docs/project/apply-queue.json)";
        existing.statusSource = "apply-queue";
      }
    }
  }

  for (const [jobId, d] of decisionById) {
    const existing = jobsMap.get(jobId);
    if (!existing) continue;
    const action = String(d.action || "").toLowerCase();
    if (action === "skipped" || action === "blocked") {
      if (
        existing.status === "pending" ||
        existing.status === "approved" ||
        existing.status === "queued" ||
        existing.status === "skipped"
      ) {
        existing.status = action === "blocked" ? "blocked" : "skipped";
        existing.reason = d.note || (action === "blocked" ? "Blocked via dashboard" : "Skipped via dashboard");
        existing.statusSource = "job-decisions";
      }
    }
  }

  let jobs = [...jobsMap.values()];

  const activePlatforms = Array.isArray(searchReq?.platforms) ? searchReq.platforms : [];
  if (activePlatforms.length > 0 && searchReq?.filterActive) {
    const allowed = new Set();
    for (const p of activePlatforms) {
      for (const src of PLATFORM_SOURCES[p] || []) allowed.add(src);
    }
    if (allowed.size > 0) {
      jobs = jobs.filter((j) => allowed.has(String(j.source || "").toLowerCase()));
    }
  }

  jobs.sort((x, y) => {
    const fs = (y.fitScore ?? -1) - (x.fitScore ?? -1);
    if (fs !== 0) return fs;
    return String(x.company).localeCompare(String(y.company));
  });

  const counts = Object.fromEntries(DISPLAY_STATUSES.map((s) => [s, 0]));
  for (const j of jobs) {
    if (counts[j.status] !== undefined) counts[j.status] += 1;
    else counts.pending += 1;
  }

  return {
    updatedAt: new Date().toISOString(),
    applicationName: applyStatus.applicationName || scout.applicationName || null,
    sources: {
      scout: path.relative(REPO_ROOT, path.join(PROJECT_DIR, "scout-batch-1.json")),
      applyStatus: path.relative(REPO_ROOT, applyStatusFile),
      approvals: path.relative(REPO_ROOT, path.join(PROJECT_DIR, "approvals.json")),
      applyQueue: path.relative(REPO_ROOT, queueFile),
      decisions: path.relative(REPO_ROOT, decisionsFile),
      workspace: "bot/sandbox/workspace/applications/",
    },
    search: searchReq
      ? {
          platforms: searchReq.platforms || [],
          status: searchReq.status || "idle",
          updatedAt: searchReq.updatedAt || null,
          note: searchReq.note || null,
          resultCount: searchReq.resultCount ?? null,
        }
      : null,
    counts,
    jobs,
  };
}

async function writeApproval(job, note) {
  const file = path.join(PROJECT_DIR, "approvals.json");
  const doc = await readJson(file, { updatedAt: null, approvals: [] });
  const now = new Date().toISOString();
  const entry = {
    jobId: job.id,
    status: "approved",
    approvedAt: now,
    company: job.company,
    title: job.title,
    url: job.url,
    note: note || "Approved via dashboard Apply",
  };
  const idx = (doc.approvals || []).findIndex((a) => a.jobId === job.id);
  if (idx >= 0) doc.approvals[idx] = entry;
  else doc.approvals.push(entry);
  doc.updatedAt = now;
  await writeJson(file, doc);
  return entry;
}

async function approveJob(jobId, note) {
  if (!jobId || typeof jobId !== "string") throw httpError(400, "jobId required");
  const snapshot = await buildJobs();
  const job = snapshot.jobs.find((j) => j.id === jobId);
  if (!job) throw httpError(404, `Unknown jobId: ${jobId}`);
  if (["applied", "blocked", "needs_human", "skipped"].includes(job.status)) {
    throw httpError(
      409,
      `Cannot approve job in status "${job.status}" — status comes from apply evidence or decisions.`,
    );
  }
  const approval = await writeApproval(job, note || "Approved via dashboard");
  return { saved: true, approval, jobs: await buildJobs() };
}

async function applyJob(jobId, note) {
  if (!jobId || typeof jobId !== "string") throw httpError(400, "jobId required");
  const snapshot = await buildJobs();
  const job = snapshot.jobs.find((j) => j.id === jobId);
  if (!job) throw httpError(404, `Unknown jobId: ${jobId}`);
  if (["applied", "blocked", "needs_human", "skipped"].includes(job.status)) {
    throw httpError(409, `Cannot queue apply for status "${job.status}"`);
  }

  const approval = await writeApproval(
    job,
    note || "Apply requested via dashboard — worker should submit with Chrome",
  );

  const now = new Date().toISOString();
  const entry = await upsertQueueEntry({
    jobId: job.id,
    queuedAt: now,
    status: "queued",
    company: job.company,
    title: job.title,
    url: job.url,
    source: job.source,
    fitScore: job.fitScore,
    note:
      note ||
      "Apply via Chrome DevTools MCP on self-hosted worker. Dashboard does not submit forms.",
  });

  // Clear skip/block if re-applying
  const decisions = await loadDecisions();
  const filtered = (decisions.data.decisions || []).filter((d) => d.jobId !== job.id);
  if (filtered.length !== (decisions.data.decisions || []).length) {
    decisions.data.decisions = filtered;
    decisions.data.updatedAt = now;
    await writeJson(decisions.file, decisions.data);
  }

  const runner = await readRunnerStatus();
  let claimed = null;
  let message;
  if (runner.alive) {
    // Runner is up — claim immediately so Chrome/agent handshake is ready
    const claim = await claimQueuedJob(job.id);
    claimed = claim.claimed ? claim.entry : null;
    message = claimed
      ? `Queued and claimed by local apply runner — Chrome/agent should apply ${job.id} now (see docs/project/apply-run-request.json).`
      : `Queued — local apply runner is alive and will claim ${job.id} shortly.`;
  } else {
    message = `Queued — start apply worker: npm run apply-queue (then Chrome DevTools MCP / agent on durgesh-laptop).`;
  }

  const artifacts = await loadJobArtifacts(job.id);

  return {
    saved: true,
    approval,
    queueEntry: claimed || entry,
    runner,
    claimed: Boolean(claimed),
    artifacts: {
      dir: artifacts.dir,
      hasResumePdf: Boolean(artifacts.resumePdf),
      hasAnswers: Boolean(artifacts.answers),
    },
    message,
    jobs: await buildJobs(),
  };
}

async function applyRun(body = {}) {
  const runner = await readRunnerStatus();
  const claim = await claimQueuedJob(body.jobId || null);
  if (!claim.claimed) {
    return {
      claimed: false,
      runner,
      message: body.jobId
        ? `No queued/in_progress entry for ${body.jobId}`
        : "No queued jobs in docs/project/apply-queue.json",
      request: await readProjectJson(RUN_REQUEST_FILE, null),
      jobs: await buildJobs(),
    };
  }
  return {
    claimed: true,
    runner,
    entry: claim.entry,
    request: claim.request,
    message: `Claimed ${claim.entry.jobId} for Chrome apply. Drive DevTools MCP, then POST /api/apply-result.`,
    jobs: await buildJobs(),
  };
}

async function applyResult(body = {}) {
  if (!body.jobId) throw httpError(400, "jobId required");
  if (!body.status) throw httpError(400, "status required (applied|blocked|needs_human)");
  const outcome = await recordApplyOutcome({
    jobId: body.jobId,
    status: body.status,
    reason: body.reason,
    evidence: body.evidence,
    company: body.company,
    title: body.title,
    url: body.url,
    source: body.source,
    via: body.via || "dashboard_api",
  });
  return {
    saved: true,
    outcome,
    message: `Recorded ${outcome.status} for ${outcome.jobId}`,
    jobs: await buildJobs(),
  };
}

async function decideJob(jobId, action, note) {
  if (!jobId || typeof jobId !== "string") throw httpError(400, "jobId required");
  if (!["skipped", "blocked"].includes(action)) {
    throw httpError(400, 'action must be "skipped" or "blocked"');
  }
  const snapshot = await buildJobs();
  const job = snapshot.jobs.find((j) => j.id === jobId);
  if (!job) throw httpError(404, `Unknown jobId: ${jobId}`);
  if (["applied", "needs_human"].includes(job.status) && action === "skipped") {
    throw httpError(409, `Cannot skip job in status "${job.status}"`);
  }

  const { file, data } = await loadDecisions();
  const now = new Date().toISOString();
  const entry = {
    jobId,
    action,
    at: now,
    company: job.company,
    title: job.title,
    note: note || (action === "blocked" ? "Blocked via dashboard" : "Skipped via dashboard"),
  };
  const decisions = Array.isArray(data.decisions) ? data.decisions : [];
  const idx = decisions.findIndex((d) => d.jobId === jobId);
  if (idx >= 0) decisions[idx] = entry;
  else decisions.push(entry);
  data.decisions = decisions;
  data.updatedAt = now;
  await writeJson(file, data);

  // Drop from apply queue if present
  const queue = await loadApplyQueue();
  const before = (queue.data.queue || []).length;
  queue.data.queue = (queue.data.queue || []).filter((q) => q.jobId !== jobId);
  if (queue.data.queue.length !== before) {
    queue.data.updatedAt = now;
    await writeJson(queue.file, queue.data);
  }

  return { saved: true, decision: entry, jobs: await buildJobs() };
}

async function resumeInfo() {
  const candidates = [
    { path: path.join(UPLOADS_DIR, "resume-latest.md"), kind: "upload-md" },
    { path: path.join(UPLOADS_DIR, "resume-latest.pdf"), kind: "upload-pdf" },
    { path: path.join(UPLOADS_DIR, "resume-latest.txt"), kind: "upload-txt" },
    { path: path.join(WORKSPACE_DIR, "resume.md"), kind: "workspace-md" },
    { path: path.join(WORKSPACE_DIR, "resume.pdf"), kind: "workspace-pdf" },
  ];
  let current = null;
  for (const c of candidates) {
    try {
      const st = await fs.stat(c.path);
      current = {
        path: path.relative(REPO_ROOT, c.path),
        kind: c.kind,
        bytes: st.size,
        mtime: st.mtime.toISOString(),
      };
      break;
    } catch {
      /* try next */
    }
  }
  const analysis = await readJson(path.join(PROJECT_DIR, "resume-analysis.json"), null);
  return { current, analysis };
}

function decodeBase64Payload(contentBase64) {
  const cleaned = String(contentBase64 || "").replace(/^data:[^;]+;base64,/, "");
  return Buffer.from(cleaned, "base64");
}

async function uploadResume(body) {
  const filename = String(body.filename || "resume.bin");
  const ext = path.extname(filename).toLowerCase() || ".bin";
  if (![".pdf", ".md", ".txt", ".markdown"].includes(ext)) {
    throw httpError(400, "Supported resume types: .pdf, .md, .txt");
  }
  if (!body.contentBase64 && !body.text) {
    throw httpError(400, "Provide contentBase64 or text");
  }

  await fs.mkdir(UPLOADS_DIR, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const savedName = `resume-${stamp}${ext === ".markdown" ? ".md" : ext}`;
  const savedPath = path.join(UPLOADS_DIR, savedName);

  if (body.text != null) {
    await fs.writeFile(savedPath, String(body.text), "utf8");
  } else {
    await fs.writeFile(savedPath, decodeBase64Payload(body.contentBase64));
  }

  const latestExt = ext === ".markdown" ? ".md" : ext;
  const latestPath = path.join(UPLOADS_DIR, `resume-latest${latestExt}`);
  await fs.copyFile(savedPath, latestPath);

  // Keep text sibling for PDF uploads when text provided
  if (ext === ".pdf" && body.text) {
    await fs.writeFile(path.join(UPLOADS_DIR, "resume-latest.md"), String(body.text), "utf8");
  }

  return {
    saved: true,
    path: path.relative(REPO_ROOT, savedPath),
    latest: path.relative(REPO_ROOT, latestPath),
    resume: await resumeInfo(),
  };
}

async function readResumeText() {
  const mdCandidates = [
    path.join(UPLOADS_DIR, "resume-latest.md"),
    path.join(UPLOADS_DIR, "resume-latest.txt"),
    path.join(WORKSPACE_DIR, "resume.md"),
  ];
  for (const p of mdCandidates) {
    try {
      return { text: await fs.readFile(p, "utf8"), path: path.relative(REPO_ROOT, p) };
    } catch {
      /* next */
    }
  }
  // PDF present but no extract — still analyse profile.json hints
  return { text: "", path: null };
}

function analyseResumeText(text, profile) {
  const lower = text.toLowerCase();
  const targetRoles = profile?.targetRoles || [
    "Senior AI Engineer",
    "Senior Data Engineer",
    "Forward Deployed Engineer",
  ];
  const keywordGroups = {
    data_engineering: ["databricks", "spark", "pyspark", "etl", "elt", "airflow", "delta lake"],
    cloud: ["azure", "aws", "gcp", "s3", "adf", "glue", "lambda"],
    ai: ["gen ai", "generative", "rag", "llm", "agent", "mcp", "prompt"],
    languages: ["python", "sql", "scala", "typescript"],
    soft_ats: ["remote", "hyderabad", "bangalore", "bengaluru"],
  };

  const hits = {};
  let hitCount = 0;
  for (const [group, words] of Object.entries(keywordGroups)) {
    const found = words.filter((w) => lower.includes(w));
    hits[group] = found;
    hitCount += found.length;
  }

  const hasEmail = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i.test(text);
  const hasPhone = /(\+?\d[\d\s()-]{8,}\d)/.test(text);
  const hasLinkedIn = /linkedin\.com/i.test(text);
  const hasMetrics = /\d+%|\d+\+?\s*(years?|yrs?)/i.test(text);
  const wordCount = text.trim() ? text.trim().split(/\s+/).length : 0;

  const strengths = [];
  const gaps = [];
  const suggestions = [];

  if (hitCount >= 8) strengths.push("Strong coverage of data/AI/cloud keywords for ATS.");
  else if (hitCount >= 4) strengths.push("Partial keyword coverage for target roles.");
  else gaps.push("Few target-role keywords detected — expand skills / tools section.");

  if (hits.ai?.length) strengths.push(`AI/GenAI signals: ${hits.ai.slice(0, 4).join(", ")}.`);
  else gaps.push("Limited GenAI / RAG / agent keywords for Senior AI / FDE titles.");

  if (hits.data_engineering?.length) {
    strengths.push(`Data engineering stack present: ${hits.data_engineering.slice(0, 4).join(", ")}.`);
  }

  if (hasEmail && hasPhone) strengths.push("Contact block includes email and phone.");
  else gaps.push("Missing or incomplete contact details (email/phone).");

  if (hasLinkedIn) strengths.push("LinkedIn URL present.");
  else suggestions.push("Add a LinkedIn URL near the header for recruiter lookup.");

  if (hasMetrics) strengths.push("Includes quantified impact or tenure metrics.");
  else suggestions.push("Add 2–3 quantified outcomes (%, latency, scale) from real work only.");

  if (wordCount > 0 && wordCount < 250) {
    gaps.push(`Resume text is short (${wordCount} words) — may under-represent experience.`);
  } else if (wordCount > 900) {
    suggestions.push("Consider trimming to ~1–2 pages for ATS readability.");
  }

  if (!text.trim()) {
    gaps.push("No extractable text found (PDF-only upload). Paste markdown or upload .md/.txt for richer analysis.");
  }

  const roleFit = targetRoles.map((role) => {
    const tokens = role.toLowerCase().split(/\s+/).filter((t) => t.length > 2);
    const matched = tokens.filter((t) => lower.includes(t));
    const score = Math.round((matched.length / Math.max(tokens.length, 1)) * 100);
    return { role, score, matched };
  });

  let score = 40;
  score += Math.min(25, hitCount * 2);
  if (hasEmail) score += 5;
  if (hasPhone) score += 5;
  if (hasLinkedIn) score += 5;
  if (hasMetrics) score += 10;
  if (wordCount >= 300 && wordCount <= 900) score += 10;
  score = Math.max(0, Math.min(100, score));

  return {
    analysedAt: new Date().toISOString(),
    sourcePath: null,
    wordCount,
    score,
    applicationName: profile?.fullName || "Durgesh Majeti",
    targetRoles,
    keywordHits: hits,
    roleFit,
    strengths,
    gaps,
    suggestions,
    method: "local_heuristics_v1",
    note: "Heuristic only — optional agent/LLM pass can refine later. Never invent employers, dates, or metrics.",
  };
}

async function analyseResume() {
  const profile = await readJson(path.join(WORKSPACE_DIR, "profile.json"), {});
  const { text, path: sourcePath } = await readResumeText();
  const analysis = analyseResumeText(text, profile);
  analysis.sourcePath = sourcePath;
  const out = path.join(PROJECT_DIR, "resume-analysis.json");
  await writeJson(out, analysis);
  return { saved: true, path: path.relative(REPO_ROOT, out), analysis };
}

async function searchJobs(body) {
  const platforms = Array.isArray(body.platforms) ? body.platforms : [];
  const allowed = new Set(Object.keys(PLATFORM_SOURCES));
  const selected = platforms.filter((p) => allowed.has(p));
  if (!selected.length) throw httpError(400, "Select at least one platform");

  const scout = await readJson(path.join(PROJECT_DIR, "scout-batch-1.json"), { jobs: [] });
  const allowedSources = new Set();
  for (const p of selected) {
    for (const s of PLATFORM_SOURCES[p]) allowedSources.add(s);
  }

  const matched = (scout.jobs || []).filter((j) =>
    allowedSources.has(String(j.source || "").toLowerCase()),
  );

  const liveNeeded = selected.filter((p) => p === "linkedin" || p === "indeed" || p === "loopcv");
  const now = new Date().toISOString();
  const request = {
    updatedAt: now,
    platforms: selected,
    status: liveNeeded.length ? "stub_partial" : "local_ats_ok",
    filterActive: true,
    resultCount: matched.length,
    liveNeeded,
    note:
      liveNeeded.length > 0
        ? `Local ATS results shown where available (${matched.length}). Live scrape for ${liveNeeded.join(", ")} needs the self-hosted worker + Chrome DevTools (and LoopCV MCP if selected).`
        : `Filtered scout batch to ATS/company sources (${matched.length} jobs).`,
  };
  await writeJson(path.join(PROJECT_DIR, "search-request.json"), request);

  const jobsPayload = await buildJobs();
  return {
    saved: true,
    search: request,
    jobs: jobsPayload,
  };
}

function classificationToApplyStatus(classification) {
  const c = String(classification || "").toLowerCase();
  // Only confirmation→applied and rejection→blocked mutate apply-status.
  // Interview/verification stay as confirmation rows (avoid newsletter false positives).
  if (c === "confirmation" || c === "applied") return "applied";
  if (c === "rejection") return "blocked";
  return null;
}

async function applyGmailConfirmationsToStatus(confirmations, now) {
  const { data: applyStatus, file: applyFile } = await loadApplyStatus();
  const jobs = Array.isArray(applyStatus.jobs) ? applyStatus.jobs : [];
  let markedApplied = 0;
  let markedOther = 0;

  for (const c of confirmations || []) {
    if (!c?.jobId) continue;
    const nextStatus = classificationToApplyStatus(c.classification);
    if (!nextStatus) continue;
    const idx = jobs.findIndex((j) => j.jobId === c.jobId);
    if (idx < 0) continue;
    const current = String(jobs[idx].status || "").toLowerCase();
    // Never downgrade or re-write an already-applied row.
    if (current === "applied") continue;
    if (current === nextStatus) continue;

    const evidence = [
      ...(Array.isArray(jobs[idx].evidence) ? jobs[idx].evidence : []),
      `gmail:${c.classification}:${c.subject || c.date || now}`,
    ];
    jobs[idx] = {
      ...jobs[idx],
      status: nextStatus,
      reason:
        c.subject ||
        c.reason ||
        `Gmail ${c.classification} via dashboard sync`,
      evidence,
      confirmedAt: c.date || now,
      gmailClassification: c.classification,
    };
    if (nextStatus === "applied") markedApplied += 1;
    else markedOther += 1;

    // Mirror into workspace status.json when present
    const artifact = jobs[idx].artifactPath;
    if (artifact) {
      const statusPath = path.join(REPO_ROOT, artifact, "status.json");
      const existing = await readJson(statusPath, null);
      if (existing || artifact.includes("applications/")) {
        await writeJson(statusPath, {
          ...(existing || {}),
          status: nextStatus,
          reason: jobs[idx].reason,
          evidence,
          updatedAt: now,
          source: "gmail_local_sync",
        });
      }
    }
  }

  if (markedApplied + markedOther > 0) {
    applyStatus.jobs = jobs;
    applyStatus.updatedAt = now;
    const counts = { applied: 0, blocked: 0, needs_human: 0, pending_local: 0 };
    for (const j of jobs) {
      const s = String(j.status || "");
      if (s === "applied") counts.applied += 1;
      else if (s === "blocked") counts.blocked += 1;
      else if (s === "needs_human") counts.needs_human += 1;
      else counts.pending_local += 1;
    }
    applyStatus.counts = { ...(applyStatus.counts || {}), ...counts };
    await writeJson(applyFile, applyStatus);
  }

  return { markedApplied, markedOther };
}

async function gmailStatus() {
  const file = path.join(PROJECT_DIR, "gmail-confirmations.json");
  const data = await readJson(file, {
    updatedAt: null,
    connected: false,
    confirmations: [],
  });
  const probe = await probeGmailConnection();
  const connected = Boolean(probe.connected);
  return {
    connected,
    updatedAt: data.updatedAt || null,
    source: data.source || (connected ? "local_oauth" : "disconnected"),
    note: connected
      ? data.note || probe.note
      : probe.error || probe.note,
    error: connected ? null : probe.error || null,
    credentialsDir: probe.credentialsDir || resolveGmailMcpDir(),
    confirmationCount: (data.confirmations || []).length,
    confirmations: data.confirmations || [],
  };
}

async function gmailSync(body = {}) {
  const file = path.join(PROJECT_DIR, "gmail-confirmations.json");
  const existing = await readJson(file, {
    updatedAt: null,
    connected: false,
    confirmations: [],
  });
  const now = new Date().toISOString();

  // Manual ingest still supported (tests / offline paste)
  if (Array.isArray(body.confirmations)) {
    existing.confirmations = body.confirmations;
    existing.connected = body.connected !== false;
    existing.source = body.source || "dashboard_upload";
    existing.updatedAt = now;
    existing.note =
      body.note ||
      "Confirmations provided to dashboard API (manual upload).";
    existing.error = null;
    await writeJson(file, existing);

    const { markedApplied, markedOther } = await applyGmailConfirmationsToStatus(
      body.confirmations,
      now,
    );

    return {
      saved: true,
      markedApplied,
      markedOther,
      gmail: await gmailStatus(),
      jobs: await buildJobs(),
    };
  }

  const { data: applyStatus } = await loadApplyStatus();
  const scout = await readJson(path.join(PROJECT_DIR, "scout-batch-1.json"), {
    jobs: [],
  });
  const knownJobs = [
    ...(applyStatus.jobs || []).map((j) => ({
      jobId: j.jobId,
      company: j.company,
      title: j.title,
      status: j.status,
    })),
    ...(scout.jobs || []).map((j) => ({
      jobId: j.id,
      company: j.company,
      title: j.title,
      status: null,
    })),
  ];

  const lookbackDays = Number(body.lookbackDays) || 30;
  const sync = await syncGmailConfirmations({
    lookbackDays,
    jobs: knownJobs,
  });

  if (!sync.connected) {
    existing.updatedAt = now;
    existing.source = "local_oauth";
    existing.connected = false;
    existing.note = sync.error || sync.note;
    existing.error = sync.error || sync.note;
    existing.credentialsDir = sync.credentialsDir || resolveGmailMcpDir();
    await writeJson(file, existing);
    return {
      saved: false,
      connected: false,
      error: sync.error || sync.note,
      markedApplied: 0,
      markedOther: 0,
      scanned: sync.scanned || 0,
      gmail: await gmailStatus(),
      jobs: await buildJobs(),
      message: sync.error || sync.note,
    };
  }

  // Live sync replaces confirmation rows (avoids stale misclassifications)
  existing.confirmations = [...(sync.confirmations || [])].sort((a, b) =>
    String(b.date || "").localeCompare(String(a.date || "")),
  );
  existing.connected = true;
  existing.source = "local_oauth";
  existing.updatedAt = now;
  existing.note = sync.note;
  existing.error = null;
  existing.credentialsDir = sync.credentialsDir;
  existing.scanned = sync.scanned;
  existing.lookbackDays = sync.lookbackDays;
  await writeJson(file, existing);

  const { markedApplied, markedOther } = await applyGmailConfirmationsToStatus(
    sync.confirmations,
    now,
  );

  return {
    saved: true,
    connected: true,
    markedApplied,
    markedOther,
    scanned: sync.scanned,
    confirmationCount: existing.confirmations.length,
    gmail: await gmailStatus(),
    jobs: await buildJobs(),
    message: sync.note,
  };
}

function sendJson(res, status, body) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  res.end(payload);
}

async function readBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  if (!chunks.length) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw httpError(400, "Invalid JSON body");
  }
}

async function handleApi(req, res, url) {
  if (req.method === "GET" && url.pathname === "/api/health") {
    return sendJson(res, 200, { ok: true, localOnly: true });
  }
  if (req.method === "GET" && url.pathname === "/api/jobs") {
    return sendJson(res, 200, await buildJobs());
  }
  if (req.method === "GET" && url.pathname === "/api/resume") {
    return sendJson(res, 200, await resumeInfo());
  }
  if (req.method === "POST" && url.pathname === "/api/resume/upload") {
    return sendJson(res, 200, await uploadResume(await readBody(req)));
  }
  if (req.method === "POST" && url.pathname === "/api/resume/analyse") {
    return sendJson(res, 200, await analyseResume());
  }
  if (req.method === "POST" && url.pathname === "/api/search") {
    return sendJson(res, 200, await searchJobs(await readBody(req)));
  }
  if (req.method === "POST" && url.pathname === "/api/approve") {
    const body = await readBody(req);
    return sendJson(res, 200, await approveJob(body.jobId, body.note));
  }
  if (req.method === "POST" && url.pathname === "/api/apply") {
    const body = await readBody(req);
    return sendJson(res, 200, await applyJob(body.jobId, body.note));
  }
  if (req.method === "GET" && url.pathname === "/api/apply-runner") {
    return sendJson(res, 200, await readRunnerStatus());
  }
  if (req.method === "POST" && url.pathname === "/api/apply-run") {
    return sendJson(res, 200, await applyRun(await readBody(req)));
  }
  if (req.method === "POST" && url.pathname === "/api/apply-result") {
    return sendJson(res, 200, await applyResult(await readBody(req)));
  }
  if (req.method === "POST" && url.pathname === "/api/skip") {
    const body = await readBody(req);
    return sendJson(res, 200, await decideJob(body.jobId, "skipped", body.note));
  }
  if (req.method === "POST" && url.pathname === "/api/block") {
    const body = await readBody(req);
    return sendJson(res, 200, await decideJob(body.jobId, "blocked", body.note));
  }
  if (req.method === "GET" && (url.pathname === "/api/gmail" || url.pathname === "/api/sync-gmail")) {
    return sendJson(res, 200, await gmailStatus());
  }
  if (
    req.method === "POST" &&
    (url.pathname === "/api/gmail/sync" || url.pathname === "/api/sync-gmail")
  ) {
    return sendJson(res, 200, await gmailSync(await readBody(req)));
  }
  sendJson(res, 404, { error: "Not found" });
}

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
};

async function serveStatic(req, res, url) {
  let rel = url.pathname === "/" ? "/index.html" : url.pathname;
  rel = path.normalize(rel).replace(/^(\.\.[/\\])+/, "");
  const file = path.join(DIST_DIR, rel);
  if (!file.startsWith(DIST_DIR)) {
    res.writeHead(403);
    return res.end("Forbidden");
  }
  try {
    const data = await fs.readFile(file);
    res.writeHead(200, { "Content-Type": MIME[path.extname(file)] || "application/octet-stream" });
    res.end(data);
  } catch {
    if (path.extname(rel) === "") {
      try {
        const data = await fs.readFile(path.join(DIST_DIR, "index.html"));
        res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
        return res.end(data);
      } catch {
        /* fall through */
      }
    }
    res.writeHead(404);
    res.end("Not found — run npm run build first, or use npm run dev");
  }
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url || "/", `http://${req.headers.host || "127.0.0.1"}`);
    if (url.pathname.startsWith("/api/")) {
      return await handleApi(req, res, url);
    }
    if (DEV) {
      res.writeHead(404, { "Content-Type": "text/plain" });
      return res.end("API-only in --dev; use Vite on :5173");
    }
    return await serveStatic(req, res, url);
  } catch (err) {
    const status = err.status || 500;
    sendJson(res, status, { error: err.message || String(err) });
  }
});

server.listen(API_PORT, "127.0.0.1", () => {
  console.log(`[dashboard-api] http://127.0.0.1:${API_PORT} (local-only)`);
  if (DEV) {
    const vite = spawn("npx", ["vite", "--host", "127.0.0.1", "--port", "5173"], {
      cwd: __dirname,
      stdio: "inherit",
      shell: process.platform === "win32",
    });
    vite.on("exit", (code) => process.exit(code ?? 0));
    const shutdown = () => {
      vite.kill("SIGTERM");
      server.close();
      process.exit(0);
    };
    process.on("SIGINT", shutdown);
    process.on("SIGTERM", shutdown);
    console.log("[dashboard-ui] http://127.0.0.1:5173");
  } else {
    console.log(`[dashboard] serving ${DIST_DIR} — open http://127.0.0.1:${API_PORT}`);
  }
});
