import { runSync } from "~/sync";
import { search } from "~/search";
import { indexMessages } from "~/search/indexing";
import { getDb } from "~/db";
import { startMcpServer } from "~/mcp";
import { logger } from "~/lib/logger";
import { parseSinceToDate } from "~/sync/parse-since";

const [, , command, ...args] = process.argv;

async function main() {
  switch (command) {
    case "sync": {
      const sinceIdx = args.indexOf("--since");
      const since = sinceIdx >= 0 ? args[sinceIdx + 1] : undefined;
      if (sinceIdx >= 0 && (since === undefined || since.startsWith("-"))) {
        console.error("Usage: zmail sync [--since <spec>]");
        console.error("  --since  relative range: 7d, 5w, 3m, 2y (days, weeks, months, years)");
        process.exit(1);
      }

      // Run sync (bandwidth-bound) and indexing (API-rate-bound) concurrently (ADR-020).
      // syncDone resolves when sync finishes inserting messages, signaling the indexer
      // to drain the queue and exit — regardless of whether sync found 0 or 1000 messages.
      let resolveSyncDone!: () => void;
      const syncDone = new Promise<void>((resolve) => { resolveSyncDone = resolve; });

      const syncPromise = runSync(since ? { since } : undefined).then((result) => {
        resolveSyncDone();
        return result;
      });
      const indexPromise = indexMessages({ syncDone });

      // Wait for both to complete
      const [syncResult, indexResult] = await Promise.all([syncPromise, indexPromise]);

      if (syncResult) {
        const sec = (syncResult.durationMs / 1000).toFixed(2);
        const mb = (syncResult.bytesDownloaded / (1024 * 1024)).toFixed(2);
        const kbps = (syncResult.bandwidthBytesPerSec / 1024).toFixed(1);
        console.log("");
        console.log("Sync metrics:");
        console.log(`  messages:  ${syncResult.synced} new, ${syncResult.messagesFetched} fetched`);
        console.log(`  downloaded: ${mb} MB (${syncResult.bytesDownloaded} bytes)`);
        console.log(`  bandwidth: ${kbps} KB/s`);
        console.log(`  throughput: ${Math.round(syncResult.messagesPerMinute)} msg/min`);
        console.log(`  duration:  ${sec}s`);
      }

      if (indexResult.indexed > 0 || indexResult.failed > 0) {
        const sec = (indexResult.durationMs / 1000).toFixed(2);
        console.log("");
        console.log("Indexing metrics:");
        console.log(`  indexed:    ${indexResult.indexed}`);
        if (indexResult.skipped > 0) console.log(`  skipped:    ${indexResult.skipped}`);
        if (indexResult.failed > 0) console.log(`  failed:     ${indexResult.failed}`);
        console.log(`  throughput: ${indexResult.messagesPerMinute} msg/min`);
        console.log(`  duration:   ${sec}s`);
      }
      break;
    }

    case "search": {
      // Parse flags: --from, --after, --before, --limit
      const fromIdx = args.indexOf("--from");
      const afterIdx = args.indexOf("--after");
      const beforeIdx = args.indexOf("--before");
      const limitIdx = args.indexOf("--limit");
      const jsonIdx = args.indexOf("--json");

      const fromAddress = fromIdx >= 0 ? args[fromIdx + 1] : undefined;
      const afterRaw = afterIdx >= 0 ? args[afterIdx + 1] : undefined;
      const beforeRaw = beforeIdx >= 0 ? args[beforeIdx + 1] : undefined;
      const limitRaw = limitIdx >= 0 ? args[limitIdx + 1] : undefined;

      // Validate flag values
      if (fromIdx >= 0 && (!fromAddress || fromAddress.startsWith("-"))) {
        console.error("Usage: zmail search <query> [flags]");
        console.error("  --from      filter by sender email address");
        console.error("  --after     filter by date (ISO YYYY-MM-DD or relative: 7d, 2w, 1m)");
        console.error("  --before    filter by date (ISO YYYY-MM-DD or relative: 7d, 2w, 1m)");
        console.error("  --limit     max results (default: 20)");
        console.error("  --json      force JSON output (default: table for TTY, JSON when piped)");
        process.exit(1);
      }
      if (afterIdx >= 0 && (!afterRaw || afterRaw.startsWith("-"))) {
        console.error("Usage: zmail search <query> [--from <address>] [--after <date>] [--before <date>] [--limit <n>] [--json]");
        process.exit(1);
      }
      if (beforeIdx >= 0 && (!beforeRaw || beforeRaw.startsWith("-"))) {
        console.error("Usage: zmail search <query> [--from <address>] [--after <date>] [--before <date>] [--limit <n>] [--json]");
        process.exit(1);
      }
      if (limitIdx >= 0 && (!limitRaw || limitRaw.startsWith("-"))) {
        console.error("Usage: zmail search <query> [--from <address>] [--after <date>] [--before <date>] [--limit <n>] [--json]");
        process.exit(1);
      }

      // Parse dates (accept ISO YYYY-MM-DD or relative specs like 7d, 2w)
      let afterDate: string | undefined;
      let beforeDate: string | undefined;
      if (afterRaw) {
        try {
          // Try relative spec first (7d, 2w, etc.)
          afterDate = parseSinceToDate(afterRaw);
        } catch {
          // If that fails, assume ISO date (YYYY-MM-DD)
          if (/^\d{4}-\d{2}-\d{2}$/.test(afterRaw)) {
            afterDate = afterRaw;
          } else {
            console.error(`Invalid --after date: "${afterRaw}". Use ISO date (YYYY-MM-DD) or relative (7d, 2w, 1m)`);
            process.exit(1);
          }
        }
      }
      if (beforeRaw) {
        // Support ISO dates (YYYY-MM-DD) or relative specs (7d, 2w, etc.)
        // For relative, parseSinceToDate gives us "N days ago", which is what we want for --before
        try {
          if (/^\d{4}-\d{2}-\d{2}$/.test(beforeRaw)) {
            beforeDate = beforeRaw;
          } else {
            // Relative spec: "7d" means "7 days ago", which is the cutoff date for --before
            beforeDate = parseSinceToDate(beforeRaw);
          }
        } catch (err) {
          console.error(`Invalid --before date: "${beforeRaw}". Use ISO date (YYYY-MM-DD) or relative (7d, 2w, 1m)`);
          process.exit(1);
        }
      }

      const limit = limitRaw ? parseInt(limitRaw, 10) : undefined;
      if (limitIdx >= 0 && (isNaN(limit!) || limit! <= 0)) {
        console.error(`Invalid --limit: "${limitRaw}". Must be a positive number.`);
        process.exit(1);
      }

      // Extract query: everything that's not a flag or flag value
      const flagIndices = new Set<number>();
      if (fromIdx >= 0) {
        flagIndices.add(fromIdx);
        flagIndices.add(fromIdx + 1);
      }
      if (afterIdx >= 0) {
        flagIndices.add(afterIdx);
        flagIndices.add(afterIdx + 1);
      }
      if (beforeIdx >= 0) {
        flagIndices.add(beforeIdx);
        flagIndices.add(beforeIdx + 1);
      }
      if (limitIdx >= 0) {
        flagIndices.add(limitIdx);
        flagIndices.add(limitIdx + 1);
      }
      if (jsonIdx >= 0) {
        flagIndices.add(jsonIdx);
      }

      const queryParts = args.filter((_, idx) => !flagIndices.has(idx));
      const query = queryParts.join(" ").trim();

      const hasFilters = !!(fromAddress || afterDate || beforeDate);
      if (!query && !hasFilters) {
        console.error("Usage: zmail search <query> [flags]");
        console.error("Provide a query and/or filters (--from, --after, --before). Run 'zmail search --help' for details.");
        process.exit(1);
      }

      const db = getDb();
      const results = await search(db, {
        query,
        fromAddress,
        afterDate,
        beforeDate,
        limit,
      });

      // Output format: table for TTY, JSON when piped (unless --json is set)
      const isTty = process.stdout.isTTY;
      const forceJson = jsonIdx >= 0;

      if (forceJson || !isTty) {
        console.log(JSON.stringify(results, null, 2));
      } else {
        // Compact table output
        if (results.length === 0) {
          console.log("No results found.");
        } else {
          console.log(`Found ${results.length} result${results.length === 1 ? "" : "s"}:\n`);
          console.log("  DATE        FROM                 SUBJECT                          SNIPPET");
          console.log("  " + "-".repeat(80));
          for (const r of results) {
            const date = r.date.slice(0, 10);
            const from = (r.fromName ? `${r.fromName} ` : "") + `<${r.fromAddress}>`;
            const fromShort = from.length > 20 ? from.slice(0, 17) + "..." : from.padEnd(20);
            const subjectShort = r.subject.length > 30 ? r.subject.slice(0, 27) + "..." : r.subject.padEnd(30);
            const snippetClean = r.snippet.replace(/<[^>]+>/g, "").trim();
            const snippetShort = snippetClean.length > 30 ? snippetClean.slice(0, 27) + "..." : snippetClean;
            console.log(`  ${date}  ${fromShort}  ${subjectShort}  ${snippetShort}`);
          }
        }
      }
      break;
    }

    case "thread": {
      const threadId = args[0];
      if (!threadId) {
        console.error("Usage: zmail thread <thread_id>");
        process.exit(1);
      }
      const db = getDb();
      const messages = db
        .query("SELECT * FROM messages WHERE thread_id = ? ORDER BY date ASC")
        .all(threadId);
      console.log(JSON.stringify(messages, null, 2));
      break;
    }

    case "message": {
      const messageId = args[0];
      if (!messageId) {
        console.error("Usage: zmail message <message_id>");
        process.exit(1);
      }
      const db = getDb();
      const message = db
        .query("SELECT * FROM messages WHERE message_id = ?")
        .get(messageId);
      console.log(JSON.stringify(message, null, 2));
      break;
    }

    case "status": {
      const db = getDb();
      const syncStatus = db.query("SELECT * FROM sync_summary WHERE id = 1").get() as {
        earliest_synced_date: string | null;
        latest_synced_date: string | null;
        total_messages: number;
        last_sync_at: string | null;
        is_running: number;
      };
      const indexStatus = db.query("SELECT * FROM indexing_status WHERE id = 1").get() as {
        is_running: number;
        total_to_index: number;
        indexed_so_far: number;
        failed: number;
        started_at: string | null;
        last_updated_at: string | null;
        completed_at: string | null;
      };

      // Sync status
      if (syncStatus.is_running) {
        console.log(`Sync:      running`);
      } else if (syncStatus.last_sync_at) {
        console.log(`Sync:      idle (last: ${syncStatus.last_sync_at.slice(0, 10)}, ${syncStatus.total_messages} messages)`);
      } else {
        console.log(`Sync:      never run`);
      }

      // Indexing status
      if (indexStatus.is_running) {
        const elapsed = indexStatus.started_at
          ? Math.round((Date.now() - new Date(indexStatus.started_at).getTime()) / 1000)
          : 0;
        console.log(`Indexing:  running (${indexStatus.indexed_so_far}/${indexStatus.total_to_index} indexed, ${elapsed}s elapsed)`);
      } else if (indexStatus.completed_at) {
        console.log(`Indexing:  idle (last: ${indexStatus.completed_at.slice(0, 10)}, ${indexStatus.indexed_so_far} indexed)`);
      } else {
        console.log(`Indexing:  never run`);
      }

      // Search readiness
      const ftsCount = syncStatus.total_messages;
      // For semantic count, we check what's been indexed
      const semanticCount = indexStatus.indexed_so_far;
      console.log(`Search:    FTS ready (${ftsCount}) | Semantic ready (${semanticCount})`);
      break;
    }

    case "stats": {
      const db = getDb();
      const total = db.query("SELECT COUNT(*) as count FROM messages").get() as { count: number };
      const dateRange = db.query("SELECT MIN(date) as earliest, MAX(date) as latest FROM messages").get() as
        | { earliest: string | null; latest: string | null }
        | undefined;
      const topSenders = db
        .query(
          "SELECT from_address, COUNT(*) as count FROM messages GROUP BY from_address ORDER BY count DESC LIMIT 10"
        )
        .all() as Array<{ from_address: string; count: number }>;
      const folderBreakdown = db
        .query("SELECT folder, COUNT(*) as count FROM messages GROUP BY folder ORDER BY count DESC")
        .all() as Array<{ folder: string; count: number }>;

      console.log("Database Statistics\n");
      console.log(`Total messages: ${total.count}`);
      if (dateRange?.earliest && dateRange?.latest) {
        console.log(`Date range: ${dateRange.earliest.slice(0, 10)} to ${dateRange.latest.slice(0, 10)}`);
      }
      console.log("\nTop senders:");
      for (const sender of topSenders) {
        console.log(`  ${sender.from_address.padEnd(40)} ${sender.count}`);
      }
      console.log("\nMessages by folder:");
      for (const folder of folderBreakdown) {
        console.log(`  ${folder.folder.padEnd(40)} ${folder.count}`);
      }
      break;
    }

    case "mcp": {
      await startMcpServer();
      break;
    }

    default: {
      console.log(`zmail — agent-first email

Usage:
  zmail sync [--since <spec>]     Sync email + index embeddings (e.g. --since 7d, 5w, 3m, 2y)
  zmail search <query> [flags]    Search email (see --help for flags)
  zmail status                    Show sync and indexing status
  zmail stats                     Show database statistics
  zmail thread <id>               Fetch full thread (returns JSON)
  zmail message <id>              Fetch single message (returns JSON)
  zmail mcp                       Start MCP server (stdio)
`);
      if (command) {
        logger.error(`Unknown command: ${command}`);
        process.exit(1);
      }
    }
  }
}

main().catch((err) => {
  logger.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
