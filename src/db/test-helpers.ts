import { Database } from "bun:sqlite";
import { SCHEMA } from "./schema";

/** Open a fresh in-memory SQLite database with the full schema applied. */
export function createTestDb(): Database {
  const db = new Database(":memory:");
  db.run("PRAGMA journal_mode = WAL");
  db.run("PRAGMA foreign_keys = ON");
  db.run(SCHEMA);
  db.run("INSERT OR IGNORE INTO sync_summary (id, total_messages) VALUES (1, 0)");
  db.run("INSERT OR IGNORE INTO indexing_status (id) VALUES (1)");
  return db;
}

/** Insert a minimal message row for use in tests. Returns the message_id. */
export function insertTestMessage(
  db: Database,
  overrides: Partial<{
    messageId: string;
    threadId: string;
    subject: string;
    bodyText: string;
    fromAddress: string;
    toAddresses: string;
    ccAddresses: string;
    date: string;
    folder: string;
    uid: number;
  }> = {}
): string {
  const messageId =
    overrides.messageId ?? `<test-${Math.random().toString(36).slice(2)}@example.com>`;
  const threadId = overrides.threadId ?? "thread-1";
  const subject = overrides.subject ?? "Test subject";
  const bodyText = overrides.bodyText ?? "Test body content";
  const fromAddress = overrides.fromAddress ?? "sender@example.com";
  const toAddresses = overrides.toAddresses ?? "[]";
  const ccAddresses = overrides.ccAddresses ?? "[]";
  const date = overrides.date ?? new Date().toISOString();
  const folder = overrides.folder ?? "[Gmail]/All Mail";
  const uid = overrides.uid ?? 1;

  db.run(
    `INSERT INTO messages
       (message_id, thread_id, folder, uid, from_address, to_addresses, cc_addresses, subject, body_text, date, raw_path)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'maildir/test.eml')`,
    [messageId, threadId, folder, uid, fromAddress, toAddresses, ccAddresses, subject, bodyText, date]
  );

  return messageId;
}
