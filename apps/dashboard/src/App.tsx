import { useCallback, useEffect, useMemo, useState } from "react";
import type {
  DisplayStatus,
  GmailStatus,
  JobRow,
  JobsResponse,
  PlatformId,
  ResumeAnalysis,
  ResumeInfo,
} from "./types";

const FILTERS: Array<{ id: "all" | DisplayStatus; label: string }> = [
  { id: "all", label: "All" },
  { id: "pending", label: "Pending" },
  { id: "approved", label: "Approved" },
  { id: "queued", label: "Queued" },
  { id: "applied", label: "Applied" },
  { id: "blocked", label: "Blocked" },
  { id: "needs_human", label: "Needs human" },
  { id: "skipped", label: "Skipped" },
];

const STATUS_LABEL: Record<DisplayStatus, string> = {
  pending: "Pending",
  approved: "Approved",
  queued: "Queued",
  applied: "Applied",
  blocked: "Blocked",
  needs_human: "Needs human",
  skipped: "Skipped",
};

const PLATFORMS: Array<{ id: PlatformId; label: string; hint: string }> = [
  { id: "linkedin", label: "LinkedIn", hint: "Worker + Chrome" },
  { id: "indeed", label: "Indeed", hint: "Worker + Chrome" },
  { id: "greenhouse", label: "Greenhouse / ATS / company", hint: "Scout batch" },
  { id: "loopcv", label: "LoopCV", hint: "Optional MCP" },
];

async function fetchJobs(): Promise<JobsResponse> {
  const res = await fetch("/api/jobs");
  if (!res.ok) throw new Error(`Failed to load jobs (${res.status})`);
  return res.json();
}

async function fetchResume(): Promise<ResumeInfo> {
  const res = await fetch("/api/resume");
  if (!res.ok) throw new Error(`Failed to load resume (${res.status})`);
  return res.json();
}

async function fetchGmail(): Promise<GmailStatus> {
  const res = await fetch("/api/gmail");
  if (!res.ok) throw new Error(`Failed to load Gmail status (${res.status})`);
  return res.json();
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(reader.error || new Error("Read failed"));
    reader.readAsDataURL(file);
  });
}

