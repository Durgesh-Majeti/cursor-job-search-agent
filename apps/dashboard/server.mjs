#!/usr/bin/env node
/**
 * Local dashboard API + static server.
 * Reads docs/project/*.json and workspace application artifacts.
 * Approve writes docs/project/approvals.json for the agent to read.
 * Local-only — do not deploy.
 */
import http from "node:http";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "../..");
const PROJECT_DIR = path.join(REPO_ROOT, "docs/project");
const APPS_DIR = path.join(REPO_ROOT, "bot/sandbox/workspace/applications");
const DIST_DIR = path.join(__dirname, "dist");

const API_PORT = Number(process.env.DASHBOARD_API_PORT || 8787);
const DEV = process.argv.includes("--dev");

const DISPLAY_STATUSES = [
  "pending",
  "approved",
  "applied",
  "blocked",
  "needs_human",
];

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

function normalizeStatus(raw) {
  if (!raw) return null;
  const s = String(raw).toLowerCase();
  if (s === "pending_local" || s === "draft" || s === "ready_to_apply" || s === "tailoring" || s === "applying") {
    return "pending";
  }
  if (s === "approved") return "approved";
  if (s === "applied") return "applied";
  if (s === "blocked") return "blocked";
  if (s === "needs_human") return "needs_human";
  if (s === "skipped" || s === "withdrawn") return "pending";
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
  // Prefer the committed batch twin; fall back to a short alias if present.
  const primary = path.join(PROJECT_DIR, "apply-status-batch-1.json");
  const alias = path.join(PROJECT_DIR, "apply-status.json");
  const fromPrimary = await readJson(primary, null);
  if (fromPrimary) return { data: fromPrimary, file: primary };
  const fromAlias = await readJson(alias, { jobs: [], counts: {} });
  return { data: fromAlias, file: alias };
}

async function buildJobs() {
  const scout = await readJson(path.join(PROJECT_DIR, "scout-batch-1.json"), {
    jobs: [],
  });
  const { data: applyStatus, file: applyStatusFile } = await loadApplyStatus();
  const approvalsDoc = await readJson(path.join(PROJECT_DIR, "approvals.json"), {
    approvals: [],
  });
  const workspace = await loadWorkspaceApps();

  const approvalById = new Map();
  for (const a of approvalsDoc.approvals || []) {
    if (a?.jobId) approvalById.set(a.jobId, a);
  }

  const applyById = new Map();
  for (const j of applyStatus.jobs || []) {
    if (j?.jobId) applyById.set(j.jobId, j);
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
      // ready_to_apply / draft stay pending until apply-status or approval
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

  // Approvals only promote pending → approved; never invent applied/blocked.
  for (const [jobId, a] of approvalById) {
    const existing = jobsMap.get(jobId);
    if (!existing) continue;
    if (existing.status === "pending") {
      existing.status = "approved";
      existing.reason = a.note || "Approved via dashboard";
      existing.approvedAt = a.approvedAt ?? null;
      existing.statusSource = "approvals";
    } else if (existing.status === "approved") {
      existing.approvedAt = a.approvedAt ?? existing.approvedAt ?? null;
    }
  }

  const jobs = [...jobsMap.values()].sort((x, y) => {
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
      workspace: "bot/sandbox/workspace/applications/",
    },
    counts,
    jobs,
  };
}

async function approveJob(jobId, note) {
  if (!jobId || typeof jobId !== "string") {
    const err = new Error("jobId required");
    err.status = 400;
    throw err;
  }

  const snapshot = await buildJobs();
  const job = snapshot.jobs.find((j) => j.id === jobId);
  if (!job) {
    const err = new Error(`Unknown jobId: ${jobId}`);
    err.status = 404;
    throw err;
  }
  if (job.status === "applied" || job.status === "blocked" || job.status === "needs_human") {
    const err = new Error(
      `Cannot approve job in status "${job.status}" — status comes from apply evidence, not the dashboard.`,
    );
    err.status = 409;
    throw err;
  }

  const file = path.join(PROJECT_DIR, "approvals.json");
  const doc = await readJson(file, { updatedAt: null, approvals: [] });
  const now = new Date().toISOString();
  const existingIdx = (doc.approvals || []).findIndex((a) => a.jobId === jobId);
  const entry = {
    jobId,
    status: "approved",
    approvedAt: now,
    company: job.company,
    title: job.title,
    url: job.url,
    note: note || "Approved via dashboard",
  };
  if (existingIdx >= 0) doc.approvals[existingIdx] = entry;
  else doc.approvals.push(entry);
  doc.updatedAt = now;
  await writeJson(file, doc);
  return { saved: true, approval: entry, jobs: await buildJobs() };
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
    const err = new Error("Invalid JSON body");
    err.status = 400;
    throw err;
  }
}

async function handleApi(req, res, url) {
  if (req.method === "GET" && url.pathname === "/api/health") {
    return sendJson(res, 200, { ok: true, localOnly: true });
  }
  if (req.method === "GET" && url.pathname === "/api/jobs") {
    return sendJson(res, 200, await buildJobs());
  }
  if (req.method === "POST" && url.pathname === "/api/approve") {
    const body = await readBody(req);
    return sendJson(res, 200, await approveJob(body.jobId, body.note));
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
