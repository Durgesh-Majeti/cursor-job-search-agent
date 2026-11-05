import { useCallback, useEffect, useMemo, useState } from "react";
import type { DisplayStatus, JobRow, JobsResponse } from "./types";

const FILTERS: Array<{ id: "all" | DisplayStatus; label: string }> = [
  { id: "all", label: "All" },
  { id: "pending", label: "Pending" },
  { id: "approved", label: "Approved" },
  { id: "applied", label: "Applied" },
  { id: "blocked", label: "Blocked" },
  { id: "needs_human", label: "Needs human" },
];

const STATUS_LABEL: Record<DisplayStatus, string> = {
  pending: "Pending",
  approved: "Approved",
  applied: "Applied",
  blocked: "Blocked",
  needs_human: "Needs human",
};

async function fetchJobs(): Promise<JobsResponse> {
  const res = await fetch("/api/jobs");
  if (!res.ok) throw new Error(`Failed to load jobs (${res.status})`);
  return res.json();
}

export function App() {
  const [data, setData] = useState<JobsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | DisplayStatus>("all");
  const [busyId, setBusyId] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setError(null);
    setLoading(true);
    try {
      setData(await fetchJobs());
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

  async function approve(job: JobRow) {
    setBusyId(job.id);
    setError(null);
    try {
      const res = await fetch("/api/approve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jobId: job.id }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || `Approve failed (${res.status})`);
      setData(body.jobs as JobsResponse);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="app">
      <header className="brand">
        <h1>Job Search Inbox</h1>
        <p>
          Local approve desk for scouted roles. Approvals write{" "}
          <code>docs/project/approvals.json</code> for the agent — no invented
          applied statuses.
        </p>
      </header>

      <div className="meta-row">
        <span>{data?.applicationName ?? "—"}</span>
        <span>Local only · not deployed</span>
        {data?.updatedAt ? <span>Refreshed {new Date(data.updatedAt).toLocaleString()}</span> : null}
      </div>

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

      {error ? <div className="error">{error}</div> : null}
      {loading && !data ? <div className="loading">Loading jobs…</div> : null}

      {!loading && data && jobs.length === 0 ? (
        <div className="empty">No jobs in this filter.</div>
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
                {job.reason ? <div className="reason">{job.reason}</div> : null}
              </div>
              <div className="actions">
                {job.url ? (
                  <a className="btn btn-link" href={job.url} target="_blank" rel="noreferrer">
                    Open
                  </a>
                ) : null}
                {job.status === "pending" ? (
                  <button
                    type="button"
                    className="btn btn-approve"
                    disabled={busyId === job.id}
                    onClick={() => void approve(job)}
                  >
                    {busyId === job.id ? "Saving…" : "Approve"}
                  </button>
                ) : null}
              </div>
            </article>
          ))}
        </div>
      ) : null}

      <p className="footnote">
        Data: <code>docs/project/*.json</code> +{" "}
        <code>bot/sandbox/workspace/applications/</code>. Apply outcomes
        (applied / blocked / needs_human) come from evidence files only.
      </p>
    </div>
  );
}
