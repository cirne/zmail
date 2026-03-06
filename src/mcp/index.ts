import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { join } from "path";
import { getDb } from "~/db";
import { search } from "~/search";
import { logger } from "~/lib/logger";
import { extractAndCache } from "~/attachments";
import { config } from "~/lib/config";

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

  server.tool(
    "list_attachments",
    "List attachments for a message. Returns array of attachment metadata.",
    {
      messageId: z.string().describe("Message ID to list attachments for"),
    },
    async ({ messageId }) => {
      const db = getDb();
      const attachments = db
        .query(
          `SELECT id, filename, mime_type, size, stored_path, extracted_text
           FROM attachments WHERE message_id = ? ORDER BY filename`
        )
        .all(messageId) as Array<{
        id: number;
        filename: string;
        mime_type: string;
        size: number;
        stored_path: string;
        extracted_text: string | null;
      }>;

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              attachments.map((a) => ({
                id: a.id,
                filename: a.filename,
                mimeType: a.mime_type,
                size: a.size,
                extracted: a.extracted_text !== null,
              })),
              null,
              2
            ),
          },
        ],
      };
    }
  );

  server.tool(
    "read_attachment",
    "Read and extract an attachment. Returns markdown (for documents) or CSV (for spreadsheets). Extracts on first call and caches the result.",
    {
      attachmentId: z.number().describe("Attachment ID to read"),
    },
    async ({ attachmentId }) => {
      const db = getDb();
      const attachment = db
        .query("SELECT id, message_id, filename, mime_type, size, stored_path FROM attachments WHERE id = ?")
        .get(attachmentId) as
        | {
            id: number;
            message_id: string;
            filename: string;
            mime_type: string;
            size: number;
            stored_path: string;
          }
        | undefined;

      if (!attachment) {
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({ error: `Attachment ${attachmentId} not found` }, null, 2),
            },
          ],
        };
      }

      try {
        const absPath = join(config.maildirPath, attachment.stored_path);
        const { text } = await extractAndCache(absPath, attachment.mime_type, attachment.filename, attachment.id);
        return {
          content: [
            {
              type: "text",
              text,
            },
          ],
        };
      } catch (err) {
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                { error: `Failed to extract attachment: ${err instanceof Error ? err.message : String(err)}` },
                null,
                2
              ),
            },
          ],
        };
      }
    }
  );

  server.tool(
    "get_message",
    "Get a single message by message ID. Returns message content in LLM-friendly format.",
    {
      messageId: z.string().describe("Message ID to retrieve"),
      raw: z.boolean().optional().describe("Return raw EML format instead of parsed content"),
    },
    async ({ messageId, raw = false }) => {
      const db = getDb();
      const { formatMessageForOutput } = await import("~/cli");
      const { formatMessageLlmFriendly } = await import("~/cli/format-message");
      
      const message = db
        .query("SELECT * FROM messages WHERE message_id = ?")
        .get(messageId) as any | undefined;
      
      if (!message) {
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({ error: `Message ${messageId} not found` }, null, 2),
            },
          ],
        };
      }
      
      const shaped = await formatMessageForOutput(message, raw);
      const formatted = formatMessageLlmFriendly(message, shaped);
      
      return {
        content: [
          {
            type: "text",
            text: formatted,
          },
        ],
      };
    }
  );

  // TODO: get_thread(thread_id)

  return server;
}

export async function startMcpServer() {
  const server = createMcpServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
  logger.info("MCP server running on stdio");
}
