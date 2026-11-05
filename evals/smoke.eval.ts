import { defineEval } from "@grok/agent-sdk/evals";

export default defineEval({
  tags: ["smoke"],
  description: "Reads profile state via get_profile when asked for setup status.",
  async test(t) {
    await t.send(
      "Check whether my job-search profile is set up. Use the get_profile tool and tell me if it is ready.",
    );
    t.succeeded();
    t.calledTool("get_profile");
  },
});
