import { describe, it, expect } from "bun:test";
import { config } from "./config";
import { join } from "path";

describe("config", () => {
  describe("defaults", () => {
    it("uses imap.gmail.com as default IMAP host", () => {
      expect(config.imap.host).toBe("imap.gmail.com");
    });

    it("uses port 993 by default", () => {
      expect(config.imap.port).toBe(993);
    });

    it("defaults DATA_DIR to ./data", () => {
      expect(config.dataDir).toBe("./data");
    });

    it("defaults PORT to 3000", () => {
      expect(config.port).toBe(3000);
    });

    it("defaults SYNC_FROM_DATE to approximately one year ago", () => {
      const fromDate = new Date(config.sync.fromDate);
      const oneYearAgo = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000);
      const diff = Math.abs(fromDate.getTime() - oneYearAgo.getTime());
      // Within a day's tolerance
      expect(diff).toBeLessThan(24 * 60 * 60 * 1000);
    });
  });

  describe("derived paths", () => {
    it("dbPath is inside dataDir", () => {
      expect(config.dbPath).toBe(join(config.dataDir, "agentmail.db"));
    });

    it("maildirPath is inside dataDir", () => {
      expect(config.maildirPath).toBe(join(config.dataDir, "maildir"));
    });

    it("vectorsPath is inside dataDir", () => {
      expect(config.vectorsPath).toBe(join(config.dataDir, "vectors"));
    });
  });
});
