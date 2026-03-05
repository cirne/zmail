import { describe, it, expect, beforeEach } from "bun:test";
import type { Database } from "bun:sqlite";
import { createTestDb, insertTestMessage } from "~/db/test-helpers";
import { claimBatch, resetStaleClaims, isSyncRunning, indexMessages, type MessageRow } from "./indexing";
import { hasEmbedding } from "./vectors";

/**
 * Fake processBatch for use in indexMessages tests.
 * Marks messages as 'done' in SQLite (same as the real processBatch) but
 * skips OpenAI/LanceDB calls, so tests run without credentials or network.
 */
function fakeBatch(db: Database, batch: MessageRow[]): Promise<{ indexed: number; failed: number }> {
  const ids = batch.map((m) => m.id).join(",");
  db.run(`UPDATE messages SET embedding_state = 'done' WHERE id IN (${ids})`);
  return Promise.resolve({ indexed: batch.length, failed: 0 });
}

function freshDb(): Database {
  return createTestDb();
}

describe("claimBatch", () => {
  let db: Database;

  beforeEach(() => {
    db = freshDb();
  });

  it("returns empty array when no pending messages exist", () => {
    const batch = claimBatch(db, 10);
    expect(batch).toEqual([]);
  });

  it("claims pending messages and sets state to 'claimed'", () => {
    const mid = insertTestMessage(db, { subject: "Test email" });
    const batch = claimBatch(db, 10);

    expect(batch.length).toBe(1);
    expect(batch[0].message_id).toBe(mid);

    const row = db
      .query("SELECT embedding_state FROM messages WHERE message_id = ?")
      .get(mid) as { embedding_state: string };
    expect(row.embedding_state).toBe("claimed");
  });

  it("respects the batch size limit", () => {
    for (let i = 0; i < 5; i++) {
      insertTestMessage(db, { subject: `Email ${i}` });
    }

    const batch = claimBatch(db, 3);
    expect(batch.length).toBe(3);

    const remaining = db
      .query("SELECT COUNT(*) as c FROM messages WHERE embedding_state = 'pending'")
      .get() as { c: number };
    expect(remaining.c).toBe(2);
  });

  it("does not return already-claimed messages", () => {
    insertTestMessage(db, { subject: "First" });
    insertTestMessage(db, { subject: "Second" });

    const batch1 = claimBatch(db, 1);
    const batch2 = claimBatch(db, 10);

    expect(batch1.length).toBe(1);
    expect(batch2.length).toBe(1);
    expect(batch1[0].message_id).not.toBe(batch2[0].message_id);
  });

  it("skips messages with 'done' or 'failed' state", () => {
    const done = insertTestMessage(db, { subject: "Done" });
    const failed = insertTestMessage(db, { subject: "Failed" });
    const pending = insertTestMessage(db, { subject: "Pending" });

    db.run("UPDATE messages SET embedding_state = 'done' WHERE message_id = ?", [done]);
    db.run("UPDATE messages SET embedding_state = 'failed' WHERE message_id = ?", [failed]);

    const batch = claimBatch(db, 10);
    expect(batch.length).toBe(1);
    expect(batch[0].message_id).toBe(pending);
  });

  it("returns expected fields on each row", () => {
    insertTestMessage(db, {
      subject: "Important meeting",
      bodyText: "Let's discuss Q4",
      fromAddress: "boss@company.com",
      date: "2024-06-15T10:00:00Z",
    });

    const batch = claimBatch(db, 1);
    expect(batch[0].id).toBeDefined();
    expect(batch[0].message_id).toBeDefined();
    expect(batch[0].subject).toBe("Important meeting");
    expect(batch[0].body_text).toBe("Let's discuss Q4");
    expect(batch[0].from_address).toBe("boss@company.com");
    expect(batch[0].date).toBe("2024-06-15T10:00:00Z");
  });
});

describe("resetStaleClaims", () => {
  it("resets 'claimed' messages back to 'pending'", () => {
    const db = freshDb();
    const mid = insertTestMessage(db);
    db.run("UPDATE messages SET embedding_state = 'claimed' WHERE message_id = ?", [mid]);

    const count = resetStaleClaims(db);
    expect(count).toBe(1);

    const row = db
      .query("SELECT embedding_state FROM messages WHERE message_id = ?")
      .get(mid) as { embedding_state: string };
    expect(row.embedding_state).toBe("pending");
  });

  it("does not touch 'done' or 'failed' messages", () => {
    const db = freshDb();
    const done = insertTestMessage(db, { subject: "Done" });
    const failed = insertTestMessage(db, { subject: "Failed" });

    db.run("UPDATE messages SET embedding_state = 'done' WHERE message_id = ?", [done]);
    db.run("UPDATE messages SET embedding_state = 'failed' WHERE message_id = ?", [failed]);

    const count = resetStaleClaims(db);
    expect(count).toBe(0);

    const doneRow = db.query("SELECT embedding_state FROM messages WHERE message_id = ?").get(done) as { embedding_state: string };
    const failedRow = db.query("SELECT embedding_state FROM messages WHERE message_id = ?").get(failed) as { embedding_state: string };
    expect(doneRow.embedding_state).toBe("done");
    expect(failedRow.embedding_state).toBe("failed");
  });

  it("returns 0 when nothing to reset", () => {
    const db = freshDb();
    insertTestMessage(db);
    const count = resetStaleClaims(db);
    expect(count).toBe(0);
  });
});

