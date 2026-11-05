import { defineTool } from "@grok/agent-sdk/tools";
import * as z from "zod/v4";
import { applicationByJobKey, applicationKey, jobKey } from "../lib/keys.js";
import type { ApplicationRecord, JobRecord } from "../lib/types.js";

export default defineTool({
  description: "Read one job by id from host.kv, plus any linked application id.",
  effect: "read",
  inputSchema: z.object({ id: z.string().min(1) }),
  async execute({ id }, ctx) {
    const job = (await ctx.host.kv.get(jobKey(id))) as JobRecord | undefined;
    const applicationId = (await ctx.host.kv.get(applicationByJobKey(id))) as
      | string
      | undefined;
    const application = applicationId
      ? ((await ctx.host.kv.get(applicationKey(applicationId))) as
          | ApplicationRecord
          | undefined)
      : undefined;
    return {
      job: job ?? null,
      applicationId: applicationId ?? null,
      application: application ?? null,
    };
  },
});
