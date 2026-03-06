#!/usr/bin/env node
// Install a wrapper script that runs zmail via `npx tsx src/index.ts` so the
// CLI uses the source tree (avoids compiled-binary issues e.g. PDF extraction).
//
// Usage: npm run install-cli  (or: npx tsx scripts/install-cli.ts)
//
// Default install dir: ~/.local/bin (override with ZMAIL_INSTALL_DIR).
// Ensure that directory is on your PATH so the installed `zmail` is found.
//
// The wrapper runs: npx tsx <projectRoot>/src/index.ts -- "$@"

import { writeFileSync, mkdirSync, existsSync } from "fs";
import { join } from "path";

const projectRoot = join(import.meta.dirname, "..");

const installDir =
  process.env.ZMAIL_INSTALL_DIR ||
  join(process.env.HOME || "", ".local", "bin");
const destPath = join(installDir, "zmail");

// Escape for safe use inside single-quoted bash string
function escapeForBash(path: string): string {
  return path.replace(/\\/g, "\\\\").replace(/'/g, "'\\''");
}

const repoPath = escapeForBash(projectRoot);
const wrapper = `#!/usr/bin/env bash
set -e
ZMAIL_REPO='${repoPath}'
cd "$ZMAIL_REPO" && exec npx tsx src/index.ts "$@"
`;

mkdirSync(installDir, { recursive: true });
writeFileSync(destPath, wrapper, { mode: 0o755 });

console.log(`Installed zmail (source wrapper) → ${destPath}`);
console.log("");
console.log("The wrapper runs: npx tsx <repo>/src/index.ts <args>");
console.log("Repo path: " + projectRoot);
console.log("");
console.log("To use from another directory:");
if (!process.env.PATH?.includes(installDir)) {
  console.log("  1. Ensure the install dir is on your PATH:");
  console.log(`     export PATH="${installDir}:$PATH"`);
  console.log("  2. From that directory, run: zmail <command>");
} else {
  console.log("  Run: zmail <command>");
}
console.log("  (Config and data dir: ~/.zmail by default, or set ZMAIL_HOME.)");
console.log("");
console.log("To reinstall after moving the repo, run install-cli again from the new path.");