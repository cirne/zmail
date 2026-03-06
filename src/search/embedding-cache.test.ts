import { describe, it, expect } from "vitest";
import { mkdtempSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { getCachedEmbedding, setCachedEmbedding, MODEL_ID } from "./embedding-cache";

describe("embedding-cache", () => {
  const testDir = mkdtempSync(join(tmpdir(), "zmail-embed-cache-"));

  const vec = [0.1, -0.2, 0.3];

  describe("getCachedEmbedding", () => {
    it("returns null when cache disabled (empty cacheDir)", async () => {
      const result = await getCachedEmbedding("", MODEL_ID, "hello");
      expect(result).toBeNull();
    });

    it("returns null when file does not exist", async () => {
      const result = await getCachedEmbedding(testDir, MODEL_ID, "nonexistent");
      expect(result).toBeNull();
    });

    it("returns cached vector after setCachedEmbedding", async () => {
      await setCachedEmbedding(testDir, MODEL_ID, "hello", vec);
      const result = await getCachedEmbedding(testDir, MODEL_ID, "hello");
      expect(result).toEqual(vec);
    });

    it("different input returns different cache entry", async () => {
      await setCachedEmbedding(testDir, MODEL_ID, "foo", [1, 2, 3]);
      await setCachedEmbedding(testDir, MODEL_ID, "bar", [4, 5, 6]);
      expect(await getCachedEmbedding(testDir, MODEL_ID, "foo")).toEqual([1, 2, 3]);
      expect(await getCachedEmbedding(testDir, MODEL_ID, "bar")).toEqual([4, 5, 6]);
    });

    it("different modelId uses different path (no cross-talk)", async () => {
      await setCachedEmbedding(testDir, "model-a", "same", [1]);
      await setCachedEmbedding(testDir, "model-b", "same", [2]);
      expect(await getCachedEmbedding(testDir, "model-a", "same")).toEqual([1]);
      expect(await getCachedEmbedding(testDir, "model-b", "same")).toEqual([2]);
    });
  });

  describe("setCachedEmbedding", () => {
    it("no-op when cacheDir empty", async () => {
      await setCachedEmbedding("", MODEL_ID, "noop", vec);
      const result = await getCachedEmbedding(testDir, MODEL_ID, "noop");
      expect(result).toBeNull();
    });
  });

  describe("batch order", () => {
    it("cache hit returns same vector (identity)", async () => {
      await setCachedEmbedding(testDir, MODEL_ID, "batch-a", vec);
      const a = await getCachedEmbedding(testDir, MODEL_ID, "batch-a");
      const b = await getCachedEmbedding(testDir, MODEL_ID, "batch-a");
      expect(a).toEqual(b);
      expect(a).toEqual(vec);
    });
  });
});
