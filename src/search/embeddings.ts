import OpenAI from "openai";
import { config } from "~/lib/config";
import {
  getCachedEmbedding,
  setCachedEmbedding,
  MODEL_ID,
} from "./embedding-cache";

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
 * Responses are cached on disk by (model, hash of input) when embeddingCachePath is set.
 */
export async function embedText(text: string): Promise<number[]> {
  const input = truncateForEmbedding(text);
  const cacheDir = config.embeddingCachePath;
  const cached = await getCachedEmbedding(cacheDir, MODEL_ID, input);
  if (cached !== null) return cached;
  const client = getOpenAIClient();
  const response = await client.embeddings.create({
    model: MODEL_ID,
    input,
  });
  const embedding = response.data[0].embedding;
  await setCachedEmbedding(cacheDir, MODEL_ID, input, embedding);
  return embedding;
}

/**
 * Generate embeddings for multiple texts in a single API call.
 * Each text is truncated independently to fit the per-input token limit.
 * Batching reduces HTTP round-trips and lets OpenAI parallelize on GPU.
 * Cache hits are served from disk; only misses are sent to the API.
 */
export async function embedBatch(texts: string[]): Promise<number[][]> {
  if (texts.length === 0) return [];
  const cacheDir = config.embeddingCachePath;
  const truncated = texts.map(truncateForEmbedding);
  const results: (number[] | null)[] = await Promise.all(
    truncated.map((input) => getCachedEmbedding(cacheDir, MODEL_ID, input))
  );
  const missIndices: number[] = [];
  for (let i = 0; i < results.length; i++) {
    if (results[i] === null) missIndices.push(i);
  }
  if (missIndices.length === 0) {
    return results as number[][];
  }
  const client = getOpenAIClient();
  const missTexts = missIndices.map((i) => truncated[i]);
  let response;
  try {
    response = await client.embeddings.create({
      model: MODEL_ID,
      input: missTexts,
    });
  } catch (err) {
    // Re-throw with more context about the API call
    const error = err instanceof Error ? err : new Error(String(err));
    (error as any).apiCall = "embeddings.create";
    (error as any).inputCount = missTexts.length;
    (error as any).model = MODEL_ID;
    throw error;
  }
  const missEmbeddings = response.data.map((d) => d.embedding);
  
  // Cache writes can fail (e.g., disk full, permissions) but shouldn't fail the batch
  // Log errors but continue - embeddings are still valid
  const cachePromises = missIndices.map(async (idx, j) => {
    try {
      await setCachedEmbedding(cacheDir, MODEL_ID, truncated[idx], missEmbeddings[j]);
    } catch (cacheErr) {
      // Log cache write failures but don't fail the batch
      const { logger } = await import("~/lib/logger");
      logger.warn("Failed to cache embedding", {
        error: cacheErr instanceof Error ? cacheErr.message : String(cacheErr),
        inputLength: truncated[idx].length,
        cacheDir,
      });
    }
  });
  await Promise.all(cachePromises);
  
  for (let j = 0; j < missIndices.length; j++) {
    results[missIndices[j]] = missEmbeddings[j];
  }
  return results as number[][];
}

/**
 * Prepare text for embedding: concatenate subject and body with newline separator.
 * This is the standard format for email embeddings.
 */
export function prepareTextForEmbedding(subject: string, bodyText: string): string {
  return `${subject}\n${bodyText}`;
}
