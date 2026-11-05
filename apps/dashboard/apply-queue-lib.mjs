/**
 * Shared apply-queue helpers for the dashboard API and local runner.
 * Queue file: docs/project/apply-queue.json
 * Runner heartbeat: docs/project/apply-runner-status.json
 * Active request: docs/project/apply-run-request.json
 */
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = path.resolve(__dirname, "../..");
export const PROJECT_DIR = path.join(REPO_ROOT, "docs/project");
export const WORKSPACE_DIR = path.join(REPO_ROOT, "bot/sandbox/workspace");
export const APPS_DIR = path.join(WORKSPACE_DIR, "applications");

export const QUEUE_FILE = path.join(PROJECT_DIR, "apply-queue.json");
export const RUNNER_STATUS_FILE = path.join(PROJECT_DIR, "apply-runner-status.json");
export const RUN_REQUEST_FILE = path.join(PROJECT_DIR, "apply-run-request.json");
export const APPLY_STATUS_FILE = path.join(PROJECT_DIR, "apply-status-batch-1.json");

export const RUNNER_STALE_MS = 20_000;

export async function readJson(file, fallback = null) {
  try {
    return JSON.parse(await fs.readFile(file, "utf8"));
  } catch (err) {
    if (err && err.code === "ENOENT") return fallback;
    throw err;
  }
}

export async function writeJson(file, data) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, `${JSON.stringify(data, null, 2)}\n`, "utf8");
}

export async function loadQueue() {
  const data = await readJson(QUEUE_FILE, { updatedAt: null, queue: [], note: null });
  if (!Array.isArray(data.queue)) data.queue = [];
  return data;
}

export async function saveQueue(data) {
  data.updatedAt = new Date().toISOString();
  await writeJson(QUEUE_FILE, data);
  return data;
}

export async function writeRunnerHeartbeat(extra = {}) {
  const payload = {
    alive: true,
    pid: process.pid,
    updatedAt: new Date().toISOString(),
    mode: "watcher",
    command: "npm run apply-queue",
    ...extra,
  };
  await writeJson(RUNNER_STATUS_FILE, payload);
  return payload;
}

export async function readRunnerStatus() {
  const data = await readJson(RUNNER_STATUS_FILE, null);
  if (!data) {
    return {
      alive: false,
      stale: true,
      note: "No apply runner heartbeat. Start with: npm run apply-queue",
      status: null,
    };
  }
  const updatedMs = Date.parse(data.updatedAt || "") || 0;
  const ageMs = Date.now() - updatedMs;
  const stale = ageMs > RUNNER_STALE_MS;
  return {
    alive: !stale && data.alive !== false,
    stale,
    ageMs,
    note: stale
      ? `Apply runner heartbeat stale (${Math.round(ageMs / 1000)}s). Start: npm run apply-queue`
      : "Local apply runner is alive.",
    status: data,
  };
}

export function artifactDirFor(jobId) {
  return path.join(APPS_DIR, jobId);
}

export async function loadJobArtifacts(jobId) {
  const dir = artifactDirFor(jobId);
  const meta = await readJson(path.join(dir, "meta.json"), null);
  const answers = await readJson(path.join(dir, "answers.json"), null);
  const status = await readJson(path.join(dir, "status.json"), null);
  let resumePdf = path.join(dir, "resume.pdf");
  try {
    await fs.access(resumePdf);
  } catch {
    resumePdf = null;
  }
  let resumeMd = path.join(dir, "resume.md");
  try {
    await fs.access(resumeMd);
  } catch {
    resumeMd = null;
  }
  return {
    dir: `bot/sandbox/workspace/applications/${jobId}/`,
    absDir: dir,
    meta,
    answers,
    status,
    resumePdf,
    resumeMd,
    coverLetter: path.join(dir, "cover-letter.md"),
  };
}

export async function upsertQueueEntry(entry) {
  const data = await loadQueue();
  const idx = data.queue.findIndex((q) => q.jobId === entry.jobId);
  if (idx >= 0) data.queue[idx] = { ...data.queue[idx], ...entry };
  else data.queue.push(entry);
  data.note =
    "Dashboard Apply enqueues here. Run `npm run apply-queue` on durgesh-laptop; Chrome DevTools MCP / agent completes the form.";
  await saveQueue(data);
  return data.queue.find((q) => q.jobId === entry.jobId);
}

