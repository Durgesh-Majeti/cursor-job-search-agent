/**
 * One-shot smoke: probe + sync Gmail with local .gmail-mcp credentials.
 * Usage: node smoke-gmail.mjs
 */
import {
  classifyJobEmail,
  guessCompany,
  isNoiseJobEmail,
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
  [
    "recruiter",
    classifyJobEmail({
      subject: "Opportunity at Acme",
      snippet: "I'm a recruiter reaching out about an open role at Acme.",
      from: "Pat Recruiter <pat@acme.com>",
    }),
  ],
  [
    "confirmation",
    classifyJobEmail({
      subject: "Your application to Data Scientist at Joveo",
      snippet: "Your application to Data Scientist at Joveo was submitted.",
      from: "LinkedIn <jobs-noreply@linkedin.com>",
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

const noiseCases = [
  [
    true,
    isNoiseJobEmail({
      subject: "[Required] Email Verification",
      from: "foundit <updates@alerts.foundit.in>",
      snippet: "Your verification code",
    }),
  ],
  [
    true,
    isNoiseJobEmail({
      subject: "10 new jobs for you",
      from: "LinkedIn <jobs-noreply@linkedin.com>",
      snippet: "Jobs you might like this week",
    }),
  ],
  [
    true,
    isNoiseJobEmail({
      subject: "Indeed job alert",
      from: "alert@indeed.com",
      snippet: "New jobs matching your search",
    }),
  ],
  [
    false,
    isNoiseJobEmail({
      subject: "Thank you for applying to Arcana Analytics",
      from: "no-reply@us.greenhouse-mail.io",
      snippet: "Your application has been received",
    }),
  ],
  [
    false,
    isNoiseJobEmail({
      subject: "Your application to Data Scientist at Joveo",
      from: "LinkedIn <jobs-noreply@linkedin.com>",
      snippet: "Your application to Data Scientist at Joveo",
    }),
  ],
  [
    false,
    isNoiseJobEmail({
      subject: "Security code for your application to Databricks",
      from: "Greenhouse <no-reply@us.greenhouse-mail.io>",
      snippet: "Your security code",
    }),
  ],
];

for (const [want, got] of noiseCases) {
  if (got !== want) {
    console.error(`noise fail: want=${want} got=${got}`);
    process.exit(1);
  }
}
console.log("noise: ok");

const company = guessCompany({
  subject: "Thank you for applying to Databricks!",
  from: "no-reply@us.greenhouse-mail.io",
});
if (company !== "Databricks") {
  console.error(`guessCompany fail: want=Databricks got=${company}`);
  process.exit(1);
}
console.log("guessCompany: ok");

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
  noiseExcluded: sync.noiseExcluded || 0,
  confirmationCount: (sync.confirmations || []).length,
  jobEmailCount: (sync.jobEmails || []).length,
  byClass: Object.fromEntries(
    ["confirmation", "rejection", "interview", "recruiter", "verification"].map(
      (k) => [
        k,
        (sync.jobEmails || []).filter((c) => c.category === k).length,
      ],
    ),
  ),
  sample: (sync.jobEmails || []).slice(0, 5).map((c) => ({
    category: c.category,
    company: c.company,
    jobId: c.jobId,
    subject: c.subject,
    date: c.date,
  })),
  note: sync.note,
  error: sync.error || null,
};
console.log("sync:", JSON.stringify(summary, null, 2));
if (!sync.connected) process.exit(3);
