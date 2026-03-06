import { existsSync, mkdirSync, writeFileSync } from "fs";
import { join } from "path";
import { ImapFlow } from "imapflow";
import { config, requireImapConfig } from "~/lib/config";
import { getDb } from "~/db";
import { logger } from "~/lib/logger";
import { acquireLock, releaseLock } from "~/lib/process-lock";
import { parseRawMessage } from "./parse-message";
import { parseSinceToDate } from "./parse-since";

/** Mailbox to sync: All Mail for Gmail (per ADR-011), INBOX for others. */
function getSyncMailbox(host: string): string {
  return host.toLowerCase().includes("gmail") ? "[Gmail]/All Mail" : "INBOX";
}

export interface SyncOptions {
  /** Relative since spec (e.g. 7d, 5w, 3m, 2y). Overrides DEFAULT_SYNC_SINCE env var when set. */
  since?: string;
}

export interface SyncResult {
  synced: number;
  messagesFetched: number;
  bytesDownloaded: number;
  durationMs: number;
  bandwidthBytesPerSec: number;
  messagesPerMinute: number;
}

const BATCH_SIZE = 50;

function ensureMaildir() {
  const base = config.maildirPath;
  mkdirSync(join(base, "cur"), { recursive: true });
  mkdirSync(join(base, "new"), { recursive: true });
  mkdirSync(join(base, "tmp"), { recursive: true });
  mkdirSync(join(base, "attachments"), { recursive: true });
}

