import { describe, it, expect } from "bun:test";
import {
  CLI_USAGE,
  SETUP_INSTRUCTIONS,
  ONBOARDING_HINT_MISSING_ENV,
} from "./onboarding";

describe("onboarding", () => {
  describe("CLI_USAGE", () => {
    it("includes zmail and Usage", () => {
      expect(CLI_USAGE).toContain("zmail");
      expect(CLI_USAGE).toContain("Usage:");
    });

    it("includes setup command", () => {
      expect(CLI_USAGE).toContain("zmail setup");
    });

    it("includes sync, search, who, status, stats, mcp", () => {
      expect(CLI_USAGE).toContain("zmail sync");
      expect(CLI_USAGE).toContain("zmail search");
      expect(CLI_USAGE).toContain("zmail who");
      expect(CLI_USAGE).toContain("zmail status");
      expect(CLI_USAGE).toContain("zmail stats");
      expect(CLI_USAGE).toContain("zmail mcp");
    });
  });

  describe("SETUP_INSTRUCTIONS", () => {
    it("includes zmail setup and Environment", () => {
      expect(SETUP_INSTRUCTIONS).toContain("zmail setup");
      expect(SETUP_INSTRUCTIONS).toContain("Environment");
    });

    it("lists required env vars: IMAP_USER, IMAP_PASSWORD, OPENAI_API_KEY", () => {
      expect(SETUP_INSTRUCTIONS).toContain("IMAP_USER");
      expect(SETUP_INSTRUCTIONS).toContain("IMAP_PASSWORD");
      expect(SETUP_INSTRUCTIONS).toContain("OPENAI_API_KEY");
    });

    it("includes first sync and zmail sync", () => {
      expect(SETUP_INSTRUCTIONS).toContain("First sync");
      expect(SETUP_INSTRUCTIONS).toContain("zmail sync");
    });

    it("mentions .env and .env.example", () => {
      expect(SETUP_INSTRUCTIONS).toContain(".env");
      expect(SETUP_INSTRUCTIONS).toContain(".env.example");
    });
  });

  describe("ONBOARDING_HINT_MISSING_ENV", () => {
    it("tells user to run zmail setup", () => {
      expect(ONBOARDING_HINT_MISSING_ENV).toContain("zmail setup");
    });
  });
});
