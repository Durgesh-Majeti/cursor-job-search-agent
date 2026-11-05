/**
 * Optional LoopCV MCP — listing volume only.
 *
 *   cp docs/examples/loopcv.ts bot/mcp-connections/loopcv.ts
 *
 * Then set LOOPCV_API_KEY (or whatever header LoopCV documents) via
 * `agent-sdk secret set` / env, uncomment advertiseTools if the model should
 * call LoopCV tools by name, and re-validate.
 *
 * Never treat LoopCV as the core product — scout ATS careers first.
 */
import { defineConnection } from "@grok/agent-sdk/connections";

export default defineConnection({
  url: "https://api.loopcv.com/mcp",
  // headers: { authorization: "Bearer ${LOOPCV_API_KEY}" },
  optional: true,
  // advertiseTools: true,
});