describe("hasEmbedding", () => {
  let db: Database;

  beforeEach(() => {
    db = createTestDb();
  });

  it("returns false for a pending message", () => {
    const mid = insertTestMessage(db);
    expect(hasEmbedding(db, mid)).toBe(false);
  });

  it("returns true for a message with embedding_state = 'done'", () => {
    const mid = insertTestMessage(db);
    db.run("UPDATE messages SET embedding_state = 'done' WHERE message_id = ?", [mid]);
    expect(hasEmbedding(db, mid)).toBe(true);
  });

  it("returns false for 'claimed' or 'failed' messages", () => {
    const claimed = insertTestMessage(db, { subject: "Claimed" });
    const failed = insertTestMessage(db, { subject: "Failed" });

    db.run("UPDATE messages SET embedding_state = 'claimed' WHERE message_id = ?", [claimed]);
    db.run("UPDATE messages SET embedding_state = 'failed' WHERE message_id = ?", [failed]);

    expect(hasEmbedding(db, claimed)).toBe(false);
    expect(hasEmbedding(db, failed)).toBe(false);
  });

  it("returns false for a non-existent message_id", () => {
    expect(hasEmbedding(db, "<nonexistent@example.com>")).toBe(false);
  });
});

describe("indexMessages — exit condition scenarios", () => {
  it("exits immediately when sync finds 0 messages (empty queue, syncDone already resolved)", async () => {
    const db = createTestDb();
    // No messages inserted — simulates sync that found nothing new
    const result = await indexMessages({
      db,
      syncDone: Promise.resolve(),
      _processBatch: fakeBatch,
    });
    expect(result.indexed).toBe(0);
    expect(result.failed).toBe(0);
  });

  it("processes pre-existing messages in standalone mode (no syncDone)", async () => {
    const db = createTestDb();
    insertTestMessage(db, { subject: "Pending A" });
    insertTestMessage(db, { subject: "Pending B" });

    const result = await indexMessages({ db, _processBatch: fakeBatch });

    expect(result.indexed).toBe(2);
    const remaining = db.query("SELECT COUNT(*) as c FROM messages WHERE embedding_state = 'pending'").get() as { c: number };
    expect(remaining.c).toBe(0);
  });

  it("waits for sync to finish before exiting when queue is initially empty", async () => {
    const db = createTestDb();
    let resolveSyncDone!: () => void;
    const syncDone = new Promise<void>((resolve) => { resolveSyncDone = resolve; });

    // Simulate sync inserting a message and then finishing after a short delay
    setTimeout(() => {
      insertTestMessage(db, { subject: "Late arrival" });
      resolveSyncDone();
    }, 50);

    const result = await indexMessages({ db, syncDone, _processBatch: fakeBatch });

    expect(result.indexed).toBe(1);
  });

  it("drains all queued messages before exiting after syncDone resolves", async () => {
    const db = createTestDb();
    // Pre-load some messages as if sync already ran partway
    insertTestMessage(db, { subject: "First batch A" });
    insertTestMessage(db, { subject: "First batch B" });

    let resolveSyncDone!: () => void;
    const syncDone = new Promise<void>((resolve) => { resolveSyncDone = resolve; });

    // Resolve sync (and add more messages) after a short delay
    setTimeout(() => {
      insertTestMessage(db, { subject: "Second batch A" });
      insertTestMessage(db, { subject: "Second batch B" });
      resolveSyncDone();
    }, 50);

    const result = await indexMessages({ db, syncDone, _processBatch: fakeBatch });

    expect(result.indexed).toBe(4);
    const pending = db.query("SELECT COUNT(*) as c FROM messages WHERE embedding_state = 'pending'").get() as { c: number };
    expect(pending.c).toBe(0);
  });
});

describe("isSyncRunning", () => {
  let db: Database;

  beforeEach(() => {
    db = createTestDb();
  });

  it("returns false when sync is not running", () => {
    expect(isSyncRunning(db)).toBe(false);
  });

  it("returns true when sync is running", () => {
    db.run("UPDATE sync_summary SET is_running = 1 WHERE id = 1");
    expect(isSyncRunning(db)).toBe(true);
  });

  it("returns false after sync stops", () => {
    db.run("UPDATE sync_summary SET is_running = 1 WHERE id = 1");
    db.run("UPDATE sync_summary SET is_running = 0 WHERE id = 1");
    expect(isSyncRunning(db)).toBe(false);
  });
});
