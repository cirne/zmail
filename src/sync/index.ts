import { logger } from "~/lib/logger";

export async function runSync() {
  logger.info("Sync starting");
  // TODO: initialize GmailProvider / GenericImapProvider
  // TODO: run windowed sync (ADR-013)
  // TODO: update sync_summary
  logger.info("Sync complete");
}

// Allow running directly: bun run src/sync/index.ts
if (import.meta.main) {
  await runSync();
}
