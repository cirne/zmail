#!/usr/bin/env bun
// Dev utility: wipe local data and start fresh
// Usage: bun run scripts/reset.ts

import { rmSync, existsSync } from "fs";
import { config } from "~/lib/config";
import { logger } from "~/lib/logger";

const targets = [config.dbPath, config.maildirPath, config.vectorsPath];

for (const target of targets) {
  if (existsSync(target)) {
    rmSync(target, { recursive: true, force: true });
    logger.info(`Removed ${target}`);
  }
}

logger.info("Local data cleared. Run `bun run dev` to start fresh.");
