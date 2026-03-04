import { runSync } from "~/sync";
import { search } from "~/search";
import { getDb } from "~/db";
import { startMcpServer } from "~/mcp";
import { logger } from "~/lib/logger";

const [, , command, ...args] = process.argv;

async function main() {
  switch (command) {
    case "sync": {
      await runSync();
      break;
    }

    case "search": {
      const query = args.join(" ");
      if (!query) {
        console.error("Usage: agentmail search <query>");
        process.exit(1);
      }
      const db = getDb();
      const results = search(db, { query });
      console.log(JSON.stringify(results, null, 2));
      break;
    }

    case "thread": {
      const threadId = args[0];
      if (!threadId) {
        console.error("Usage: agentmail thread <thread_id>");
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
        console.error("Usage: agentmail message <message_id>");
        process.exit(1);
      }
      const db = getDb();
      const message = db
        .query("SELECT * FROM messages WHERE message_id = ?")
        .get(messageId);
      console.log(JSON.stringify(message, null, 2));
      break;
    }

    case "mcp": {
      await startMcpServer();
      break;
    }

    default: {
      console.log(`agentmail — agent-first email

Usage:
  agentmail sync              Run IMAP sync
  agentmail search <query>    Search email (returns JSON)
  agentmail thread <id>       Fetch full thread (returns JSON)
  agentmail message <id>      Fetch single message (returns JSON)
  agentmail mcp               Start MCP server (stdio)
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
