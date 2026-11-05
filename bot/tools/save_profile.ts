import { defineTool } from "@grok/agent-sdk/tools";
import * as z from "zod/v4";
import { EXPERIENCE_KEY, PROFILE_KEY } from "../lib/keys.js";
import type { ExperienceLibrary, Profile } from "../lib/types.js";

export default defineTool({
  description:
    "Save profile and/or experience library to host.kv. Facts only — never invent employers, dates, or metrics.",
  effect: "write",
  inputSchema: z.object({
    profile: z
      .object({
        fullName: z.string().optional(),
        email: z.string().optional(),
        phone: z.string().optional(),
        location: z.string().optional(),
        links: z
          .array(z.object({ label: z.string(), url: z.string() }))
          .optional(),
        targetRoles: z.array(z.string()).optional(),
        targetLocations: z.array(z.string()).optional(),
        constraints: z.array(z.string()).optional(),
        notes: z.string().optional(),
        placeholder: z.boolean().optional(),
      })
      .optional(),
    experienceLibrary: z
      .object({
        bullets: z.array(
          z.object({
            id: z.string(),
            employer: z.string(),
            title: z.string(),
            start: z.string().optional(),
            end: z.string().nullable().optional(),
            skills: z.array(z.string()).optional(),
            text: z.string(),
            metrics: z.array(z.string()).optional(),
          }),
        ),
        skills: z.array(z.string()),
        placeholder: z.boolean().optional(),
      })
      .optional(),
  }),
  dryRunResult: () => ({ saved: false, dryRun: true }),
  async execute(input, ctx) {
    const now = new Date().toISOString();
    const result: { profileSaved: boolean; experienceSaved: boolean } = {
      profileSaved: false,
      experienceSaved: false,
    };

    if (input.profile) {
      const existing = (await ctx.host.kv.get(PROFILE_KEY)) as Profile | undefined;
      const next: Profile = {
        ...existing,
        ...input.profile,
        updatedAt: now,
        placeholder: input.profile.placeholder ?? false,
      };
      await ctx.host.kv.put(PROFILE_KEY, next);
      result.profileSaved = true;
    }

    if (input.experienceLibrary) {
      const next: ExperienceLibrary = {
        ...input.experienceLibrary,
        updatedAt: now,
        placeholder: input.experienceLibrary.placeholder ?? false,
      };
      await ctx.host.kv.put(EXPERIENCE_KEY, next);
      result.experienceSaved = true;
    }

    return { saved: true, ...result, updatedAt: now };
  },
});
