import { defineTool } from "@grok/agent-sdk/tools";
import * as z from "zod/v4";
import { EXPERIENCE_KEY, PROFILE_KEY } from "../lib/keys.js";
import type { ExperienceLibrary, Profile } from "../lib/types.js";

export default defineTool({
  description:
    "Read the durable profile and experience library from host.kv. Call before setup, fit-score, or tailor.",
  effect: "read",
  inputSchema: z.object({}),
  async execute(_input, ctx) {
    const profile = (await ctx.host.kv.get(PROFILE_KEY)) as Profile | undefined;
    const experience = (await ctx.host.kv.get(EXPERIENCE_KEY)) as
      | ExperienceLibrary
      | undefined;
    return {
      profile: profile ?? null,
      experienceLibrary: experience ?? null,
      ready: Boolean(profile && !profile.placeholder && experience && !experience.placeholder),
    };
  },
});
