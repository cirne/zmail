#!/usr/bin/env node
// Main entrypoint — routes to CLI commands or starts sync service.
// Help and setup are handled here so they work without loading config (no env required).

import { CLI_USAGE } from "~/lib/onboarding";
import { hasConfig } from "~/lib/config";

// When run as "tsx src/index.ts -- <command>", argv[2] is "--" and argv[3] is the command
const rest = process.argv.slice(2);
const command = rest[0] === "--" ? rest[1] : rest[0];
const args = rest[0] === "--" ? rest.slice(2) : rest.slice(1);

/** Emit onboarding hint on stderr and exit 1 when failure is due to missing config. */
function handleMissingConfig(err: unknown): never {
  const msg = err instanceof Error ? err.message : String(err);
  const isMissingConfig = /Missing required|No config found|Run 'zmail setup'/.test(msg);
  if (isMissingConfig) {
    console.error("No config found. Run 'zmail setup' or 'zmail wizard' first.");
    process.exit(1);
  }
  throw err;
}

if (command === "--help" || command === "-h" || command === "help") {
  console.log(CLI_USAGE);
  process.exit(0);
}
/** Parse --flag value or --flag=value from args. Returns undefined if not found. */
function getFlag(args: string[], flag: string): string | undefined {
  const eq = `${flag}=`;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === flag && i + 1 < args.length) return args[i + 1];
    if (args[i].startsWith(eq)) return args[i].slice(eq.length);
  }
  return undefined;
}

if (command === "setup") {
  const noValidate = args.includes("--no-validate");
  const clean = args.includes("--clean");
  const yes = args.includes("--yes");
  const email = getFlag(args, "--email");
  const password = getFlag(args, "--password");
  const openaiKey = getFlag(args, "--openai-key");
  const defaultSince = getFlag(args, "--default-since");
  const { runSetup } = await import("~/cli/setup");
  await runSetup({
    email,
    password,
    openaiKey,
    defaultSince,
    noValidate,
    clean,
    yes,
  });
  process.exit(0);
}
if (command === "wizard") {
  const noValidate = args.includes("--no-validate");
  const clean = args.includes("--clean");
  const yes = args.includes("--yes");
  const { runWizard } = await import("~/cli/wizard");
  await runWizard({ noValidate, clean, yes });
  process.exit(0);
}

// If no command provided, check for config first
if (!command) {
  if (!hasConfig()) {
    console.log(CLI_USAGE);
    console.error("\nNo config found. Run 'zmail setup' or 'zmail wizard' first.");
    process.exit(1);
  }
  // Config exists, start sync
  try {
    const { runSync } = await import("~/sync");
    const { logger } = await import("~/lib/logger");
    logger.info("Starting zmail sync");
    runSync().catch((err) => {
      logger.error("Sync daemon crashed", { error: String(err) });
    });
  } catch (err) {
    handleMissingConfig(err);
  }
  // Don't exit here - sync runs in background
} else {
  // Command provided, check for config before proceeding
  if (!hasConfig()) {
    console.error("No config found. Run 'zmail setup' or 'zmail wizard' first.");
    process.exit(1);
  }
  try {
    await import("~/cli");
  } catch (err) {
    handleMissingConfig(err);
  }
}
