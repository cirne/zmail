import { Database } from "bun:sqlite";
import { SCHEMA } from "./schema";

/** Open a fresh in-memory SQLite database with the full schema applied. */
export function createTestDb(): Database {
  const db = new Database(":memory:");
  db.run("PRAGMA journal_mode = WAL");
  db.run("PRAGMA foreign_keys = ON");
  db.run(SCHEMA);
  db.run("INSERT OR IGNORE INTO sync_summary (id, total_messages) VALUES (1, 0)");
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
    date: string;
  }> = {}
): string {
  const messageId =
    overrides.messageId ?? `<test-${Math.random().toString(36).slice(2)}@example.com>`;
  const threadId = overrides.threadId ?? "thread-1";
  const subject = overrides.subject ?? "Test subject";
  const bodyText = overrides.bodyText ?? "Test body content";
  const fromAddress = overrides.fromAddress ?? "sender@example.com";
  const date = overrides.date ?? new Date().toISOString();

  db.run(
    `INSERT INTO messages
       (message_id, thread_id, folder, uid, from_address, subject, body_text, date, raw_path)
     VALUES (?, ?, '[Gmail]/All Mail', 1, ?, ?, ?, ?, 'maildir/test.eml')`,
    [messageId, threadId, fromAddress, subject, bodyText, date]
  );

  return messageId;
}
