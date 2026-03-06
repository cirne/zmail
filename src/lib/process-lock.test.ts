import { describe, it, expect, beforeEach } from "vitest";
import type { SqliteDatabase } from "~/db";
import { createTestDb } from "~/db/test-helpers";
import { isProcessAlive, acquireLock, releaseLock } from "./process-lock";

describe("isProcessAlive", () => {
  it("returns true for the current process", () => {
    expect(isProcessAlive(process.pid)).toBe(true);
  });

  it("returns false for a PID that does not exist", () => {
    // PID 2^30 is almost certainly not running
    expect(isProcessAlive(1_073_741_824)).toBe(false);
  });
});

describe("acquireLock", () => {
  let db: SqliteDatabase;

  beforeEach(() => {
    db = createTestDb();
  });

  it("acquires lock on a clean (unlocked) table", () => {
    const result = acquireLock(db, "sync_summary", process.pid);
    expect(result.acquired).toBe(true);
    expect(result.takenOver).toBe(false);

    const row = db.prepare("SELECT is_running, owner_pid FROM sync_summary WHERE id = 1").get() as {
      is_running: number;
      owner_pid: number;
    };
    expect(row.is_running).toBe(1);
    expect(row.owner_pid).toBe(process.pid);
  });

  it("blocks when a live process holds the lock", () => {
    // First acquire with the current PID
    acquireLock(db, "indexing_status", process.pid);

    // Second acquire with the same (live) PID should fail
    const result = acquireLock(db, "indexing_status", process.pid + 1);
    expect(result.acquired).toBe(false);
    expect(result.takenOver).toBe(false);
  });

  it("takes over a lock from a dead process", () => {
    const deadPid = 1_073_741_824;

    // Simulate a crashed process holding the lock
    db.prepare("UPDATE sync_summary SET is_running = 1, owner_pid = ? WHERE id = 1").run(deadPid);

    const result = acquireLock(db, "sync_summary", process.pid);
    expect(result.acquired).toBe(true);
    expect(result.takenOver).toBe(true);

    const row = db.prepare("SELECT owner_pid FROM sync_summary WHERE id = 1").get() as {
      owner_pid: number;
    };
    expect(row.owner_pid).toBe(process.pid);
  });

  it("acquires lock when is_running=1 but owner_pid is null (legacy crash)", () => {
    db.exec("UPDATE indexing_status SET is_running = 1, owner_pid = NULL WHERE id = 1");

    const result = acquireLock(db, "indexing_status", process.pid);
    expect(result.acquired).toBe(true);
    expect(result.takenOver).toBe(true);
  });

  it("works for both sync_summary and indexing_status tables", () => {
    const r1 = acquireLock(db, "sync_summary", process.pid);
    const r2 = acquireLock(db, "indexing_status", process.pid);
    expect(r1.acquired).toBe(true);
    expect(r2.acquired).toBe(true);
  });
});

describe("releaseLock", () => {
  let db: SqliteDatabase;

  beforeEach(() => {
    db = createTestDb();
  });

  it("clears is_running and owner_pid", () => {
    acquireLock(db, "sync_summary", process.pid);
    releaseLock(db, "sync_summary");

    const row = db.prepare("SELECT is_running, owner_pid FROM sync_summary WHERE id = 1").get() as {
      is_running: number;
      owner_pid: number | null;
    };
    expect(row.is_running).toBe(0);
    expect(row.owner_pid).toBeNull();
  });

  it("allows re-acquisition after release", () => {
    acquireLock(db, "indexing_status", process.pid);
    releaseLock(db, "indexing_status");

    const result = acquireLock(db, "indexing_status", process.pid);
    expect(result.acquired).toBe(true);
    expect(result.takenOver).toBe(false);
  });
});
