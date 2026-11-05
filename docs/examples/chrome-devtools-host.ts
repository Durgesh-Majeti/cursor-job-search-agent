/**
 * Privileged Chrome DevTools MCP for local apply/scout.
 *
 *   cp docs/examples/chrome-devtools-host.ts bot/host-connections/chrome-devtools.ts
 *
 * Only enable on a self-hosted worker that can reach your browser.
 * Prefer host-connections so only server tools / host code drive the browser.
 * Wire the real Cursor Chrome DevTools MCP command/URL your install documents.
 *
 * See docs/local-apply.md.
 */
import { defineConnection } from "@grok/agent-sdk/connections";

export default defineConnection({
  // Example shape only — replace with the real Chrome DevTools MCP transport.
  // command: "npx",
  // args: ["-y", "chrome-devtools-mcp@latest"],
  optional: true,
});
