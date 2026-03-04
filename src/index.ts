// Main entrypoint — routes to CLI or starts the web + sync service

import { startWebServer } from "~/web";
import { runSync } from "~/sync";
import { logger } from "~/lib/logger";

const [, , command] = process.argv;

// When invoked as a CLI command, delegate to the CLI dispatcher
if (command) {
  await import("~/cli");
} else {
  // No command: start the web UI + MCP server + background sync daemon
  logger.info("Starting agentmail");

  await startWebServer();

  // Background sync daemon runs alongside the web server
  runSync().catch((err) => {
    logger.error("Sync daemon crashed", { error: String(err) });
  });
}
