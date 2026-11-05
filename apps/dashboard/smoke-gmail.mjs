/**
 * One-shot smoke: probe + sync Gmail with local .gmail-mcp credentials.
 * Usage: node smoke-gmail.mjs
 */
import {
  classifyJobEmail,
  probeGmailConnection,
  syncGmailConfirmations,
} from "./gmail-local.mjs";

const asserts = [
  [
    "confirmation",
    classifyJobEmail({
      subject: "Thank you for applying to Databricks!",
      snippet: "Your application has been received.",
    }),
  ],
  [
    "rejection",
    classifyJobEmail({
      subject: "Update on your application",
      snippet: "Unfortunately we will not be moving forward.",
    }),
  ],
  [
    "interview",
    classifyJobEmail({
      subject: "Interview invitation for your application",
      snippet: "We would like to schedule a call about the role.",
    }),
  ],
  [
    "other",
    classifyJobEmail({
      subject: "TAI #228: Our Interview with OpenAI",
      snippet: "Unsubscribe from this newsletter",
    }),
  ],
  [
    "verification",
    classifyJobEmail({
      subject: "Your security code",
      snippet: "Your verification code is 123456",
    }),
  ],
];

for (const [want, got] of asserts) {
  if (got !== want) {
    console.error(`classify fail: want=${want} got=${got}`);
    process.exit(1);
  }
}
console.log("classify: ok");

const probe = await probeGmailConnection();
console.log("probe:", JSON.stringify(probe, null, 2));
if (!probe.connected) {
  console.error("probe failed");
  process.exit(2);
}

const sync = await syncGmailConfirmations({
  lookbackDays: 30,
  jobs: [
    {
      jobId: "gh-databricks-8876680002",
      company: "Databricks",
      title: "Senior Forward Deployed Engineer",
    },
  ],
});

const summary = {
  connected: sync.connected,
  scanned: sync.scanned,
  confirmationCount: (sync.confirmations || []).length,
  byClass: Object.fromEntries(
    ["confirmation", "rejection", "interview", "verification"].map((k) => [
      k,
      (sync.confirmations || []).filter((c) => c.classification === k).length,
    ]),
  ),
  sample: (sync.confirmations || []).slice(0, 5).map((c) => ({
    classification: c.classification,
    jobId: c.jobId,
    subject: c.subject,
    date: c.date,
  })),
  note: sync.note,
  error: sync.error || null,
};
console.log("sync:", JSON.stringify(summary, null, 2));
if (!sync.connected) process.exit(3);
