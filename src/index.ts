// Main entrypoint — routes to CLI or starts the web + sync service.
// Web is lazy-loaded so CLI (search, sync, thread, message, mcp) does not pull in hono or require bun install of web deps for CLI-only use.
// Help and setup are handled here so they work without loading config (no env required).

import { CLI_USAGE, SETUP_INSTRUCTIONS } from "~/lib/onboarding";

const [, , command] = process.argv;

/** Emit onboarding hint on stderr and exit 1 when failure is due to missing required env. */
function handleMissingEnv(err: unknown): never {
  const msg = err instanceof Error ? err.message : String(err);
  const isMissingEnv = /Missing required environment variable/.test(msg);
  if (isMissingEnv) {
    console.error(msg);
    console.error("");
    console.error(SETUP_INSTRUCTIONS);
    process.exit(1);
  }
  throw err;
}

if (command === "--help" || command === "-h" || command === "help") {
  console.log(CLI_USAGE);
  process.exit(0);
}
if (command === "setup") {
  console.log(SETUP_INSTRUCTIONS);
  process.exit(0);
}

if (command) {
  try {
    await import("~/cli");
  } catch (err) {
    handleMissingEnv(err);
  }
} else {
  try {
    const { runSync } = await import("~/sync");
    const { logger } = await import("~/lib/logger");
    logger.info("Starting zmail");
    const { startWebServer } = await import("~/web");
    await startWebServer();
    runSync().catch((err) => {
      logger.error("Sync daemon crashed", { error: String(err) });
    });
  } catch (err) {
    handleMissingEnv(err);
  }
}