export async function claimQueuedJob(jobId = null) {
  const data = await loadQueue();
  const now = new Date().toISOString();
  let idx = -1;
  if (jobId) {
    idx = data.queue.findIndex(
      (q) => q.jobId === jobId && ["queued", "in_progress"].includes(q.status),
    );
  } else {
    idx = data.queue.findIndex((q) => q.status === "queued");
  }
  if (idx < 0) return { claimed: false, entry: null, queue: data };

  const entry = {
    ...data.queue[idx],
    status: "in_progress",
    claimedAt: now,
    runnerPid: process.pid,
  };
  data.queue[idx] = entry;
  await saveQueue(data);

  const artifacts = await loadJobArtifacts(entry.jobId);
  const request = {
    updatedAt: now,
    status: "claimed",
    jobId: entry.jobId,
    entry,
    artifacts: {
      dir: artifacts.dir,
      resumePdf: artifacts.resumePdf,
      resumeMd: artifacts.resumeMd,
      hasAnswers: Boolean(artifacts.answers),
      metaStatus: artifacts.meta?.status || null,
    },
    instructions: [
      "Drive Chrome DevTools MCP on durgesh-laptop.",
      "Use tailored artifacts under the application folder when present.",
      "CAPTCHA / email verify -> needs_human; leave tab open; do not invent codes.",
      "On finish write outcome via apply-queue-lib recordApplyOutcome or dashboard POST /api/apply-result.",
    ],
  };
  await writeJson(RUN_REQUEST_FILE, request);
  return { claimed: true, entry, request, queue: data };
}

export async function loadApplyStatusDoc() {
  const primary = APPLY_STATUS_FILE;
  const alias = path.join(PROJECT_DIR, "apply-status.json");
  const fromPrimary = await readJson(primary, null);
  if (fromPrimary) return { data: fromPrimary, file: primary };
  const fromAlias = await readJson(alias, { jobs: [], counts: {} });
  return { data: fromAlias, file: alias };
}

function recount(jobs) {
  const counts = { applied: 0, blocked: 0, needs_human: 0, pending_local: 0 };
  for (const j of jobs || []) {
    const s = String(j.status || "");
    if (s === "applied") counts.applied += 1;
    else if (s === "blocked") counts.blocked += 1;
    else if (s === "needs_human") counts.needs_human += 1;
    else counts.pending_local += 1;
  }
  return counts;
}

/**
 * Persist apply outcome to queue + apply-status + workspace status.json
 * @param {{ jobId: string, status: 'applied'|'blocked'|'needs_human', reason?: string, evidence?: string[], company?: string, title?: string, url?: string, source?: string }} outcome
 */
export async function recordApplyOutcome(outcome) {
  const now = new Date().toISOString();
  const status = String(outcome.status || "").toLowerCase();
  if (!["applied", "blocked", "needs_human"].includes(status)) {
    throw new Error(`Invalid apply outcome status: ${outcome.status}`);
  }
  if (!outcome.jobId) throw new Error("jobId required");

  const evidence = Array.isArray(outcome.evidence)
    ? outcome.evidence
    : outcome.evidence
      ? [String(outcome.evidence)]
      : [];

  // Queue
  const queue = await loadQueue();
  const qIdx = queue.queue.findIndex((q) => q.jobId === outcome.jobId);
  if (qIdx >= 0) {
    queue.queue[qIdx] = {
      ...queue.queue[qIdx],
      status,
      finishedAt: now,
      reason: outcome.reason || null,
      evidence,
    };
    await saveQueue(queue);
  }

  // apply-status
  const { data: applyStatus, file } = await loadApplyStatusDoc();
  const jobs = Array.isArray(applyStatus.jobs) ? applyStatus.jobs : [];
  const jIdx = jobs.findIndex((j) => j.jobId === outcome.jobId);
  const base =
    jIdx >= 0
      ? jobs[jIdx]
      : {
          jobId: outcome.jobId,
          company: outcome.company || null,
          title: outcome.title || null,
          source: outcome.source || null,
          url: outcome.url || null,
          artifactPath: `bot/sandbox/workspace/applications/${outcome.jobId}/`,
        };
  // Never invent applied over existing applied with weaker evidence — but allow confirm
  if (String(base.status || "").toLowerCase() === "applied" && status !== "applied") {
    // keep applied
  } else {
    const next = {
      ...base,
      status,
      reason: outcome.reason || base.reason || status,
      evidence: [...(Array.isArray(base.evidence) ? base.evidence : []), ...evidence],
      confirmedAt: now,
      source: outcome.via || "apply_queue_runner",
    };
    if (jIdx >= 0) jobs[jIdx] = next;
    else jobs.push(next);
  }
  applyStatus.jobs = jobs;
  applyStatus.updatedAt = now;
  applyStatus.counts = { ...(applyStatus.counts || {}), ...recount(jobs) };
  await writeJson(file, applyStatus);

  // workspace status.json
  const statusPath = path.join(artifactDirFor(outcome.jobId), "status.json");
  await writeJson(statusPath, {
    status,
    reason: outcome.reason || status,
    evidence,
    updatedAt: now,
    source: outcome.via || "apply_queue_runner",
  });

  // Clear active request if it matches
  const req = await readJson(RUN_REQUEST_FILE, null);
  if (req?.jobId === outcome.jobId) {
    await writeJson(RUN_REQUEST_FILE, {
      ...req,
      status: "done",
      outcome: status,
      finishedAt: now,
    });
  }

  return { jobId: outcome.jobId, status, updatedAt: now };
}
