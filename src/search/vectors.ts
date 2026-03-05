import { connect, type Connection, type Table } from "@lancedb/lancedb";
import { mkdirSync } from "fs";
import { config } from "~/lib/config";

const TABLE_NAME = "message_embeddings";

interface EmbeddingRow extends Record<string, unknown> {
  messageId: string;
  embedding: number[];
  subject: string;
  fromAddress: string;
  date: string;
}

let db: Connection | null = null;
let table: Table | null = null;

/**
 * Get or create the LanceDB connection and ensure the vectors directory exists.
 */
async function getVectorDb(): Promise<Connection> {
  if (!db) {
    mkdirSync(config.vectorsPath, { recursive: true });
    db = await connect(config.vectorsPath);
  }
  return db;
}

/**
 * Get or create the message_embeddings table.
 * Creates the table with the schema if it doesn't exist.
 */
async function getTable(): Promise<Table | null> {
  if (table) return table;
  const vectorDb = await getVectorDb();
  const tables = await vectorDb.tableNames();
  if (tables.includes(TABLE_NAME)) {
    table = await vectorDb.openTable(TABLE_NAME);
    return table;
  }
  // Table doesn't exist yet - return null (caller should handle this)
  return null;
}

/**
 * Upsert an embedding for a message.
 * If the messageId already exists, replaces it; otherwise inserts.
 */
export async function upsertEmbedding(
  messageId: string,
  embedding: number[],
  subject: string,
  fromAddress: string,
  date: string
): Promise<void> {
  let tbl = await getTable();
  if (!tbl) {
    // Create table with first row
    const vectorDb = await getVectorDb();
    const row: EmbeddingRow = {
      messageId,
      embedding,
      subject,
      fromAddress,
      date,
    };
    tbl = await vectorDb.createTable(TABLE_NAME, [row]);
    table = tbl;
    return;
  }
  const row: EmbeddingRow = {
    messageId,
    embedding,
    subject,
    fromAddress,
    date,
  };
  // LanceDB doesn't have native upsert, so we delete then insert
  await tbl.delete(`messageId = '${messageId.replace(/'/g, "''")}'`);
  await tbl.add([row]);
}

/**
 * Search for similar messages using k-nearest neighbors.
 * Returns messageIds ordered by similarity (most similar first).
 */
export async function searchVectors(
  queryEmbedding: number[],
  limit: number = 20
): Promise<Array<{ messageId: string; score: number }>> {
  const tbl = await getTable();
  if (!tbl) {
    // No embeddings yet
    return [];
  }
  const results = await tbl
    .search(queryEmbedding)
    .limit(limit)
    .toArray();
  return results.map((r: any) => ({
    messageId: r.messageId as string,
    score: r._distance ? 1 / (1 + r._distance) : 0, // Convert distance to similarity score
  }));
}

/**
 * Check if an embedding exists for a given messageId.
 */
export async function hasEmbedding(messageId: string): Promise<boolean> {
  const embeddedIds = await getAllEmbeddedMessageIds();
  return embeddedIds.has(messageId);
}

/**
 * Get all messageIds that have embeddings.
 * Useful for backfill operations.
 */
export async function getAllEmbeddedMessageIds(): Promise<Set<string>> {
  try {
    const tbl = await getTable();
    if (!tbl) {
      return new Set();
    }
    // LanceDB doesn't have a simple "list all" API, so we use a dummy zero vector
    // and search with a high limit. This returns all rows.
    const zeroVector = new Array(1536).fill(0); // text-embedding-3-small dimension
    const results = await tbl.search(zeroVector).limit(1000000).toArray();
    return new Set(results.map((r: any) => r.messageId as string));
  } catch (err) {
    // Table might not exist yet or be empty
    return new Set();
  }
}
