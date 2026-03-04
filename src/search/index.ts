import type { Database } from "bun:sqlite";
import type { SearchResult } from "~/lib/types";

export interface SearchOptions {
  query: string;
  limit?: number;
  offset?: number;
  fromAddress?: string;
  afterDate?: string;
  beforeDate?: string;
}

export function search(db: Database, opts: SearchOptions): SearchResult[] {
  const { query, limit = 20, offset = 0 } = opts;

  // TODO: build dynamic WHERE clause from opts filters
  const rows = db
    .query(
      /* sql */ `
      SELECT
        m.message_id  AS messageId,
        m.thread_id   AS threadId,
        m.from_address AS fromAddress,
        m.from_name   AS fromName,
        m.subject,
        m.date,
        snippet(messages_fts, 2, '<b>', '</b>', '…', 20) AS snippet,
        rank
      FROM messages_fts
      JOIN messages m ON m.id = messages_fts.rowid
      WHERE messages_fts MATCH ?
      ORDER BY rank
      LIMIT ? OFFSET ?
    `
    )
    .all(query, limit, offset) as SearchResult[];

  return rows;
}
