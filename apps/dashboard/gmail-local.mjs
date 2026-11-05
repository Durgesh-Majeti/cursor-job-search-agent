/**
 * Local Gmail readonly sync for the dashboard API.
 * Uses OAuth client + tokens from %USERPROFILE%\.gmail-mcp (or GMAIL_MCP_CREDENTIALS_PATH).
 * Does not depend on Cursor MCP mid-request.
 */
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const DEFAULT_LOOKBACK_DAYS = 30;
const GMAIL_API = "https://gmail.googleapis.com/gmail/v1/users/me";
const TOKEN_URL = "https://oauth2.googleapis.com/token";

const SETUP_HINT =
  "Place gcp-oauth.keys.json and credentials.json under %USERPROFILE%\\.gmail-mcp (or set GMAIL_MCP_CREDENTIALS_PATH). Authorize with: npx --yes @klodr/gmail-mcp auth --scopes=gmail.readonly. See docs/project/gmail-mcp-setup.md.";

export function resolveGmailMcpDir() {
  const override = process.env.GMAIL_MCP_CREDENTIALS_PATH;
  if (override && String(override).trim()) {
    const raw = path.resolve(String(override).trim());
    const base = path.basename(raw).toLowerCase();
    if (base === "credentials.json" || base === "gcp-oauth.keys.json") {
      return path.dirname(raw);
    }
    return raw;
  }
  return path.join(os.homedir(), ".gmail-mcp");
}

export function credentialsMissingError(dir) {
  return {
    connected: false,
    error: `Gmail credentials not found in ${dir}. ${SETUP_HINT}`,
    credentialsDir: dir,
  };
}

async function readJsonFile(file) {
  try {
    return JSON.parse(await fs.readFile(file, "utf8"));
  } catch (err) {
    if (err && err.code === "ENOENT") return null;
    throw err;
  }
}

export async function loadGmailAuthFiles(dir = resolveGmailMcpDir()) {
  const oauthPath = path.join(dir, "gcp-oauth.keys.json");
  const credPath = path.join(dir, "credentials.json");
  const oauth = await readJsonFile(oauthPath);
  const cred = await readJsonFile(credPath);
  const client = oauth?.installed || oauth?.web || null;
  const tokens = cred?.tokens || cred || null;
  const missing = [];
  if (!client?.client_id || !client?.client_secret) missing.push("gcp-oauth.keys.json");
  if (!tokens?.refresh_token && !tokens?.access_token) missing.push("credentials.json");
  return {
    dir,
    oauthPath,
    credPath,
    client,
    tokens,
    scopes: cred?.scopes || tokens?.scope || null,
    ok: missing.length === 0,
    missing,
  };
}

async function persistTokens(credPath, previous, tokens) {
  const next = {
    ...(previous && typeof previous === "object" ? previous : {}),
    tokens: {
      ...(previous?.tokens || {}),
      ...tokens,
    },
  };
  if (previous?.scopes) next.scopes = previous.scopes;
  await fs.writeFile(credPath, `${JSON.stringify(next, null, 2)}\n`, "utf8");
  return next;
}

async function getAccessToken(auth) {
  const { client, tokens, credPath } = auth;
  const expiry = Number(tokens.expiry_date || 0);
  const skewMs = 60_000;
  if (tokens.access_token && expiry && Date.now() < expiry - skewMs) {
    return tokens.access_token;
  }
  if (!tokens.refresh_token) {
    if (tokens.access_token) return tokens.access_token;
    throw new Error("Gmail credentials.json has no refresh_token or usable access_token.");
  }

  const body = new URLSearchParams({
    client_id: client.client_id,
    client_secret: client.client_secret,
    refresh_token: tokens.refresh_token,
    grant_type: "refresh_token",
  });
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.access_token) {
    const detail = data.error_description || data.error || res.statusText;
    throw new Error(`Gmail token refresh failed: ${detail}`);
  }

  const updated = {
    access_token: data.access_token,
    token_type: data.token_type || tokens.token_type || "Bearer",
    scope: data.scope || tokens.scope,
    expiry_date: Date.now() + Number(data.expires_in || 3600) * 1000,
    refresh_token: tokens.refresh_token,
  };
  const previous = await readJsonFile(credPath);
  await persistTokens(credPath, previous, updated);
  auth.tokens = { ...tokens, ...updated };
  return updated.access_token;
}

async function gmailFetch(auth, pathname, query = {}) {
  const accessToken = await getAccessToken(auth);
  const url = new URL(`${GMAIL_API}${pathname}`);
  for (const [k, v] of Object.entries(query)) {
    if (v == null || v === "") continue;
    url.searchParams.set(k, String(v));
  }
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const detail = data?.error?.message || data.error || res.statusText;
    throw new Error(`Gmail API ${pathname} failed: ${detail}`);
  }
  return data;
}

function headerValue(headers, name) {
  const want = String(name).toLowerCase();
  for (const h of headers || []) {
    if (String(h.name || "").toLowerCase() === want) return h.value || "";
  }
  return "";
}

