import { createHash } from "node:crypto";
import { access, mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";

const MODEL_ID = "text-embedding-3-small";

function hashInput(input: string): string {
  return createHash("sha256").update(input, "utf8").digest("hex");
}

function cacheFilePath(cacheDir: string, modelId: string, input: string): string {
  return join(cacheDir, modelId, `${hashInput(input)}.json`);
}

/**
 * Read a cached embedding from disk. Returns null if not found or cache disabled.
 * @param cacheDir - Root cache directory (empty string = disabled)
 * @param modelId - Model identifier (e.g. text-embedding-3-small)
 * @param input - Exact string that was sent to the API (truncated)
 */
export async function getCachedEmbedding(
  cacheDir: string,
  modelId: string,
  input: string
): Promise<number[] | null> {
  if (!cacheDir) return null;
  const path = cacheFilePath(cacheDir, modelId, input);
  try {
    const raw = await readFile(path, "utf8");
    const arr = JSON.parse(raw) as number[];
    return Array.isArray(arr) ? arr : null;
  } catch {
    return null;
  }
}

/**
 * Write an embedding to the cache. No-op if cache disabled.
 * Uses temp file + rename for atomic write.
 * Handles race conditions gracefully: if multiple batches are processing different messages
 * with identical subject/body text concurrently, they'll try to cache the same embedding.
 * Only one needs to succeed - others will detect the file already exists and skip.
 */
export async function setCachedEmbedding(
  cacheDir: string,
  modelId: string,
  input: string,
  embedding: number[]
): Promise<void> {
  if (!cacheDir) return;
  const dir = join(cacheDir, modelId);
  const path = join(dir, `${hashInput(input)}.json`);
  
  // Check if target already exists (another process may have cached it)
  try {
    await access(path);
    // File exists, skip write (another process won the race)
    return;
  } catch {
    // File doesn't exist, proceed with write
  }
  
  // Ensure directory exists before writing
  await mkdir(dir, { recursive: true });
  const tmp = join(dir, `.tmp.${hashInput(input)}.${Date.now()}.json`);
  
  try {
    await writeFile(tmp, JSON.stringify(embedding), "utf8");
    await rename(tmp, path);
  } catch (err: any) {
    // Handle race conditions:
    // - If rename fails because target exists, another process won the race (success)
    // - If rename fails because temp file doesn't exist, check if target exists
    // - Other errors (permissions, disk full) should propagate
    if (err?.code === "ENOENT") {
      // Temp file doesn't exist or target directory missing
      // Check if target exists (another process may have succeeded)
      try {
        await access(path);
        // Target exists, another process won the race - success
        return;
      } catch {
        // Target doesn't exist either - rethrow original error
        throw err;
      }
    } else if (err?.code === "EEXIST" || err?.code === "ENOTEMPTY") {
      // Target already exists (race condition) - success
      return;
    }
    // Other errors (permissions, disk full, etc.) - rethrow
    throw err;
  }
}

export { MODEL_ID };