function sanitizeFilename(filename: string): string {
  // Remove or replace unsafe characters for filesystem
  return filename.replace(/[<>:"|?*\x00-\x1f]/g, "_").replace(/\.\./g, "_");
}

function ensureUniqueFilename(dir: string, baseFilename: string): string {
  const sanitized = sanitizeFilename(baseFilename);
  let candidate = sanitized;
  let counter = 1;
  
  while (existsSync(join(dir, candidate))) {
    const ext = candidate.includes(".") ? candidate.substring(candidate.lastIndexOf(".")) : "";
    const nameWithoutExt = ext ? candidate.substring(0, candidate.lastIndexOf(".")) : candidate;
    candidate = `${nameWithoutExt}_${counter}${ext}`;
    counter++;
  }
  
  return candidate;
}

function safeFilename(uid: number, messageId: string): string {
  const safe = messageId.replace(/[<>"\\/]/g, "_").slice(0, 80) || "msg";
  return `${uid}_${safe}.eml`;
}

function formatBytes(n: number): string {
  if (n >= 1024 * 1024) return (n / (1024 * 1024)).toFixed(2) + " MB";
  if (n >= 1024) return (n / 1024).toFixed(2) + " KB";
  return n + " B";
}

function logSyncMetrics(r: SyncResult): void {
  logger.info("Sync complete", {
    synced: r.synced,
    messagesFetched: r.messagesFetched,
    bytesDownloaded: r.bytesDownloaded,
    durationMs: r.durationMs,
    bandwidthBytesPerSec: Math.round(r.bandwidthBytesPerSec),
    messagesPerMinute: Math.round(r.messagesPerMinute),
  });
  // One-line summary for agents: easy to parse and infer speed
  const durationSec = (r.durationMs / 1000).toFixed(2);
  const bandwidth = formatBytes(r.bandwidthBytesPerSec) + "/s";
  const throughput = Math.round(r.messagesPerMinute) + " msg/min";
  logger.info("Sync metrics", {
    summary: `${r.synced} new, ${r.messagesFetched} fetched | ${formatBytes(r.bytesDownloaded)} down | ${bandwidth} | ${throughput} | ${durationSec}s`,
  });
}

export async function runSync(options?: SyncOptions): Promise<SyncResult> {
  const startTime = Date.now();
  const imap = requireImapConfig();
  if (!imap.user || !imap.password) {
    throw new Error("IMAP_USER and IMAP_PASSWORD are required for sync. Set them in .env");
  }

  const sinceSpec = options?.since ?? config.sync.defaultSince;
  const fromDate = parseSinceToDate(sinceSpec);
  logger.info("Sync starting", { user: imap.user, fromDate });

  ensureMaildir();
  const db = getDb();

  const sinceDate = new Date(fromDate + "T00:00:00Z");
  if (isNaN(sinceDate.getTime())) {
    throw new Error(`Invalid from date: ${fromDate}. Use --since 7d, 5w, 3m, 2y or set DEFAULT_SYNC_SINCE env var.`);
  }

  // Acquire lock with PID-based ownership
  const lockResult = acquireLock(db, "sync_summary", process.pid);
  if (!lockResult.acquired) {
    logger.info("Sync already running, exiting");
    const durationMs = Date.now() - startTime;
    return {
      synced: 0,
      messagesFetched: 0,
      bytesDownloaded: 0,
      durationMs,
      bandwidthBytesPerSec: 0,
      messagesPerMinute: 0,
    };
  }
  if (lockResult.takenOver) {
    // Partial work is safe: sync_state.last_uid is correct,
    // and message dedup prevents re-inserts
    logger.info("Recovered from crashed sync, resuming from last checkpoint");
  }

  const client = new ImapFlow({
    host: imap.host,
    port: imap.port,
    secure: imap.port === 993,
    auth: { user: imap.user, pass: imap.password },
    logger: false, // Keep sync output minimal; our logger reports start/complete/count
    connectionTimeout: 10000, // 10s to establish connection
    // NOTE: do not set socketTimeout — causes a segfault in Bun v1.1.38 on TLS sockets.
    // Use JS-level Promise.race timeout around fetchAll instead (see below).
  });

  try {
    await client.connect();
    logger.info("IMAP connected", { host: imap.host });

    const mailbox = config.sync.mailbox || getSyncMailbox(imap.host);
  const excludeLabels = config.sync.excludeLabels; // lowercase
    const lock = await client.getMailboxLock(mailbox);
    try {
      const mailboxObj = client.mailbox;
      const uidvalidity = mailboxObj && typeof mailboxObj === "object" ? mailboxObj.uidValidity ?? 0 : 0;
      const searchResult = await client.search({ since: sinceDate }, { uid: true });
      const allUids = Array.isArray(searchResult) ? searchResult : [];

      // Incremental sync (ADR-003): only fetch UIDs we don't have yet
      const state = db.query("SELECT uidvalidity, last_uid FROM sync_state WHERE folder = ?").get(mailbox) as
        | { uidvalidity: number; last_uid: number }
        | undefined;
      const uids =
        state && state.uidvalidity === uidvalidity && state.last_uid > 0
          ? allUids.filter((uid) => uid > state.last_uid)
          : allUids;
      if (state && state.uidvalidity === uidvalidity && state.last_uid > 0) {
        logger.info("Incremental sync", { folder: mailbox, newUids: uids.length, lastUid: state.last_uid });
      } else {
        logger.info("Messages to sync", { folder: mailbox, count: uids.length, since: fromDate });
      }

      if (uids.length === 0) {
        db.run("UPDATE sync_summary SET last_sync_at = datetime('now') WHERE id = 1");
        releaseLock(db, "sync_summary");
        const durationMs = Date.now() - startTime;
        const result: SyncResult = {
          synced: 0,
          messagesFetched: 0,
          bytesDownloaded: 0,
          durationMs,
          bandwidthBytesPerSec: 0,
          messagesPerMinute: 0,
        };
        logSyncMetrics(result);
        return result;
      }

      let synced = 0;
      let messagesFetched = 0;
      let bytesDownloaded = 0;
      let earliestDate: string | null = null;
      let latestDate: string | null = null;

      // Track the highest UID we've successfully checkpointed so far.
      // Starts from the last known checkpoint (may be 0 on first run).
      let checkpointUid = state && state.uidvalidity === uidvalidity ? (state.last_uid ?? 0) : 0;

      for (let i = 0; i < uids.length; i += BATCH_SIZE) {
        const batch = uids.slice(i, i + BATCH_SIZE);
        const batchNum = Math.floor(i / BATCH_SIZE) + 1;
        const totalBatches = Math.ceil(uids.length / BATCH_SIZE);
        logger.info("fetchAll start", {
          batch: `${batchNum}/${totalBatches}`,
          uids: batch.length,
          uidRange: `${batch[0]}..${batch[batch.length - 1]}`,
        });
        const fetchStart = Date.now();
        let fetchTimeoutId: ReturnType<typeof setTimeout> | undefined;
        const messages = await Promise.race([
          client.fetchAll(batch, { envelope: true, source: true, labels: true }, { uid: true }),
          new Promise<never>((_, reject) => {
            fetchTimeoutId = setTimeout(() => {
              reject(new Error(`fetchAll timed out after 30s (batch ${batchNum}/${totalBatches}, ${batch.length} UIDs)`));
            }, 30_000);
          }),
        ]);
        clearTimeout(fetchTimeoutId);
        logger.info("fetchAll done", {
          batch: `${batchNum}/${totalBatches}`,
          messages: messages.length,
          elapsedMs: Date.now() - fetchStart,
        });

        for (const msg of messages) {
          const raw = msg.source;
          if (!raw || !Buffer.isBuffer(raw)) continue;

          messagesFetched++;
          bytesDownloaded += Buffer.byteLength(raw);

          const labelSet = msg.labels != null ? (msg.labels instanceof Set ? msg.labels : new Set(msg.labels as string[])) : new Set<string>();
          const labelsArr = [...labelSet];
          const hasExcluded = excludeLabels.length > 0 && labelsArr.some((l) => excludeLabels.includes(String(l).toLowerCase()));
          if (hasExcluded) {
            continue; // Trash, Spam, etc. — skip storing (still counted in messagesFetched/bytesDownloaded)
          }

          const uid = msg.uid;
          let parsed;
          try {
            // Hard 5s timeout: a stuck parser never blocks the full sync.
            parsed = await Promise.race([
              parseRawMessage(Buffer.from(raw)),
              new Promise<never>((_, reject) =>
                setTimeout(() => reject(new Error("parse timeout")), 5_000)
              ),
            ]);
          } catch (err) {
            logger.warn("Parse failed, skipping message", { uid, bytes: Buffer.byteLength(raw), error: String(err) });
            continue;
          }

          const existing = db.query("SELECT 1 FROM messages WHERE message_id = ?").get(parsed.messageId);
          if (existing) {
            continue; // Already in DB; skip write and insert (saves disk I/O and avoids overwriting)
          }

          const filename = safeFilename(uid, parsed.messageId);
          const relPath = join("cur", filename);
          const absPath = join(config.maildirPath, relPath);
          writeFileSync(absPath, raw, "binary");

          const threadId = parsed.messageId;
          const labelsJson = JSON.stringify(labelsArr);
          db.run(
            `INSERT INTO messages (
              message_id, thread_id, folder, uid, labels, from_address, from_name,
              to_addresses, cc_addresses, subject, date, body_text, raw_path, embedding_state
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending')`,
            [
              parsed.messageId,
              threadId,
              mailbox,
              uid,
              labelsJson,
              parsed.fromAddress,
              parsed.fromName,
              JSON.stringify(parsed.toAddresses),
              JSON.stringify(parsed.ccAddresses),
              parsed.subject,
              parsed.date,
              parsed.bodyText,
              relPath,
            ]
          );

          db.run(
            `INSERT OR REPLACE INTO threads (thread_id, subject, participant_count, message_count, last_message_at)
             VALUES (?, ?, 1, 1, ?)`,
            [threadId, parsed.subject, parsed.date]
          );

          // Process attachments
          if (parsed.attachments.length > 0) {
            const attachmentsDir = join(config.maildirPath, "attachments", parsed.messageId);
            mkdirSync(attachmentsDir, { recursive: true });

            for (const att of parsed.attachments) {
              const uniqueFilename = ensureUniqueFilename(attachmentsDir, att.filename);
              const attachmentPath = join(attachmentsDir, uniqueFilename);
              writeFileSync(attachmentPath, att.content, "binary");

              const storedPath = join("attachments", parsed.messageId, uniqueFilename);
              db.run(
                `INSERT INTO attachments (message_id, filename, mime_type, size, stored_path, extracted_text)
                 VALUES (?, ?, ?, ?, ?, NULL)`,
                [parsed.messageId, att.filename, att.mimeType, att.size, storedPath]
              );
            }
          }

          synced++;
          if (!earliestDate || parsed.date < earliestDate) earliestDate = parsed.date;
          if (!latestDate || parsed.date > latestDate) latestDate = parsed.date;
        }

        // Checkpoint after each batch: next run skips these UIDs entirely,
        // even if we crash before the full sync completes.
        const batchMaxUid = Math.max(...batch);
        if (batchMaxUid > checkpointUid) {
          checkpointUid = batchMaxUid;
          db.run(
            "INSERT OR REPLACE INTO sync_state (folder, uidvalidity, last_uid) VALUES (?, ?, ?)",
            [mailbox, uidvalidity, checkpointUid]
          );
        }
      }

      db.run(
        `UPDATE sync_summary SET
          earliest_synced_date = COALESCE(?, earliest_synced_date),
          latest_synced_date = COALESCE(?, latest_synced_date),
          total_messages = (SELECT COUNT(*) FROM messages),
          last_sync_at = datetime('now')
         WHERE id = 1`,
        [earliestDate, latestDate]
      );
      releaseLock(db, "sync_summary");

      const durationMs = Date.now() - startTime;
      const durationSec = durationMs / 1000;
      const result: SyncResult = {
        synced,
        messagesFetched,
        bytesDownloaded,
        durationMs,
        bandwidthBytesPerSec: durationSec > 0 ? bytesDownloaded / durationSec : 0,
        messagesPerMinute: durationSec > 0 ? (messagesFetched / durationSec) * 60 : 0,
      };
      logSyncMetrics(result);

      return result;
    } finally {
      lock.release();
    }
  } catch (err) {
    releaseLock(db, "sync_summary");
    logger.error("Sync failed", { error: String(err) });
    throw err;
  } finally {
    // Force-close the connection. On a stalled/timed-out socket, logout hangs
    // indefinitely, so we close unconditionally and let the OS clean up TCP state.
    client.close();
  }
}

if (import.meta.main) {
  runSync().catch((err) => {
    logger.error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  });
}
