import OpenAI from "openai";
import { config } from "~/lib/config";

const MAX_CHARS = 8_000; // ~5.7K tokens at worst-case 1.4 chars/token (email w/ HTML remnants, URLs)

/**
 * Truncate text to stay within the embedding model's 8191-token limit.
 * Email body_text often contains HTML entities, URLs, and encoded content
 * that tokenize at ~1.6 chars/token — much worse than normal prose (~4 chars/token).
 */
function truncateForEmbedding(text: string): string {
  if (text.length <= MAX_CHARS) return text;
  return text.slice(0, MAX_CHARS);
}

let openaiClient: OpenAI | null = null;

function getOpenAIClient(): OpenAI {
  if (!openaiClient) {
    if (!config.openai.apiKey) {
      throw new Error("OPENAI_API_KEY is required for embeddings. Set it in .env");
    }
    openaiClient = new OpenAI({ apiKey: config.openai.apiKey });
  }
  return openaiClient;
}

/**
 * Generate an embedding for a single text string.
 * Uses OpenAI text-embedding-3-small (1536 dimensions, ~$0.02/M tokens).
 */
export async function embedText(text: string): Promise<number[]> {
  const client = getOpenAIClient();
  const response = await client.embeddings.create({
    model: "text-embedding-3-small",
    input: truncateForEmbedding(text),
  });
  return response.data[0].embedding;
}

/**
 * Generate embeddings for multiple texts in a single API call.
 * Each text is truncated independently to fit the per-input token limit.
 * Batching reduces HTTP round-trips and lets OpenAI parallelize on GPU.
 */
export async function embedBatch(texts: string[]): Promise<number[][]> {
  if (texts.length === 0) return [];
  const client = getOpenAIClient();
  const response = await client.embeddings.create({
    model: "text-embedding-3-small",
    input: texts.map(truncateForEmbedding),
  });
  return response.data.map((d) => d.embedding);
}

/**
 * Prepare text for embedding: concatenate subject and body with newline separator.
 * This is the standard format for email embeddings.
 */
export function prepareTextForEmbedding(subject: string, bodyText: string): string {
  return `${subject}\n${bodyText}`;
}
