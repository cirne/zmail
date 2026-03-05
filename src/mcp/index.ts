import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { getDb } from "~/db";
import { search } from "~/search";
import { logger } from "~/lib/logger";

export function createMcpServer() {
  const server = new McpServer({
    name: "zmail",
    version: "0.1.0",
  });

  server.tool(
    "search_mail",
    "Search emails by full-text query. Returns matching messages with snippets. Uses hybrid search (FTS5 + semantic).",
    {
      query: z.string().optional(),
      limit: z.number().optional(),
      offset: z.number().optional(),
      fromAddress: z.string().optional(),
      afterDate: z.string().optional(),
      beforeDate: z.string().optional(),
    },
    async ({ query, limit, offset, fromAddress, afterDate, beforeDate }) => {
      const db = getDb();
      const results = await search(db, {
        query,
        limit,
        offset,
        fromAddress,
        afterDate,
        beforeDate,
      });

      return {
        content: [{ type: "text", text: JSON.stringify(results, null, 2) }],
      };
    }
  );

  // TODO: get_thread(thread_id)
  // TODO: get_message(message_id)
  // TODO: list_attachments(thread_id?)
  // TODO: read_attachment(attachment_id)

  return server;
}

export async function startMcpServer() {
  const server = createMcpServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
  logger.info("MCP server running on stdio");
}
