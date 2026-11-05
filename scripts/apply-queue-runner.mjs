#!/usr/bin/env node
/**
 * Local apply-queue watcher for durgesh-laptop.
 *
 *   npm run apply-queue
 *
 * - Heartbeats docs/project/apply-runner-status.json (dashboard detects "runner alive")
 * - Claims queued jobs → in_progress + docs/project/apply-run-request.json
 * - Does NOT invent form answers or CAPTCHA codes. Chrome fill is done by the
 *   Cursor agent with Chrome DevTools MCP (or POST /api/apply-result when done).
 *
 * Env:
 *   APPLY_QUEUE_POLL_MS   poll interval (default 3000)
 *   APPLY_QUEUE_ONCE=1    claim at most one job then exit (still heartbeats briefly)
 */
import {
  claimQueuedJob,
  loadQueue,
  readJson,
  RUN_REQUEST_FILE,
  writeRunnerHeartbeat,
} from "../apps/dashboard/apply-queue-lib.mjs";

const POLL_MS = Number(process.env.APPLY_QUEUE_POLL_MS || 3000);
const ONCE =
  process.env.APPLY_QUEUE_ONCE === "1" || process.argv.includes("--once");

let stopping = false;
let lastClaimed = null;

function log(...args) {
  console.log(new Date().toISOString(), ...args);
}

async function tick() {
  const hb = await writeRunnerHeartbeat({
    lastClaimedJobId: lastClaimed,
    pollMs: POLL_MS,
  });

  const queue = await loadQueue();
  const queued = (queue.queue || []).filter((q) => q.status === "queued");
  const inProgress = (queue.queue || []).filter((q) => q.status === "in_progress");

  if (!queued.length) {
    const req = await readJson(RUN_REQUEST_FILE, null);
    if (req?.status === "claimed") {
      log(
        `waiting on Chrome/agent for ${req.jobId} (in_progress=${inProgress.length}). Heartbeat ok pid=${hb.pid}`,
      );
    } else {
      log(`idle — ${inProgress.length} in_progress, 0 queued. Heartbeat pid=${hb.pid}`);
    }
    return { claimed: false };
  }

  const { claimed, entry, request } = await claimQueuedJob();
  if (!claimed) return { claimed: false };

  lastClaimed = entry.jobId;
  log(`claimed ${entry.jobId} (${entry.company} — ${entry.title})`);
  log(`url: ${entry.url}`);
  log(`artifacts: ${request.artifacts.dir}`);
  log(
    "Next: Cursor agent on durgesh-laptop should drive Chrome DevTools MCP for this job, then POST /api/apply-result or write outcome via apply-queue-lib.",
  );
  log(`request file: docs/project/apply-run-request.json`);
  return { claimed: true, entry };
}

async function main() {
  log("apply-queue runner starting — Ctrl+C to stop");
  log(`poll=${POLL_MS}ms once=${ONCE}`);

  process.on("SIGINT", () => {
    stopping = true;
    log("stopping…");
  });
  process.on("SIGTERM", () => {
    stopping = true;
  });

  while (!stopping) {
    try {
      const result = await tick();
      if (ONCE && result.claimed) {
        log("APPLY_QUEUE_ONCE=1 — exiting after claim (heartbeat will go stale)");
        break;
      }
      if (ONCE && !result.claimed) {
        // still exit after one idle tick when once mode and nothing to claim
        const queue = await loadQueue();
        const hasQueued = (queue.queue || []).some((q) => q.status === "queued");
        if (!hasQueued) {
          log("APPLY_QUEUE_ONCE=1 — nothing queued, exiting");
          break;
        }
      }
    } catch (err) {
      console.error(new Date().toISOString(), "tick error:", err);
    }
    if (stopping) break;
    await new Promise((r) => setTimeout(r, POLL_MS));
  }

  await writeRunnerHeartbeat({ alive: false, stopping: true });
  log("stopped");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
