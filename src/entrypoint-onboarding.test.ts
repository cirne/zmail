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
      const { stdout, stderr, exitCode } = await runEntrypoint(["--help"]);
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
    it("setup command prints setup instructions and exits 0", async () => {
      const { stdout, exitCode } = await runEntrypoint(["setup"]);
      expect(exitCode).toBe(0);
      expect(stdout).toContain("zmail setup");
      expect(stdout).toContain("Environment");
      expect(stdout).toContain("IMAP_USER");
      expect(stdout).toContain("OPENAI_API_KEY");
      expect(stdout).toContain("First sync");
    });
  });

  describe("missing required env", () => {
    it("search with OPENAI_API_KEY unset prints error and setup instructions and exits 1", async () => {
      const env = { ...process.env, OPENAI_API_KEY: "" };
      const { stdout, stderr, exitCode } = await runEntrypoint(
        ["search", "foo"],
        env
      );
      expect(exitCode).toBe(1);
      const combined = stdout + stderr;
      expect(combined).toContain("Missing required environment variable");
      expect(combined).toContain("OPENAI_API_KEY");
      expect(combined).toContain("zmail setup");
      expect(combined).toContain("Environment");
      expect(combined).toContain("IMAP_USER");
    });
  });
});
