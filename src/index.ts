// Main entrypoint — routes to CLI or starts the web + sync service.
// Web is lazy-loaded so CLI (search, sync, thread, message, mcp) does not pull in hono or require bun install of web deps for CLI-only use.

import { runSync } from "~/sync";
import { logger } from "~/lib/logger";

const [, , command] = process.argv;

if (command) {
  await import("~/cli");
} else {
  logger.info("Starting zmail");
  const { startWebServer } = await import("~/web");
  await startWebServer();
  runSync().catch((err) => {
    logger.error("Sync daemon crashed", { error: String(err) });
  });
}
