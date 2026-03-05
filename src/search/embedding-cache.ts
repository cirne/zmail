import { createHash } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";

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
  const path = cacheFilePath(resolve(cacheDir), modelId, input);
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
 */
export async function setCachedEmbedding(
  cacheDir: string,
  modelId: string,
  input: string,
  embedding: number[]
): Promise<void> {
  if (!cacheDir) return;
  const root = resolve(cacheDir);
  const dir = join(root, modelId);
  await mkdir(dir, { recursive: true });
  const path = join(dir, `${hashInput(input)}.json`);
  const tmp = join(dir, `.tmp.${hashInput(input)}.${Date.now()}.json`);
  await writeFile(tmp, JSON.stringify(embedding), "utf8");
  await mkdir(dir, { recursive: true });
  await rename(tmp, path);
}

export { MODEL_ID };
