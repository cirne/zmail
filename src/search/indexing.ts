/**
 * Indexing worker for embeddings (ADR-020).
 * Runs concurrently with sync but never with itself.
 * Advisory lock via indexing_status.is_running in SQLite.
 * Progress tracked in DB so remote clients can poll.
 */

import type { Database } from "bun:sqlite";
import { getDb } from "~/db";
import { logger } from "~/lib/logger";
import { config } from "~/lib/config";
import { embedBatch, prepareTextForEmbedding } from "./embeddings";
import { upsertEmbedding, getAllEmbeddedMessageIds } from "./vectors";

const BATCH_SIZE = 100;
const STALE_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes

export interface IndexingResult {
  indexed: number;
  skipped: number;
  failed: number;
  durationMs: number;
  messagesPerMinute: number;
}

interface IndexingStatus {
  is_running: number;
  total_to_index: number;
  indexed_so_far: number;
  failed: number;
  started_at: string | null;
  last_updated_at: string | null;
  completed_at: string | null;
}

function getStatus(db: Database): IndexingStatus {
  return db.query("SELECT * FROM indexing_status WHERE id = 1").get() as IndexingStatus;
}

function acquireLock(db: Database, total: number): boolean {
  const status = getStatus(db);

  if (status.is_running) {
    // Check for stale lock (crash recovery)
    if (status.last_updated_at) {
      const lastUpdate = new Date(status.last_updated_at).getTime();
      if (Date.now() - lastUpdate > STALE_TIMEOUT_MS) {
        logger.warn("Stale indexing lock detected, taking over", {
          lastUpdated: status.last_updated_at,
        });
        // Fall through to acquire
      } else {
        return false; // Active lock, skip
      }
    } else {
      return false;
    }
  }

  db.run(
    `UPDATE indexing_status SET
      is_running = 1,
      total_to_index = ?,
      indexed_so_far = 0,
      failed = 0,
      started_at = datetime('now'),
      last_updated_at = datetime('now'),
      completed_at = NULL
    WHERE id = 1`,
    [total]
  );
  return true;
}

function updateProgress(db: Database, indexed: number, failed: number): void {
  db.run(
    `UPDATE indexing_status SET
      indexed_so_far = ?,
      failed = ?,
      last_updated_at = datetime('now')
    WHERE id = 1`,
    [indexed, failed]
  );
}

function releaseLock(db: Database, indexed: number, failed: number): void {
  db.run(
    `UPDATE indexing_status SET
      is_running = 0,
      indexed_so_far = ?,
      failed = ?,
      last_updated_at = datetime('now'),
      completed_at = datetime('now')
    WHERE id = 1`,
    [indexed, failed]
  );
}

/**
 * Index messages that don't have embeddings yet.
 * Uses advisory lock to prevent concurrent indexing.
 * Updates progress in DB after each batch.
 */
export async function indexMessages(): Promise<IndexingResult> {
  if (!config.openai.apiKey) {
    return { indexed: 0, skipped: 0, failed: 0, durationMs: 0, messagesPerMinute: 0 };
  }

  const startTime = Date.now();
  const db = getDb();
  const embeddedIds = await getAllEmbeddedMessageIds();

  type MessageRow = {
    message_id: string;
    subject: string;
    body_text: string;
    from_address: string;
    date: string;
  };

  let toIndex: MessageRow[];

  if (embeddedIds.size === 0) {
    toIndex = db
      .query(
        `SELECT message_id, subject, body_text, from_address, date
         FROM messages ORDER BY date DESC`
      )
      .all() as MessageRow[];
  } else {
    const placeholders = Array(embeddedIds.size).fill("?").join(",");
    toIndex = db
      .query(
        `SELECT message_id, subject, body_text, from_address, date
         FROM messages
         WHERE message_id NOT IN (${placeholders})
         ORDER BY date DESC`
      )
      .all(...Array.from(embeddedIds)) as MessageRow[];
  }

  if (toIndex.length === 0) {
    logger.info("All messages already indexed");
    return { indexed: 0, skipped: 0, failed: 0, durationMs: Date.now() - startTime, messagesPerMinute: 0 };
  }

  // Try to acquire lock
  if (!acquireLock(db, toIndex.length)) {
    logger.info("Indexing already in progress, skipping");
    return { indexed: 0, skipped: toIndex.length, failed: 0, durationMs: Date.now() - startTime, messagesPerMinute: 0 };
  }

  logger.info("Indexing started", { total: toIndex.length });

  let indexed = 0;
  let failed = 0;

  try {
    for (let i = 0; i < toIndex.length; i += BATCH_SIZE) {
      const batch = toIndex.slice(i, i + BATCH_SIZE);
      const texts = batch.map((m) => prepareTextForEmbedding(m.subject, m.body_text));

      try {
        const embeddings = await embedBatch(texts);
        for (let j = 0; j < batch.length; j++) {
          try {
            await upsertEmbedding(
              batch[j].message_id,
              embeddings[j],
              batch[j].subject,
              batch[j].from_address,
              batch[j].date
            );
            indexed++;
          } catch (err) {
            logger.warn("Failed to upsert embedding", {
              messageId: batch[j].message_id,
              error: String(err),
            });
            failed++;
          }
        }
      } catch (err) {
        logger.error("Embedding batch failed", {
          batchStart: i + 1,
          error: String(err),
        });
        failed += batch.length;
      }

      // Update progress in DB after each batch
      updateProgress(db, indexed, failed);

      // Periodic stdout progress
      if ((i + BATCH_SIZE) % 500 === 0 || i + BATCH_SIZE >= toIndex.length) {
        const pct = Math.round(((indexed + failed) / toIndex.length) * 100);
        logger.info("Indexing progress", {
          indexed,
          failed,
          total: toIndex.length,
          progress: `${pct}%`,
        });
      }
    }
  } finally {
    releaseLock(db, indexed, failed);
  }

  const durationMs = Date.now() - startTime;
  const messagesPerMinute = durationMs > 0 ? Math.round((indexed / durationMs) * 60000) : 0;
  logger.info("Indexing complete", {
    indexed,
    failed,
    durationMs,
    messagesPerMinute,
  });

  return {
    indexed,
    skipped: toIndex.length - indexed - failed,
    failed,
    durationMs,
    messagesPerMinute,
  };
}
