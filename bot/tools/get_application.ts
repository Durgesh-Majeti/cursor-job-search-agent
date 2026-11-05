import { defineTool } from "@grok/agent-sdk/tools";
import * as z from "zod/v4";
import { applicationKey, jobKey } from "../lib/keys.js";
import type { ApplicationRecord, JobRecord } from "../lib/types.js";

export default defineTool({
  description: "Read one application by id from host.kv, with its job if present.",
  effect: "read",
  inputSchema: z.object({ id: z.string().min(1) }),
  async execute({ id }, ctx) {
    const application = (await ctx.host.kv.get(applicationKey(id))) as
      | ApplicationRecord
      | undefined;
    const job = application
      ? ((await ctx.host.kv.get(jobKey(application.jobId))) as JobRecord | undefined)
      : undefined;
    return {
      application: application ?? null,
      job: job ?? null,
    };
  },
});
