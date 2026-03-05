import { describe, it, expect, beforeEach } from "bun:test";
import type { Database } from "bun:sqlite";
import { createTestDb } from "~/db/test-helpers";

describe("indexing advisory lock", () => {
  let db: Database;

  beforeEach(() => {
    db = createTestDb();
  });

  it("starts with is_running = 0", () => {
    const row = db.query("SELECT is_running FROM indexing_status WHERE id = 1").get() as {
      is_running: number;
    };
    expect(row.is_running).toBe(0);
  });

  it("can acquire lock by setting is_running = 1", () => {
    db.run(
      `UPDATE indexing_status SET
        is_running = 1,
        total_to_index = 10,
        indexed_so_far = 0,
        failed = 0,
        started_at = datetime('now'),
        last_updated_at = datetime('now'),
        completed_at = NULL
      WHERE id = 1`
    );

    const row = db.query("SELECT is_running, total_to_index FROM indexing_status WHERE id = 1").get() as {
      is_running: number;
      total_to_index: number;
    };
    expect(row.is_running).toBe(1);
    expect(row.total_to_index).toBe(10);
  });

  it("can track progress via indexed_so_far", () => {
    db.run(
      `UPDATE indexing_status SET is_running = 1, total_to_index = 50, indexed_so_far = 0 WHERE id = 1`
    );

    db.run(`UPDATE indexing_status SET indexed_so_far = 25, last_updated_at = datetime('now') WHERE id = 1`);

    const row = db.query("SELECT indexed_so_far, total_to_index FROM indexing_status WHERE id = 1").get() as {
      indexed_so_far: number;
      total_to_index: number;
    };
    expect(row.indexed_so_far).toBe(25);
    expect(row.total_to_index).toBe(50);
  });

  it("can release lock and record completion", () => {
    db.run(`UPDATE indexing_status SET is_running = 1, total_to_index = 10 WHERE id = 1`);

    db.run(
      `UPDATE indexing_status SET
        is_running = 0,
        indexed_so_far = 8,
        failed = 2,
        last_updated_at = datetime('now'),
        completed_at = datetime('now')
      WHERE id = 1`
    );

    const row = db.query("SELECT * FROM indexing_status WHERE id = 1").get() as {
      is_running: number;
      indexed_so_far: number;
      failed: number;
      completed_at: string | null;
    };
    expect(row.is_running).toBe(0);
    expect(row.indexed_so_far).toBe(8);
    expect(row.failed).toBe(2);
    expect(row.completed_at).not.toBeNull();
  });

  it("detects stale lock via last_updated_at", () => {
    // Simulate a crashed process: is_running=1 but last_updated_at is old
    db.run(
      `UPDATE indexing_status SET
        is_running = 1,
        last_updated_at = datetime('now', '-10 minutes')
      WHERE id = 1`
    );

    const row = db.query("SELECT is_running, last_updated_at FROM indexing_status WHERE id = 1").get() as {
      is_running: number;
      last_updated_at: string;
    };
    expect(row.is_running).toBe(1);

    const lastUpdate = new Date(row.last_updated_at).getTime();
    const staleMs = 5 * 60 * 1000;
    expect(Date.now() - lastUpdate).toBeGreaterThan(staleMs);
  });

  it("enforces singleton constraint (id = 1)", () => {
    expect(() =>
      db.run("INSERT INTO indexing_status (id) VALUES (2)")
    ).toThrow();
  });
});
