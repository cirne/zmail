import type { SqliteDatabase } from "~/db";
import { logger } from "./logger";

/**
 * Check if a process with the given PID is still alive.
 * Uses signal 0 (doesn't actually kill, just checks existence).
 */
export function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0); // signal 0 = check existence, doesn't kill
    return true;
  } catch {
    return false; // ESRCH = no such process
  }
}

export interface LockResult {
  /** Whether the lock was successfully acquired */
  acquired: boolean;
  /** Whether we took over a stale lock from a dead process */
  takenOver: boolean;
}

/**
 * Acquire a lock on a singleton status table (sync_summary or indexing_status).
 * Uses PID-based ownership to detect and recover from crashed processes.
 *
 * @param db Database instance
 * @param table Table name ('sync_summary' or 'indexing_status')
 * @param currentPid Current process PID
 * @returns Lock result indicating if acquired and if takeover occurred
 */
export function acquireLock(
  db: SqliteDatabase,
  table: "sync_summary" | "indexing_status",
  currentPid: number
): LockResult {
  const row = db
    .prepare(`SELECT is_running, owner_pid FROM ${table} WHERE id = 1`)
    .get() as { is_running: number; owner_pid: number | null } | null;

  if (!row) {
    throw new Error(`${table} singleton row (id=1) does not exist`);
  }

  if (row.is_running && row.owner_pid) {
    if (isProcessAlive(row.owner_pid)) {
      // Genuinely still running
      return { acquired: false, takenOver: false };
    }
    // Dead process — take over
    logger.warn(`Stale lock from dead process ${row.owner_pid}, taking over`, {
      table,
      deadPid: row.owner_pid,
    });
  }

  db.prepare(
    `UPDATE ${table} SET is_running = 1, owner_pid = ? WHERE id = 1`
  ).run(currentPid);

  return {
    acquired: true,
    takenOver: !!row.is_running,
  };
}

/**
 * Release a lock on a singleton status table.
 *
 * @param db Database instance
 * @param table Table name ('sync_summary' or 'indexing_status')
 */
export function releaseLock(
  db: SqliteDatabase,
  table: "sync_summary" | "indexing_status"
): void {
  db.exec(`UPDATE ${table} SET is_running = 0, owner_pid = NULL WHERE id = 1`);
}
