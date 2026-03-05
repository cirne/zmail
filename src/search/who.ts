import type { Database } from "bun:sqlite";
import type { WhoPerson, WhoResult } from "~/lib/types";

export interface WhoOptions {
  query: string;
  limit?: number;
  minSent?: number;
  minReceived?: number;
  /** Mailbox owner address. When set: sent = emails I sent to them, received = emails from them to me, mentioned = emails where they were in to/cc (not sender). */
  ownerAddress?: string;
}

const DEFAULT_LIMIT = 50;

/**
 * Find identities (address + best-known display name) matching the query from
 * messages. When ownerAddress is set: sent = emails I sent to them, received = emails from them to me, mentioned = emails where they were in to/cc but not the sender.
 * When ownerAddress is not set (e.g. tests): sent = emails they sent, received = emails where they are in to/cc, mentioned = 0.
 */
export function who(db: Database, opts: WhoOptions): WhoResult {
  const { query, limit = DEFAULT_LIMIT, minSent = 0, minReceived = 0, ownerAddress } = opts;
  const pattern = `%${query.trim().toLowerCase()}%`;

  const baseCtes = /* sql */ `
      from_candidates AS (
        SELECT DISTINCT from_address AS address, from_name AS display_name
        FROM messages
        WHERE LOWER(from_address) LIKE ?
           OR (from_name IS NOT NULL AND LOWER(from_name) LIKE ?)
      ),
      to_cc_candidates AS (
        SELECT DISTINCT j.value AS address
        FROM messages m, json_each(m.to_addresses) j
        WHERE LOWER(j.value) LIKE ?
        UNION
        SELECT DISTINCT j.value AS address
        FROM messages m, json_each(m.cc_addresses) j
        WHERE LOWER(j.value) LIKE ?
      ),
      all_addresses AS (
        SELECT address, MAX(display_name) AS display_name
        FROM (
          SELECT address, display_name FROM from_candidates
          UNION ALL
          SELECT address, NULL AS display_name FROM to_cc_candidates
        )
        GROUP BY address
      )`;

  type Row = {
    address: string;
    displayName: string | null;
    sent_count: number;
    received_count: number;
    mentioned_count: number;
  };

  let rows: Row[];

  if (ownerAddress) {
    // sent = I sent to P; received = P sent to me; mentioned = P in to/cc and not sender
    rows = db
      .query(
        /* sql */ `
      WITH ${baseCtes},
      counted AS (
        SELECT
          a.address,
          a.display_name AS displayName,
          (SELECT COUNT(*) FROM messages m
           WHERE m.from_address = ? AND (
             EXISTS (SELECT 1 FROM json_each(m.to_addresses) j WHERE j.value = a.address)
             OR EXISTS (SELECT 1 FROM json_each(m.cc_addresses) j WHERE j.value = a.address)
           )) AS sent_count,
          (SELECT COUNT(*) FROM messages WHERE from_address = a.address) AS received_count,
          (SELECT COUNT(*) FROM messages m
           WHERE (EXISTS (SELECT 1 FROM json_each(m.to_addresses) j WHERE j.value = a.address)
                  OR EXISTS (SELECT 1 FROM json_each(m.cc_addresses) j WHERE j.value = a.address))
             AND m.from_address <> a.address) AS mentioned_count
        FROM all_addresses a
      )
      SELECT address, displayName, sent_count, received_count, mentioned_count
      FROM counted
      WHERE sent_count >= ? AND received_count >= ?
      ORDER BY sent_count DESC, received_count DESC, mentioned_count DESC
      LIMIT ?
      `
      )
      .all(pattern, pattern, pattern, pattern, ownerAddress, minSent, minReceived, limit) as Row[];
  } else {
    // Legacy: sent = they sent, received = they're in to/cc, mentioned = 0
    rows = db
      .query(
        /* sql */ `
      WITH ${baseCtes},
      counted AS (
        SELECT
          a.address,
          a.display_name AS displayName,
          (SELECT COUNT(*) FROM messages WHERE from_address = a.address) AS sent_count,
          (SELECT COUNT(*) FROM messages m
           WHERE EXISTS (SELECT 1 FROM json_each(m.to_addresses) j WHERE j.value = a.address)
              OR EXISTS (SELECT 1 FROM json_each(m.cc_addresses) j WHERE j.value = a.address)
          ) AS received_count,
          0 AS mentioned_count
        FROM all_addresses a
      )
      SELECT address, displayName, sent_count, received_count, mentioned_count
      FROM counted
      WHERE sent_count >= ? AND received_count >= ?
      ORDER BY sent_count DESC, received_count DESC, mentioned_count DESC
      LIMIT ?
      `
      )
      .all(pattern, pattern, pattern, pattern, minSent, minReceived, limit) as Row[];
  }

  const people: WhoPerson[] = rows.map((r) => ({
    address: r.address,
    displayName: r.displayName,
    sentCount: r.sent_count,
    receivedCount: r.received_count,
    mentionedCount: r.mentioned_count,
  }));

  return { query: query.trim(), people };
}
