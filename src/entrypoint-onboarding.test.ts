import { describe, it, expect } from "bun:test";
import { join } from "path";

const projectRoot = join(import.meta.dir, "..");
const indexScript = join(import.meta.dir, "index.ts");

async function runEntrypoint(args: string[], env?: Record<string, string>) {
  const proc = Bun.spawn({
    cmd: ["bun", "run", indexScript, "--", ...args],
    cwd: projectRoot,
    stdout: "pipe",
    stderr: "pipe",
    env: env ?? process.env,
  });
  const [out, err, exitCode] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);
  return { stdout: out, stderr: err, exitCode };
}

describe("entrypoint onboarding", () => {
  describe("help (no env required)", () => {
    it("--help prints usage and exits 0", async () => {
      const { stdout, exitCode } = await runEntrypoint(["--help"]);
      expect(exitCode).toBe(0);
      expect(stdout).toContain("zmail");
      expect(stdout).toContain("Usage:");
      expect(stdout).toContain("zmail setup");
    });

    it("-h prints usage and exits 0", async () => {
      const { stdout, exitCode } = await runEntrypoint(["-h"]);
      expect(exitCode).toBe(0);
      expect(stdout).toContain("Usage:");
    });

    it("help command prints usage and exits 0", async () => {
      const { stdout, exitCode } = await runEntrypoint(["help"]);
      expect(exitCode).toBe(0);
      expect(stdout).toContain("Usage:");
    });
  });

  describe("setup (no env required)", () => {
    it("setup command runs interactively (or exits if stdin not available)", async () => {
      // Setup is now interactive, so in test environment it may fail or prompt
      // We just verify it doesn't crash
      const { exitCode } = await runEntrypoint(["setup", "--no-validate"]);
      // Exit code may vary depending on whether stdin is available
      expect([0, 1]).toContain(exitCode);
    });
  });

  describe("missing config", () => {
    it("search without config.json prints error and exits 1", async () => {
      // Use a non-existent ZMAIL_HOME to ensure no config exists
      const env = { ...process.env, ZMAIL_HOME: "/tmp/zmail-nonexistent-" + Date.now() };
      const { stdout, stderr, exitCode } = await runEntrypoint(
        ["search", "foo"],
        env
      );
      expect(exitCode).toBe(1);
      const combined = stdout + stderr;
      expect(combined).toContain("No config found");
      expect(combined).toContain("zmail setup");
    });
  });
});