function decodeBodyData(data) {
  if (!data) return "";
  try {
    const b64 = String(data).replace(/-/g, "+").replace(/_/g, "/");
    return Buffer.from(b64, "base64").toString("utf8");
  } catch {
    return "";
  }
}

function collectTextParts(payload, out = []) {
  if (!payload) return out;
  const mime = String(payload.mimeType || "").toLowerCase();
  if (mime === "text/plain" || mime === "text/html") {
    const text = decodeBodyData(payload.body?.data);
    if (text) out.push(text);
  }
  for (const part of payload.parts || []) collectTextParts(part, out);
  return out;
}

export function classifyJobEmail({ subject = "", snippet = "", from = "", bodyText = "" }) {
  const text = `${subject}\n${snippet}\n${from}\n${bodyText}`.toLowerCase();

  if (
    /verification code|security code|one[- ]time(?: password| code)?|\botp\b|confirm your email|verify your email|authentication code|login code|sign[- ]in code/.test(
      text,
    )
  ) {
    return "verification";
  }
  if (
    /unfortunately|not moving forward|other candidates|decided not to|regret to inform|will not be advancing|not selected|position has been filled|won't be moving forward|we have chosen to move forward with other/.test(
      text,
    )
  ) {
    return "rejection";
  }
  // Avoid newsletters / podcasts that merely mention "interview"
  const newsletter =
    /unsubscribe|view in browser|tai #|podcast|newsletter|our interview with|this week(?:'s)? episode/.test(
      text,
    );
  if (
    !newsletter &&
    (/(?:invite|invited|schedule|scheduled|book|arrange).{0,40}(?:interview|phone screen|call)|(?:interview|phone screen).{0,40}(?:invite|invitation|schedule|scheduled)|coding assessment|take[- ]home(?: assignment)?|virtual onsite|onsite interview|next steps (?:in|for|with) (?:your|the) (?:application|process|candidacy)/.test(
      text,
    ) ||
      (/phone screen|interview invitation|interview with (?:our|the) team/.test(text) &&
        /application|candidacy|role|position/.test(text)))
  ) {
    return "interview";
  }
  if (
    /thank you for applying|thanks for applying|application (?:has been )?received|we received your application|successfully submitted your application|application confirmation|your application to .* (?:has been|was) (?:received|submitted)|we(?:'ve| have) received your application/.test(
      text,
    )
  ) {
    return "confirmation";
  }
  return "other";
}

