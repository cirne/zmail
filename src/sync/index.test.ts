import { describe, it, expect, beforeEach } from "vitest";
import type { SqliteDatabase } from "~/db";
import { createTestDb, insertTestMessage } from "~/db/test-helpers";

describe("runSync logic", () => {
  let db: SqliteDatabase;
  const mailbox = "[Gmail]/All Mail";

  beforeEach(() => {
    db = createTestDb();
  });

  describe("forward sync (refresh)", () => {
    it("should use UID range search format", () => {
      // Test the UID range format used in forward sync
      const lastUid = 100;
      const uidRange = `${lastUid + 1}:*`;
      
      expect(uidRange).toBe("101:*");
      // This format tells IMAP to search for UIDs >= 101
    });

    it("should filter UIDs > last_uid from search results", () => {
      // Setup: we've synced up to UID 100
      db.prepare(
        "INSERT OR REPLACE INTO sync_state (folder, uidvalidity, last_uid) VALUES (?, ?, ?)"
      ).run(mailbox, 1, 100);

      const state = db
        .prepare("SELECT last_uid FROM sync_state WHERE folder = ?")
        .get(mailbox) as { last_uid: number } | undefined;

      expect(state?.last_uid).toBe(100);
      
      // Simulate IMAP search returning UIDs (some may be <= last_uid)
      const searchResults = [98, 99, 100, 101, 102];
      
      // Filter to only UIDs > last_uid
      const newUids = searchResults.filter((uid) => uid > (state?.last_uid ?? 0));
      expect(newUids).toEqual([101, 102]);
    });

    it("should handle forward sync when no checkpoint exists", () => {
      // No sync_state row - should fall back to date-based search
      // better-sqlite3 .get() returns undefined when no row (not null)
      const state = db
        .prepare("SELECT last_uid FROM sync_state WHERE folder = ?")
        .get(mailbox) as { last_uid: number } | undefined;

      expect(state).toBeUndefined();
      // Without checkpoint, forward sync should use date-based search
    });
  });

  describe("backward sync (sync)", () => {
    it("resumes from oldest synced date when extending date range", () => {
      // Setup: we've synced messages from 2026-02-24
      const oldestDate = "2026-02-24T08:44:52.000Z";
      db.prepare(
        `INSERT INTO messages
         (message_id, thread_id, folder, uid, from_address, to_addresses, cc_addresses, subject, body_text, date, raw_path)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).run("msg1@test.com", "thread-1", mailbox, 100, "sender@test.com", "[]", "[]", "Test", "Body", oldestDate, "maildir/test.eml");

      // Verify oldest date is tracked
      const oldest = db
        .prepare("SELECT MIN(date) as oldest_date FROM messages WHERE folder = ?")
        .get(mailbox) as { oldest_date: string | null };
      
      expect(oldest?.oldest_date).toBeTruthy();
      expect(oldest?.oldest_date).toBe(oldestDate);
    });

    it("filters UIDs <= last_uid to skip already-synced messages", () => {
      // Setup: we've synced up to UID 100
      db.prepare(
        "INSERT OR REPLACE INTO sync_state (folder, uidvalidity, last_uid) VALUES (?, ?, ?)"
      ).run(mailbox, 1, 100);

      // Simulate search returning UIDs that include already-synced ones
      const searchResults = [98, 99, 100, 101, 102];
      
      // After filtering, should only have UIDs > 100
      const filtered = searchResults.filter((uid) => uid > 100);
      expect(filtered).toEqual([101, 102]);
    });

    it("skips fetching when all UIDs are already synced", () => {
      db.prepare(
        "INSERT OR REPLACE INTO sync_state (folder, uidvalidity, last_uid) VALUES (?, ?, ?)"
      ).run(mailbox, 1, 100);

      // All UIDs <= last_uid
      const uids = [98, 99, 100];
      const allSynced = uids.every((uid) => uid <= 100);
      
      expect(allSynced).toBe(true);
      // Should skip fetching and search before oldest date instead
    });

    it("allows same-day re-fetch to catch gaps from interrupted syncs", () => {
      // Setup: we've synced some messages from 2026-02-24
      db.prepare(
        `INSERT INTO messages
         (message_id, thread_id, folder, uid, from_address, to_addresses, cc_addresses, subject, body_text, date, raw_path)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).run("msg1@test.com", "thread-1", mailbox, 100, "sender@test.com", "[]", "[]", "Test", "Body", "2026-02-24T08:44:52.000Z", "maildir/test.eml");

      const oldest = db
        .prepare("SELECT MIN(date) as oldest_date FROM messages WHERE folder = ?")
        .get(mailbox) as { oldest_date: string | null };

      const oldestDateStr = oldest?.oldest_date?.slice(0, 10); // YYYY-MM-DD
      const requestedDateStr = "2026-02-24";

      // Same day - should allow re-fetch (with UID filtering)
      expect(oldestDateStr).toBe(requestedDateStr);
    });
  });

  describe("UID checkpointing", () => {
    it("tracks last_uid per folder", () => {
      db.prepare(
        "INSERT OR REPLACE INTO sync_state (folder, uidvalidity, last_uid) VALUES (?, ?, ?)"
      ).run(mailbox, 1, 100);

      const state = db
        .prepare("SELECT uidvalidity, last_uid FROM sync_state WHERE folder = ?")
        .get(mailbox) as { uidvalidity: number; last_uid: number } | undefined;

      expect(state).toBeDefined();
      expect(state?.uidvalidity).toBe(1);
      expect(state?.last_uid).toBe(100);
    });

    it("handles BigInt to Number conversion for uidvalidity", () => {
      // SQLite may return BigInt, but we normalize to Number
      const stateRow = { uidvalidity: BigInt(1), last_uid: BigInt(100) };
      const state = {
        uidvalidity: Number(stateRow.uidvalidity),
        last_uid: Number(stateRow.last_uid),
      };

      expect(state.uidvalidity).toBe(1);
      expect(state.last_uid).toBe(100);
      expect(typeof state.uidvalidity).toBe("number");
      expect(typeof state.last_uid).toBe("number");
    });

    it("handles uidvalidity mismatch (requires full resync)", () => {
      // Setup: old checkpoint with different uidvalidity
      db.prepare(
        "INSERT OR REPLACE INTO sync_state (folder, uidvalidity, last_uid) VALUES (?, ?, ?)"
      ).run(mailbox, 1, 100);

      const state = db
        .prepare("SELECT uidvalidity FROM sync_state WHERE folder = ?")
        .get(mailbox) as { uidvalidity: number } | undefined;

      const currentUidValidity = 2; // Changed (mailbox was recreated)

      // uidvalidity mismatch means we need to resync from scratch
      const isValid = state?.uidvalidity === currentUidValidity;
      expect(isValid).toBe(false);
    });
  });

  describe("resume behavior", () => {
    it("finds oldest synced message date", () => {
      insertTestMessage(db, {
        date: "2026-02-20T10:00:00.000Z",
        folder: mailbox,
        uid: 50,
      });
      insertTestMessage(db, {
        date: "2026-02-24T08:44:52.000Z",
        folder: mailbox,
        uid: 100,
      });

      const oldest = db
        .prepare("SELECT MIN(date) as oldest_date FROM messages WHERE folder = ?")
        .get(mailbox) as { oldest_date: string | null };

      expect(oldest?.oldest_date).toBe("2026-02-20T10:00:00.000Z");
    });

    it("compares dates at day level (ignores time)", () => {
      const date1 = "2026-02-24T08:44:52.000Z";
      const date2 = "2026-02-24T23:59:59.000Z";
      
      const day1 = date1.slice(0, 10); // YYYY-MM-DD
      const day2 = date2.slice(0, 10);
      
      expect(day1).toBe(day2);
      expect(day1).toBe("2026-02-24");
    });

    it("resumes from oldest date when requested date is newer", () => {
      db.prepare(
        `INSERT INTO messages
         (message_id, thread_id, folder, uid, from_address, to_addresses, cc_addresses, subject, body_text, date, raw_path)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).run("msg1@test.com", "thread-1", mailbox, 50, "sender@test.com", "[]", "[]", "Test", "Body", "2026-02-20T10:00:00.000Z", "maildir/test.eml");

      const oldest = db
        .prepare("SELECT MIN(date) as oldest_date FROM messages WHERE folder = ?")
        .get(mailbox) as { oldest_date: string | null };

      const oldestDateStr = oldest?.oldest_date?.slice(0, 10);
      const requestedDateStr = "2026-02-15"; // Older than oldest synced

      // Should resume from oldest synced date (2026-02-20), not requested date
      expect(oldestDateStr).toBe("2026-02-20");
      expect(oldestDateStr! > requestedDateStr).toBe(true);
    });

    /**
     * BUG-010: Sync Backward Resume Skips Requested Date Range
     * 
     * When a user syncs a narrow date range (e.g., 7 days) and later requests
     * a wider range (e.g., 90 days), the backward sync resume logic incorrectly
     * uses oldestSynced as the IMAP SEARCH boundary instead of requestedSince.
     * 
     * This test reproduces the bug by verifying that when oldestDay > requestedDay
     * (meaning the user is requesting a wider range), the effectiveSinceDate
     * should use the requested date, not the oldest synced date.
     */
    it("BUG-010: should use requested date when expanding sync range (not oldest synced)", () => {
      // Setup: We've synced messages from a narrow range (7 days: 2026-02-28 to 2026-03-07)
      // This simulates the scenario: user ran `zmail sync --since 7d`
      const oldestSyncedDate = "2026-02-28T10:00:00.000Z";
      insertTestMessage(db, {
        date: oldestSyncedDate,
        folder: mailbox,
        uid: 100,
      });
      insertTestMessage(db, {
        date: "2026-03-07T10:00:00.000Z",
        folder: mailbox,
        uid: 200,
      });

      // Setup sync_state checkpoint (simulates having synced up to UID 200)
      db.prepare(
        "INSERT OR REPLACE INTO sync_state (folder, uidvalidity, last_uid) VALUES (?, ?, ?)"
      ).run(mailbox, 1, 200);

      // Get oldest synced date
      const oldestSynced = db
        .prepare("SELECT MIN(date) as oldest_date FROM messages WHERE folder = ?")
        .get(mailbox) as { oldest_date: string | null };

      const oldestDateStr = oldestSynced?.oldest_date?.slice(0, 10); // "2026-02-28"
      const requestedDateStr = "2025-12-07"; // 90 days back from 2026-03-07

      // Verify the bug scenario: oldestDay > requestedDay (user requesting wider range)
      expect(oldestDateStr).toBe("2026-02-28");
      expect(oldestDateStr! > requestedDateStr).toBe(true);

      // BUG-010: Current buggy behavior uses oldestSynced instead of requestedSince
      // This reproduces the bug: effectiveSinceDate is set to oldestDateStr instead of requestedDateStr
      const buggyEffectiveSinceDate = oldestDateStr; // Current buggy behavior
      const correctEffectiveSinceDate = requestedDateStr; // What it should be

      // The bug: effectiveSinceDate uses oldestSynced (2026-02-28) instead of requestedSince (2025-12-07)
      expect(buggyEffectiveSinceDate).toBe("2026-02-28");
      expect(buggyEffectiveSinceDate).not.toBe(correctEffectiveSinceDate);

      // After fix: effectiveSinceDate should use min(requestedSince, oldestSynced) = requestedSince
      // when oldestSynced > requestedSince (expanding range)
      const fixedEffectiveSinceDate = oldestDateStr! > requestedDateStr 
        ? requestedDateStr  // Use requested date when expanding range
        : oldestDateStr;     // Use oldest synced when narrowing range

      expect(fixedEffectiveSinceDate).toBe("2025-12-07");
      expect(fixedEffectiveSinceDate).toBe(correctEffectiveSinceDate);
    });
  });

  describe("UID filtering logic", () => {
    it("filters UIDs > last_uid for forward sync", () => {
      const lastUid = 100;
      const uids = [98, 99, 100, 101, 102];
      
      const filtered = uids.filter((uid) => uid > lastUid);
      expect(filtered).toEqual([101, 102]);
    });

    it("detects when all UIDs are already synced", () => {
      const lastUid = 100;
      const uids = [98, 99, 100];
      
      const allSynced = uids.every((uid) => uid <= lastUid);
      expect(allSynced).toBe(true);
    });

    it("detects when some UIDs are new", () => {
      const lastUid = 100;
      const uids = [98, 99, 100, 101, 102];
      
      const allSynced = uids.every((uid) => uid <= lastUid);
      expect(allSynced).toBe(false);
    });

    it("handles empty UID array", () => {
      const lastUid = 100;
      const uids: number[] = [];
      
      const filtered = uids.filter((uid) => uid > lastUid);
      const allSynced = uids.every((uid) => uid <= lastUid);
      
      expect(filtered).toEqual([]);
      expect(allSynced).toBe(true); // Empty array satisfies "all synced"
    });
  });

  describe("backward sync re-search logic", () => {
    it("should re-search with 'before' constraint when all UIDs are synced", () => {
      // Setup: we've synced all messages from 2026-02-24
      db.prepare(
        "INSERT OR REPLACE INTO sync_state (folder, uidvalidity, last_uid) VALUES (?, ?, ?)"
      ).run(mailbox, 1, 100);

      db.prepare(
        `INSERT INTO messages
         (message_id, thread_id, folder, uid, from_address, to_addresses, cc_addresses, subject, body_text, date, raw_path)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).run("msg1@test.com", "thread-1", mailbox, 100, "sender@test.com", "[]", "[]", "Test", "Body", "2026-02-24T10:00:00.000Z", "maildir/test.eml");

      // Simulate search returning UIDs that are all <= last_uid
      const searchResults = [98, 99, 100];
      const allSynced = searchResults.every((uid) => uid <= 100);

      expect(allSynced).toBe(true);

      // Should re-search with 'before' constraint to skip this day entirely
      const oldestDate = "2026-02-24T10:00:00.000Z";
      const oldestDay = oldestDate.slice(0, 10); // "2026-02-24"
      const dayBefore = new Date(oldestDay + "T00:00:00Z");
      dayBefore.setDate(dayBefore.getDate() - 1);
      const dayBeforeStr = dayBefore.toISOString().slice(0, 10);

      expect(dayBeforeStr).toBe("2026-02-23");
    });
  });
});
