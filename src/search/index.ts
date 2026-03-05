import type { Database } from "bun:sqlite";
import type { SearchResult } from "~/lib/types";
import { embedText } from "./embeddings";
import { searchVectors } from "./vectors";

export interface SearchOptions {
  query: string;
  limit?: number;
  offset?: number;
  fromAddress?: string;
  afterDate?: string;
  beforeDate?: string;
}

export function search(db: Database, opts: SearchOptions): SearchResult[] {
  const { query, limit = 20, offset = 0, fromAddress, afterDate, beforeDate } = opts;

  // Build dynamic WHERE clause with optional filters
  const conditions: string[] = ["messages_fts MATCH ?"];
  const params: (string | number)[] = [query];

  if (fromAddress) {
    conditions.push("m.from_address = ?");
    params.push(fromAddress);
  }

  if (afterDate) {
    conditions.push("m.date >= ?");
    params.push(afterDate);
  }

  if (beforeDate) {
    conditions.push("m.date <= ?");
    params.push(beforeDate);
  }

  params.push(limit, offset);

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
      WHERE ${conditions.join(" AND ")}
      ORDER BY rank
      LIMIT ? OFFSET ?
    `
    )
    .all(...params) as SearchResult[];

  return rows;
}

/**
 * Semantic search using vector embeddings.
 * Returns results ordered by semantic similarity to the query.
 */
export async function semanticSearch(db: Database, opts: SearchOptions): Promise<SearchResult[]> {
  const { query, limit = 20, offset = 0, fromAddress, afterDate, beforeDate } = opts;

  // Embed the query
  const queryEmbedding = await embedText(query);

  // Search LanceDB for similar messages
  const vectorResults = await searchVectors(queryEmbedding, limit + offset + 50); // Get extra for filtering

  // Fetch full message details from SQLite and apply filters
  const messageIds = vectorResults.map((r) => r.messageId);
  if (messageIds.length === 0) return [];

  const placeholders = messageIds.map(() => "?").join(",");
  const conditions: string[] = [`m.message_id IN (${placeholders})`];
  const params: (string | number)[] = [...messageIds];

  if (fromAddress) {
    conditions.push("m.from_address = ?");
    params.push(fromAddress);
  }

  if (afterDate) {
    conditions.push("m.date >= ?");
    params.push(afterDate);
  }

  if (beforeDate) {
    conditions.push("m.date <= ?");
    params.push(beforeDate);
  }

  // Fetch messages and preserve vector search order
  const messages = db
    .query(
      /* sql */ `
      SELECT
        m.message_id  AS messageId,
        m.thread_id   AS threadId,
        m.from_address AS fromAddress,
        m.from_name   AS fromName,
        m.subject,
        m.date,
        m.body_text   AS bodyText
      FROM messages m
      WHERE ${conditions.join(" AND ")}
    `
    )
    .all(...params) as Array<SearchResult & { bodyText: string }>;

  // Create a map of messageId -> vector score for ranking
  const scoreMap = new Map(vectorResults.map((r) => [r.messageId, r.score]));

  // Sort by vector score (highest first), then apply limit/offset
  const sorted = messages
    .map((m) => ({
      ...m,
      rank: scoreMap.get(m.messageId) ?? 0,
      snippet: generateSnippet(m.bodyText, query), // Simple snippet generation
    }))
    .sort((a, b) => b.rank - a.rank)
    .slice(offset, offset + limit);

  return sorted.map(({ bodyText, ...rest }) => rest);
}

/**
 * Hybrid search: combines FTS5 and semantic search using reciprocal rank fusion (RRF).
 * Runs both searches in parallel and merges results.
 */
export async function hybridSearch(db: Database, opts: SearchOptions): Promise<SearchResult[]> {
  const { limit = 20, offset = 0 } = opts;

  // Run both searches in parallel
  const [ftsResults, semanticResults] = await Promise.all([
    Promise.resolve(search(db, opts)), // FTS is synchronous
    semanticSearch(db, opts),
  ]);

  // Create maps for RRF scoring
  const ftsRankMap = new Map(ftsResults.map((r, idx) => [r.messageId, idx + 1]));
  const semanticRankMap = new Map(semanticResults.map((r, idx) => [r.messageId, idx + 1]));

  // Combine and deduplicate by messageId
  const combined = new Map<string, SearchResult & { rrfScore: number }>();

  // Add FTS results
  for (const result of ftsResults) {
    const rrfScore = 1 / (60 + (ftsRankMap.get(result.messageId) ?? 1000));
    combined.set(result.messageId, { ...result, rrfScore });
  }

  // Add semantic results, merging with existing
  for (const result of semanticResults) {
    const existing = combined.get(result.messageId);
    if (existing) {
      // Merge: keep FTS snippet (better for keyword matches), combine RRF scores
      const semanticRrf = 1 / (60 + (semanticRankMap.get(result.messageId) ?? 1000));
      existing.rrfScore += semanticRrf;
    } else {
      const semanticRrf = 1 / (60 + (semanticRankMap.get(result.messageId) ?? 1000));
      combined.set(result.messageId, { ...result, rrfScore: semanticRrf });
    }
  }

  // Sort by RRF score and apply limit/offset
  const sorted = Array.from(combined.values())
    .sort((a, b) => b.rrfScore - a.rrfScore)
    .slice(offset, offset + limit);

  // Remove rrfScore from final results
  return sorted.map(({ rrfScore, ...rest }) => rest);
}

/**
 * Generate a simple text snippet for semantic search results.
 * Finds the first occurrence of query terms (case-insensitive) and extracts surrounding context.
 */
function generateSnippet(text: string, query: string, contextLength: number = 100): string {
  const words = query.toLowerCase().split(/\s+/).filter((w) => w.length > 2);
  if (words.length === 0) {
    return text.slice(0, contextLength) + (text.length > contextLength ? "…" : "");
  }

  const lowerText = text.toLowerCase();
  let bestPos = -1;
  let bestWord = "";

  // Find the first occurrence of any query word
  for (const word of words) {
    const pos = lowerText.indexOf(word);
    if (pos >= 0 && (bestPos < 0 || pos < bestPos)) {
      bestPos = pos;
      bestWord = word;
    }
  }

  if (bestPos < 0) {
    return text.slice(0, contextLength) + (text.length > contextLength ? "…" : "");
  }

  // Extract context around the match
  const start = Math.max(0, bestPos - contextLength / 2);
  const end = Math.min(text.length, bestPos + bestWord.length + contextLength / 2);
  let snippet = text.slice(start, end);

  // Highlight the matched word (simple approach)
  const matchStart = bestPos - start;
  const matchEnd = matchStart + bestWord.length;
  snippet =
    snippet.slice(0, matchStart) +
    "<b>" +
    snippet.slice(matchStart, matchEnd) +
    "</b>" +
    snippet.slice(matchEnd);

  if (start > 0) snippet = "…" + snippet;
  if (end < text.length) snippet = snippet + "…";

  return snippet;
}