function normalizeCompany(s) {
  return String(s || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function scoreJobMatch(job, hay) {
  if (!job?.jobId && !job?.id) return { jobId: null, score: 0 };
  const jobId = job.jobId || job.id;
  let score = 0;
  const company = normalizeCompany(job.company);
  const title = normalizeCompany(job.title);
  if (company && company.length >= 3 && hay.includes(company)) score += 3;
  else if (company) {
    // "Arcana Analytics" mail vs company "Arcana"
    const first = company.split(" ").find((w) => w.length >= 4);
    if (first && hay.includes(first)) score += 2;
  }
  if (title && title.length >= 6 && hay.includes(title)) score += 2;
  const idTail = String(jobId).split("-").pop();
  if (idTail && idTail.length >= 6 && hay.includes(idTail.toLowerCase())) score += 4;
  if (String(jobId).length >= 8 && hay.includes(String(jobId).toLowerCase())) score += 5;
  return { jobId, score, company };
}

function matchJobId(jobs, { subject, snippet, from, bodyText }) {
  const hay = normalizeCompany(`${subject}\n${snippet}\n${from}\n${bodyText}`);
  // Dedupe scout+apply duplicates by jobId (keep best score)
  const byId = new Map();
  for (const j of jobs || []) {
    const s = scoreJobMatch(j, hay);
    if (!s.jobId || s.score < 2) continue;
    const prev = byId.get(s.jobId);
    if (!prev || s.score > prev.score) byId.set(s.jobId, { ...s, status: j.status || null });
  }
  const scored = [...byId.values()].sort((a, b) => b.score - a.score);
  if (!scored.length) return null;

  const roleHint = normalizeCompany(
    `${subject} ${snippet}`.match(/application for the (.+?) role/i)?.[1] || "",
  );

  const pickUnique = (candidates) => {
    if (candidates.length === 1) return candidates[0].jobId;
    if (!roleHint) return null;
    const titleOf = (s) => {
      const job = (jobs || []).find((j) => (j.jobId || j.id) === s.jobId);
      return normalizeCompany(job?.title);
    };
    // Exact title match only if no sibling title also contains the role hint
    // (avoids picking "Senior FDE" over "Senior FDE, Sr FDE (L5)").
    const related = candidates.filter((s) => {
      const title = titleOf(s);
      return title && (title === roleHint || title.includes(roleHint) || roleHint.includes(title));
    });
    if (related.length === 1) return related[0].jobId;
    return null;
  };

  const top = scored[0];
  // ATS id / jobId in body → trust even with sibling roles at same company
  if (top.score >= 7) return top.jobId;

  const sameCompany = top.company
    ? scored.filter((s) => s.company === top.company)
    : scored.filter((s) => s.score === top.score);

  // Multiple roles at one employer (e.g. two Databricks FDEs): do not guess
  if (sameCompany.length > 1) return pickUnique(sameCompany);

  return pickUnique([top]) || top.jobId;
}

function buildSearchQuery(lookbackDays) {
  const days = Math.max(1, Math.min(90, Number(lookbackDays) || DEFAULT_LOOKBACK_DAYS));
  return [
    `newer_than:${days}d`,
    "(",
    'subject:(application OR applied OR applying OR interview OR rejection OR "not moving forward" OR "thank you for applying" OR "application received" OR verification OR "security code" OR "one-time")',
    "OR",
    "from:(greenhouse-mail.io OR greenhouse.io OR lever.co OR ashbyhq.com OR myworkday.com OR smartrecruiters.com OR workable.com OR jobvite.com OR icims.com OR breezy.hr OR teamtailor.com OR rippling.com OR careers)",
    ")",
  ].join(" ");
}

async function listRecentMessages(auth, lookbackDays) {
  const q = buildSearchQuery(lookbackDays);
  const ids = [];
  let pageToken;
  do {
    const page = await gmailFetch(auth, "/messages", {
      q,
      maxResults: 50,
      pageToken: pageToken || undefined,
    });
    for (const m of page.messages || []) {
      if (m.id) ids.push(m.id);
    }
    pageToken = page.nextPageToken;
  } while (pageToken && ids.length < 100);
  return ids;
}

async function loadMessage(auth, id) {
  const msg = await gmailFetch(auth, `/messages/${id}`, {
    format: "full",
  });
  const headers = msg.payload?.headers || [];
  const subject = headerValue(headers, "Subject");
  const from = headerValue(headers, "From");
  const dateHeader = headerValue(headers, "Date");
  const snippet = msg.snippet || "";
  const parts = collectTextParts(msg.payload);
  const bodyText = parts
    .map((t) => t.replace(/<[^>]+>/g, " "))
    .join("\n")
    .slice(0, 8000);
  const internalDate = msg.internalDate
    ? new Date(Number(msg.internalDate)).toISOString()
    : null;
  return {
    id: msg.id,
    threadId: msg.threadId,
    subject,
    from,
    snippet,
    bodyText,
    date: internalDate || (dateHeader ? new Date(dateHeader).toISOString() : null),
  };
}

/**
 * Probe whether local credentials can talk to Gmail (no message sync).
 */
export async function probeGmailConnection() {
  const dir = resolveGmailMcpDir();
  const auth = await loadGmailAuthFiles(dir);
  if (!auth.ok) {
    return {
      ...credentialsMissingError(dir),
      missing: auth.missing,
      note: SETUP_HINT,
      source: "local_oauth",
    };
  }
  try {
    await getAccessToken(auth);
    await gmailFetch(auth, "/profile");
    return {
      connected: true,
      credentialsDir: dir,
      source: "local_oauth",
      note: `Using local Gmail OAuth from ${dir} (gmail.readonly).`,
      error: null,
    };
  } catch (err) {
    return {
      connected: false,
      credentialsDir: dir,
      source: "local_oauth",
      error: err instanceof Error ? err.message : String(err),
      note: SETUP_HINT,
    };
  }
}

/**
 * Search + classify recent job-related mail and return confirmation rows.
 * @param {{ lookbackDays?: number, jobs?: Array<{jobId?:string,id?:string,company?:string,title?:string}> }} opts
 */
export async function syncGmailConfirmations(opts = {}) {
  const dir = resolveGmailMcpDir();
  const auth = await loadGmailAuthFiles(dir);
  if (!auth.ok) {
    return {
      ...credentialsMissingError(dir),
      missing: auth.missing,
      confirmations: [],
      scanned: 0,
      lookbackDays: opts.lookbackDays || DEFAULT_LOOKBACK_DAYS,
    };
  }

  const lookbackDays = opts.lookbackDays || DEFAULT_LOOKBACK_DAYS;
  try {
    await getAccessToken(auth);
    const ids = await listRecentMessages(auth, lookbackDays);
    const confirmations = [];
    for (const id of ids) {
      const msg = await loadMessage(auth, id);
      const classification = classifyJobEmail(msg);
      if (classification === "other") continue;
      const jobId = matchJobId(opts.jobs || [], msg);
      const snippet =
        classification === "verification"
          ? "[verification code redacted]"
          : msg.snippet;
      confirmations.push({
        id: msg.id,
        threadId: msg.threadId,
        jobId,
        classification,
        subject: msg.subject,
        from: msg.from,
        snippet,
        date: msg.date,
        reason: msg.subject || classification,
      });
    }

    return {
      connected: true,
      credentialsDir: dir,
      source: "local_oauth",
      note: `Synced ${confirmations.length} job-related message(s) from Gmail (last ${lookbackDays}d) via local OAuth at ${dir}.`,
      error: null,
      scanned: ids.length,
      lookbackDays,
      confirmations,
    };
  } catch (err) {
    return {
      connected: false,
      credentialsDir: dir,
      source: "local_oauth",
      error: err instanceof Error ? err.message : String(err),
      note: SETUP_HINT,
      confirmations: [],
      scanned: 0,
      lookbackDays,
    };
  }
}
