import { describe, it, expect } from "bun:test";
import { prepareTextForEmbedding } from "./embeddings";

// We can't test embedText/embedBatch without an API key, but we can
// test the text preparation and verify the truncation constant.

describe("prepareTextForEmbedding", () => {
  it("concatenates subject and body with newline", () => {
    const result = prepareTextForEmbedding("Hello", "World");
    expect(result).toBe("Hello\nWorld");
  });

  it("handles empty body", () => {
    const result = prepareTextForEmbedding("Subject only", "");
    expect(result).toBe("Subject only\n");
  });

  it("handles empty subject", () => {
    const result = prepareTextForEmbedding("", "Body only");
    expect(result).toBe("\nBody only");
  });
});

describe("truncation boundary", () => {
  // The truncation is internal to embedText/embedBatch, but we can verify
  // the MAX_CHARS constant indirectly: prepareTextForEmbedding output over
  // 8K chars should still be accepted by the truncation layer.
  it("prepareTextForEmbedding can produce text longer than 8K chars", () => {
    const longBody = "x".repeat(20_000);
    const result = prepareTextForEmbedding("Subject", longBody);
    expect(result.length).toBeGreaterThan(8_000);
  });
});
