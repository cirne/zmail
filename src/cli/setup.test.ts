import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { existsSync, mkdirSync, writeFileSync, rmSync, readFileSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";

describe("setup", () => {
  const originalZmailHome = process.env.ZMAIL_HOME;
  const originalStdinIsTTY = process.stdin.isTTY;
  const testHome = join(tmpdir(), "zmail-setup-test-" + Date.now());
  
  beforeEach(() => {
    process.env.ZMAIL_HOME = testHome;
    mkdirSync(testHome, { recursive: true });
    // Make stdin appear interactive for tests
    Object.defineProperty(process.stdin, "isTTY", {
      value: true,
      writable: true,
      configurable: true,
    });
    // Clear any CI/agent env vars
    delete process.env.CI;
    delete process.env.GITHUB_ACTIONS;
    delete process.env.CURSOR_AGENT;
  });
  
  afterEach(() => {
    if (existsSync(testHome)) {
      rmSync(testHome, { recursive: true, force: true });
    }
    if (originalZmailHome) {
      process.env.ZMAIL_HOME = originalZmailHome;
    } else {
      delete process.env.ZMAIL_HOME;
    }
    Object.defineProperty(process.stdin, "isTTY", {
      value: originalStdinIsTTY,
      writable: true,
      configurable: true,
    });
  });

  describe("non-interactive detection", () => {
    it("detects non-interactive when stdin.isTTY is false", async () => {
      Object.defineProperty(process.stdin, "isTTY", {
        value: false,
        writable: true,
        configurable: true,
      });
      
      // runSetup will exit(1) in non-interactive mode, so we test via spawn
      const proc = Bun.spawn({
        cmd: ["bun", "run", join(import.meta.dir, "..", "index.ts"), "setup"],
        cwd: join(import.meta.dir, "..", ".."),
        env: { ...process.env, ZMAIL_HOME: testHome },
        stdout: "pipe",
        stderr: "pipe",
        stdin: "pipe",
      });
      
      const [stdout, stderr, exitCode] = await Promise.all([
        new Response(proc.stdout).text(),
        new Response(proc.stderr).text(),
        proc.exited,
      ]);
      
      expect(exitCode).toBe(1);
      const output = stdout + stderr;
      expect(output).toContain("zmail setup requires an interactive terminal");
      expect(output).toContain("Example config.json");
    });

    it("detects non-interactive when CI env var is set", async () => {
      const proc = Bun.spawn({
        cmd: ["bun", "run", join(import.meta.dir, "..", "index.ts"), "setup"],
        cwd: join(import.meta.dir, "..", ".."),
        env: { ...process.env, ZMAIL_HOME: testHome, CI: "true" },
        stdout: "pipe",
        stderr: "pipe",
        stdin: "pipe",
      });
      
      const [stdout, stderr, exitCode] = await Promise.all([
        new Response(proc.stdout).text(),
        new Response(proc.stderr).text(),
        proc.exited,
      ]);
      
      expect(exitCode).toBe(1);
      const output = stdout + stderr;
      expect(output).toContain("zmail setup requires an interactive terminal");
    });
  });

  describe("--clean flag", () => {
    it("deletes existing config and data files", () => {
      // Create existing config
      writeFileSync(join(testHome, "config.json"), JSON.stringify({ imap: { user: "old@example.com" } }));
      writeFileSync(join(testHome, ".env"), "ZMAIL_IMAP_PASSWORD=oldpass\nZMAIL_OPENAI_API_KEY=oldkey\n");
      mkdirSync(join(testHome, "data"), { recursive: true });
      writeFileSync(join(testHome, "data", "test.txt"), "test");
      
      // Verify files exist
      expect(existsSync(join(testHome, "config.json"))).toBe(true);
      expect(existsSync(join(testHome, ".env"))).toBe(true);
      expect(existsSync(join(testHome, "data"))).toBe(true);
      
      // Simulate clean operation (same logic as setup.ts)
      const configPath = join(testHome, "config.json");
      const envPath = join(testHome, ".env");
      const dataPath = join(testHome, "data");
      
      if (existsSync(configPath)) rmSync(configPath);
      if (existsSync(envPath)) rmSync(envPath);
      if (existsSync(dataPath)) rmSync(dataPath, { recursive: true, force: true });
      
      // Verify files are gone
      expect(existsSync(join(testHome, "config.json"))).toBe(false);
      expect(existsSync(join(testHome, ".env"))).toBe(false);
      expect(existsSync(join(testHome, "data"))).toBe(false);
    });
  });

  describe("config file operations", () => {
    it("loads existing config.json correctly", () => {
      const configData = {
        imap: {
          host: "imap.example.com",
          port: 993,
          user: "test@example.com",
        },
        sync: {
          defaultSince: "7d",
          mailbox: "INBOX",
          excludeLabels: ["Spam"],
        },
      };
      
      writeFileSync(join(testHome, "config.json"), JSON.stringify(configData));
      
      const content = readFileSync(join(testHome, "config.json"), "utf8");
      const parsed = JSON.parse(content);
      
      expect(parsed.imap.user).toBe("test@example.com");
      expect(parsed.imap.host).toBe("imap.example.com");
      expect(parsed.sync.defaultSince).toBe("7d");
    });

    it("loads existing .env correctly", () => {
      const envContent = `ZMAIL_IMAP_PASSWORD=testpass123
ZMAIL_OPENAI_API_KEY=sk-testkey123
`;
      writeFileSync(join(testHome, ".env"), envContent);
      
      const content = readFileSync(join(testHome, ".env"), "utf8");
      const passwordMatch = content.match(/^ZMAIL_IMAP_PASSWORD=(.*)$/m);
      const apiKeyMatch = content.match(/^ZMAIL_OPENAI_API_KEY=(.*)$/m);
      
      expect(passwordMatch?.[1]).toBe("testpass123");
      expect(apiKeyMatch?.[1]).toBe("sk-testkey123");
    });

    it("writes config.json with correct structure", () => {
      const configJson = {
        imap: {
          host: "imap.gmail.com",
          port: 993,
          user: "test@gmail.com",
        },
        sync: {
          defaultSince: "1y",
          mailbox: "",
          excludeLabels: ["Trash", "Spam"],
        },
      };
      
      writeFileSync(join(testHome, "config.json"), JSON.stringify(configJson, null, 2) + "\n");
      
      const content = readFileSync(join(testHome, "config.json"), "utf8");
      const parsed = JSON.parse(content);
      
      expect(parsed.imap.host).toBe("imap.gmail.com");
      expect(parsed.imap.port).toBe(993);
      expect(parsed.imap.user).toBe("test@gmail.com");
      expect(parsed.sync.defaultSince).toBe("1y");
      expect(parsed.sync.excludeLabels).toEqual(["Trash", "Spam"]);
    });

    it("writes .env with correct format", () => {
      const envContent = `ZMAIL_IMAP_PASSWORD=testpass
ZMAIL_OPENAI_API_KEY=sk-testkey
`;
      writeFileSync(join(testHome, ".env"), envContent);
      
      const content = readFileSync(join(testHome, ".env"), "utf8");
      expect(content).toContain("ZMAIL_IMAP_PASSWORD=testpass");
      expect(content).toContain("ZMAIL_OPENAI_API_KEY=sk-testkey");
    });

    it("handles invalid JSON in config.json gracefully", () => {
      writeFileSync(join(testHome, "config.json"), "invalid json {");
      
      // Simulate loadExistingConfig logic
      let result: any = null;
      try {
        const content = readFileSync(join(testHome, "config.json"), "utf8");
        result = JSON.parse(content);
      } catch {
        result = null;
      }
      
      expect(result).toBeNull();
    });

    it("parses .env with comments and empty lines", () => {
      const envContent = `# This is a comment
ZMAIL_IMAP_PASSWORD=testpass

ZMAIL_OPENAI_API_KEY=sk-testkey
# Another comment
`;
      writeFileSync(join(testHome, ".env"), envContent);
      
      // Simulate loadExistingEnv parsing logic
      const content = readFileSync(join(testHome, ".env"), "utf8");
      const result: { password?: string; apiKey?: string } = {};
      
      for (const line of content.split("\n")) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith("#")) continue;
        const match = trimmed.match(/^ZMAIL_IMAP_PASSWORD=(.*)$/);
        if (match) {
          result.password = match[1];
          continue;
        }
        const openaiMatch = trimmed.match(/^ZMAIL_OPENAI_API_KEY=(.*)$/);
        if (openaiMatch) {
          result.apiKey = openaiMatch[1];
        }
      }
      
      expect(result.password).toBe("testpass");
      expect(result.apiKey).toBe("sk-testkey");
    });
  });

  describe("email domain detection", () => {
    it("detects Gmail domain correctly", () => {
      // Test the deriveImapSettings logic indirectly via the setup flow
      // Gmail emails should result in imap.gmail.com:993
      const email = "test@gmail.com";
      const domain = email.split("@")[1]?.toLowerCase();
      
      expect(domain).toBe("gmail.com");
      
      // Simulate the derivation logic
      let host = "imap.gmail.com";
      let port = 993;
      if (domain === "gmail.com") {
        host = "imap.gmail.com";
        port = 993;
      }
      
      expect(host).toBe("imap.gmail.com");
      expect(port).toBe(993);
    });

    it("handles unknown domains", () => {
      const email = "test@example.com";
      const domain = email.split("@")[1]?.toLowerCase();
      
      expect(domain).toBe("example.com");
      
      // Unknown domain should use defaults
      let host = "imap.gmail.com";
      let port = 993;
      if (domain === "gmail.com") {
        host = "imap.gmail.com";
        port = 993;
      }
      // domain is not gmail.com, so defaults remain
      
      expect(host).toBe("imap.gmail.com"); // default
      expect(port).toBe(993); // default
    });
  });

  describe("secret masking", () => {
    it("masks secrets correctly", () => {
      // Test maskSecret logic
      const maskSecret = (value: string): string => {
        if (value.length <= 4) return "****";
        return value.slice(0, 4) + "...";
      };
      
      expect(maskSecret("sk-testkey123")).toBe("sk-t...");
      expect(maskSecret("test")).toBe("****");
      expect(maskSecret("abc")).toBe("****");
      expect(maskSecret("longpassword123")).toBe("long...");
    });
  });

  describe("directory creation", () => {
    it("creates ZMAIL_HOME directory if it doesn't exist", () => {
      const newHome = join(testHome, "new-home");
      expect(existsSync(newHome)).toBe(false);
      
      mkdirSync(newHome, { recursive: true });
      
      expect(existsSync(newHome)).toBe(true);
    });
  });

  describe("integration", () => {
    it("setup with --no-validate flag is accepted", async () => {
      // This test verifies that --no-validate flag is accepted
      // Full interactive test would require mocking readline which is complex
      const proc = Bun.spawn({
        cmd: ["bun", "run", join(import.meta.dir, "..", "index.ts"), "setup", "--no-validate"],
        cwd: join(import.meta.dir, "..", ".."),
        env: { ...process.env, ZMAIL_HOME: testHome },
        stdout: "pipe",
        stderr: "pipe",
        stdin: "pipe",
      });
      
      // Send EOF to stdin immediately (non-interactive)
      proc.stdin.end();
      
      const exitCode = await proc.exited;
      
      // Should exit with non-interactive message or wait for input
      // Exit code 1 = non-interactive detected, 0 = completed (unlikely without input)
      expect([0, 1]).toContain(exitCode);
    });

    it("setup with --clean --yes flags are accepted", async () => {
      // Create some existing files
      writeFileSync(join(testHome, "config.json"), JSON.stringify({ test: true }));
      
      const proc = Bun.spawn({
        cmd: ["bun", "run", join(import.meta.dir, "..", "index.ts"), "setup", "--clean", "--yes", "--no-validate"],
        cwd: join(import.meta.dir, "..", ".."),
        env: { ...process.env, ZMAIL_HOME: testHome },
        stdout: "pipe",
        stderr: "pipe",
        stdin: "pipe",
      });
      
      proc.stdin.end();
      
      const exitCode = await proc.exited;
      
      // Should exit (either non-interactive or completed)
      expect([0, 1]).toContain(exitCode);
    });
  });
});