export function App() {
  const [data, setData] = useState<JobsResponse | null>(null);
  const [resume, setResume] = useState<ResumeInfo | null>(null);
  const [gmail, setGmail] = useState<GmailStatus | null>(null);
  const [analysis, setAnalysis] = useState<ResumeAnalysis | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | DisplayStatus>("all");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [platforms, setPlatforms] = useState<PlatformId[]>(["greenhouse"]);
  const [uploadName, setUploadName] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setError(null);
    setLoading(true);
    try {
      const [jobs, resumeInfo, gmailInfo] = await Promise.all([
        fetchJobs(),
        fetchResume(),
        fetchGmail(),
      ]);
      setData(jobs);
      setResume(resumeInfo);
      setAnalysis(resumeInfo.analysis);
      setGmail(gmailInfo);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  const jobs = useMemo(() => {
    const list = data?.jobs ?? [];
    if (filter === "all") return list;
    return list.filter((j) => j.status === filter);
  }, [data, filter]);

  function togglePlatform(id: PlatformId) {
    setPlatforms((prev) =>
      prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id],
    );
  }

  async function onUpload(file: File | null) {
    if (!file) return;
    setBusyAction("upload");
    setError(null);
    setNotice(null);
    try {
      const contentBase64 = await fileToBase64(file);
      const res = await fetch("/api/resume/upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ filename: file.name, contentBase64 }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || `Upload failed (${res.status})`);
      setResume(body.resume as ResumeInfo);
      setUploadName(file.name);
      setNotice(`Resume saved to ${body.latest}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusyAction(null);
    }
  }

  async function analyse() {
    setBusyAction("analyse");
    setError(null);
    setNotice(null);
    try {
      const res = await fetch("/api/resume/analyse", { method: "POST" });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || `Analyse failed (${res.status})`);
      setAnalysis(body.analysis as ResumeAnalysis);
      setResume((prev) =>
        prev ? { ...prev, analysis: body.analysis as ResumeAnalysis } : prev,
      );
      setNotice(`Resume score ${body.analysis.score}/100 (heuristics saved)`);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusyAction(null);
    }
  }

  async function search() {
    if (!platforms.length) {
      setError("Select at least one platform");
      return;
    }
    setBusyAction("search");
    setError(null);
    setNotice(null);
    try {
      const res = await fetch("/api/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ platforms }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || `Search failed (${res.status})`);
      setData(body.jobs as JobsResponse);
      setNotice(body.search?.note || "Search request saved");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusyAction(null);
    }
  }

  async function apply(job: JobRow) {
    setBusyId(job.id);
    setError(null);
    setNotice(null);
    try {
      const res = await fetch("/api/apply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jobId: job.id }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || `Apply failed (${res.status})`);
      setData(body.jobs as JobsResponse);
      setNotice(body.message || "Queued for worker apply");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusyId(null);
    }
  }

  async function decide(job: JobRow, action: "skip" | "block") {
    setBusyId(job.id);
    setError(null);
    try {
      const res = await fetch(action === "skip" ? "/api/skip" : "/api/block", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jobId: job.id }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || `${action} failed (${res.status})`);
      setData(body.jobs as JobsResponse);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusyId(null);
    }
  }

  async function syncGmail() {
    setBusyAction("gmail");
    setError(null);
    setNotice(null);
    try {
      const res = await fetch("/api/gmail/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || `Gmail sync failed (${res.status})`);
      setGmail(body.gmail as GmailStatus);
      if (body.jobs) setData(body.jobs as JobsResponse);
      if (body.connected === false || body.gmail?.connected === false) {
        const detail =
          body.error ||
          body.gmail?.error ||
          body.message ||
          body.gmail?.note ||
          "Gmail not connected. Place OAuth files under %USERPROFILE%\\.gmail-mcp (see docs/project/gmail-mcp-setup.md).";
        setError(detail);
        setNotice(null);
      } else {
        setNotice(body.message || body.gmail?.note || "Gmail status refreshed");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusyAction(null);
    }
  }

  const canApply = (job: JobRow) =>
    job.status === "pending" || job.status === "approved";

  return (
    <div className="app">
      <header className="brand">
        <p className="eyebrow">Durgesh Majeti · local only</p>
        <h1>Job Search Inbox</h1>
        <p>
          Upload a resume, search platforms, score fits, then Apply per job. Apply
          writes approval +{" "}
          <code>docs/project/apply-queue.json</code> for Chrome on your
          self-hosted worker — this UI never submits forms.
        </p>
      </header>

      <div className="meta-row">
        <span>{data?.applicationName ?? "Durgesh Majeti"}</span>
        <span>Local only · not deployed</span>
        {data?.updatedAt ? (
          <span>Refreshed {new Date(data.updatedAt).toLocaleString()}</span>
        ) : null}
      </div>

      <section className="panel" aria-label="Resume">
        <div className="panel-head">
          <h2>Resume</h2>
          <p>Upload PDF/MD/TXT, then Analyse for local heuristic feedback.</p>
        </div>
        <div className="panel-body resume-row">
          <label className="upload">
            <input
              type="file"
              accept=".pdf,.md,.txt,.markdown,application/pdf,text/plain,text/markdown"
              disabled={busyAction === "upload"}
              onChange={(e) => {
                const f = e.target.files?.[0] ?? null;
                void onUpload(f);
                e.target.value = "";
              }}
            />
            <span>{busyAction === "upload" ? "Uploading…" : "Choose resume file"}</span>
          </label>
          <button
            type="button"
            className="btn btn-primary"
            disabled={busyAction === "analyse"}
            onClick={() => void analyse()}
          >
            {busyAction === "analyse" ? "Analysing…" : "Analyse"}
          </button>
          <div className="resume-meta">
            {uploadName ? <span>Uploaded: {uploadName}</span> : null}
            {resume?.current ? (
              <span>
                Active: <code>{resume.current.path}</code> (
                {Math.round(resume.current.bytes / 1024)} KB)
              </span>
            ) : (
              <span>No resume file found yet</span>
            )}
          </div>
        </div>
        {analysis ? (
          <div className="analysis">
            <div className="analysis-score">
              <span className="score-n">{analysis.score}</span>
              <span className="score-l">/ 100 heuristic</span>
            </div>
            <div className="analysis-cols">
              <div>
                <h3>Strengths</h3>
                <ul>
                  {analysis.strengths.map((s) => (
                    <li key={s}>{s}</li>
                  ))}
                </ul>
              </div>
              <div>
                <h3>Gaps</h3>
                <ul>
                  {(analysis.gaps.length ? analysis.gaps : ["None flagged"]).map((s) => (
                    <li key={s}>{s}</li>
                  ))}
                </ul>
              </div>
              <div>
                <h3>Suggestions</h3>
                <ul>
                  {(analysis.suggestions.length
                    ? analysis.suggestions
                    : ["Looking solid for local heuristics."]
                  ).map((s) => (
                    <li key={s}>{s}</li>
                  ))}
                </ul>
              </div>
            </div>
            {analysis.roleFit?.length ? (
              <div className="role-fit">
                {analysis.roleFit.map((r) => (
                  <span key={r.role}>
                    {r.role}: {r.score}%
                  </span>
                ))}
              </div>
            ) : null}
          </div>
        ) : null}
      </section>

      <section className="panel" aria-label="Search jobs">
        <div className="panel-head">
          <h2>Search jobs</h2>
          <p>
            Check platforms, then Search. ATS uses the scout batch locally;
            LinkedIn / Indeed / LoopCV need the worker (stub request saved).
          </p>
        </div>
        <div className="panel-body">
          <div className="platforms" role="group" aria-label="Platforms">
            {PLATFORMS.map((p) => (
              <label key={p.id} className="check">
                <input
                  type="checkbox"
                  checked={platforms.includes(p.id)}
                  onChange={() => togglePlatform(p.id)}
                />
                <span>
                  {p.label}
                  <small>{p.hint}</small>
                </span>
              </label>
            ))}
          </div>
          <div className="search-actions">
            <button
              type="button"
              className="btn btn-primary"
              disabled={busyAction === "search" || platforms.length === 0}
              onClick={() => void search()}
            >
              {busyAction === "search" ? "Searching…" : "Search jobs"}
            </button>
            <button
              type="button"
              className="btn btn-link"
              disabled={busyAction === "gmail"}
              onClick={() => void syncGmail()}
            >
              {busyAction === "gmail"
                ? "Syncing…"
                : gmail?.connected
                  ? "Sync Gmail status"
                  : "Connect Gmail / sync status"}
            </button>
          </div>
          {data?.search?.note ? (
            <p className="panel-note">{data.search.note}</p>
          ) : null}
          {gmail?.note ? (
            <p className="panel-note">
              Gmail: {gmail.connected ? "connected" : "not connected"} ·{" "}
              {gmail.confirmationCount} confirmation
              {gmail.confirmationCount === 1 ? "" : "s"} · {gmail.note}
            </p>
          ) : null}
        </div>
      </section>

      <section className="counts" aria-label="Status counts">
        {(Object.keys(STATUS_LABEL) as DisplayStatus[]).map((key) => (
          <div className="count" key={key}>
            <span className="n">{data?.counts?.[key] ?? 0}</span>
            <span className="l">{STATUS_LABEL[key]}</span>
          </div>
        ))}
      </section>

      <div className="toolbar">
        <div className="filters" role="group" aria-label="Filter by status">
          {FILTERS.map((f) => (
            <button
              key={f.id}
              type="button"
              className="chip"
              aria-pressed={filter === f.id}
              onClick={() => setFilter(f.id)}
            >
              {f.label}
            </button>
          ))}
        </div>
        <button type="button" className="refresh" onClick={() => void reload()}>
          Refresh
        </button>
      </div>

      {notice ? <div className="notice">{notice}</div> : null}
      {error ? <div className="error">{error}</div> : null}
      {loading && !data ? <div className="loading">Loading jobs…</div> : null}

      {!loading && data && jobs.length === 0 ? (
        <div className="empty">No jobs in this filter. Try Search or clear filters.</div>
      ) : null}

      {jobs.length > 0 ? (
        <div className="list" role="list">
          {jobs.map((job) => (
            <article className="row" role="listitem" key={job.id}>
              <div className="row-main">
                <div className="row-top">
                  <span className="company">{job.company ?? "Unknown"}</span>
                  <span className={`badge ${job.status}`}>{STATUS_LABEL[job.status]}</span>
                  {typeof job.fitScore === "number" ? (
                    <span className="fit">Fit {job.fitScore}</span>
                  ) : null}
                </div>
                <h2 className="title">{job.title ?? job.id}</h2>
                <div className="sub">
                  {[job.source, job.location, job.id].filter(Boolean).join(" · ")}
                </div>
                {job.fitNotes ? <div className="fit-notes">{job.fitNotes}</div> : null}
                {job.reason ? <div className="reason">{job.reason}</div> : null}
              </div>
              <div className="actions">
                {job.url ? (
                  <a className="btn btn-link" href={job.url} target="_blank" rel="noreferrer">
                    Open JD
                  </a>
                ) : null}
                {canApply(job) ? (
                  <button
                    type="button"
                    className="btn btn-approve"
                    disabled={busyId === job.id}
                    onClick={() => void apply(job)}
                  >
                    {busyId === job.id ? "Queuing…" : "Apply"}
                  </button>
                ) : null}
                {job.status === "queued" ? (
                  <span className="queued-label">In apply queue</span>
                ) : null}
                {canApply(job) || job.status === "queued" ? (
                  <>
                    <button
                      type="button"
                      className="btn btn-quiet"
                      disabled={busyId === job.id}
                      onClick={() => void decide(job, "skip")}
                    >
                      Skip
                    </button>
                    <button
                      type="button"
                      className="btn btn-quiet danger"
                      disabled={busyId === job.id}
                      onClick={() => void decide(job, "block")}
                    >
                      Block
                    </button>
                  </>
                ) : null}
              </div>
            </article>
          ))}
        </div>
      ) : null}

      <p className="footnote">
        Data: <code>docs/project/*.json</code> +{" "}
        <code>bot/sandbox/workspace/</code>. Apply → approvals + apply-queue
        (worker Chrome). Applied / blocked / needs_human from evidence or Gmail
        confirmation JSON only.
      </p>
    </div>
  );
}
