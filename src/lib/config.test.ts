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

    it("defaults DEFAULT_SYNC_SINCE to 1y when env unset", () => {
      if (process.env.DEFAULT_SYNC_SINCE !== undefined) {
        // .env sets it; just ensure it's a valid duration spec
        expect(config.sync.defaultSince).toBeTruthy();
        expect(config.sync.defaultSince).toMatch(/^\d+[dwmy]$/i);
        return;
      }
      expect(config.sync.defaultSince).toBe("1y");
    });
  });

  describe("derived paths", () => {
    it("dbPath is inside dataDir", () => {
      expect(config.dbPath).toBe(join(config.dataDir, "zmail.db"));
    });

    it("maildirPath is inside dataDir", () => {
      expect(config.maildirPath).toBe(join(config.dataDir, "maildir"));
    });

    it("vectorsPath is inside dataDir", () => {
      expect(config.vectorsPath).toBe(join(config.dataDir, "vectors"));
    });
  });
});
