#!/usr/bin/env bun
// Build the native binary and copy it to a directory on your PATH for testing
// from another workspace (e.g. a separate Claude Code project).
//
// Usage: bun run scripts/install-cli.ts
//
// Default install dir: ~/.local/bin (override with ZMAIL_INSTALL_DIR).
// Ensure that directory is on your PATH so the installed `zmail` is found.

import { chmodSync, cpSync, mkdirSync, existsSync } from "fs";
import { join } from "path";
import { $ } from "bun";

const projectRoot = join(import.meta.dir, "..");
const distBinary = join(projectRoot, "dist", "zmail");

const installDir =
  process.env.ZMAIL_INSTALL_DIR ||
  join(process.env.HOME || "", ".local", "bin");
const destPath = join(installDir, "zmail");

console.log("Building...");
await $`bun build src/index.ts --compile --outfile dist/zmail`.cwd(projectRoot);

if (!existsSync(distBinary)) {
  console.error("Build failed: dist/zmail not found");
  process.exit(1);
}

mkdirSync(installDir, { recursive: true });
cpSync(distBinary, destPath);
chmodSync(destPath, 0o755);

console.log(`Installed zmail → ${destPath}`);
console.log("");
console.log("To use from another directory (e.g. another Claude Code project):");
console.log("  1. Ensure the install dir is on your PATH:");
if (!process.env.PATH?.includes(installDir)) {
  console.log(`     export PATH="${installDir}:$PATH"`);
}
console.log("  2. From that directory, run: zmail <command>");
console.log("     (It will use ./data in the current working directory, or set DATA_DIR.)");
