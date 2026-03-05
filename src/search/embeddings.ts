const MODEL_ID = "Xenova/bge-small-en-v1.5";
const DTYPE = "q8";
const QUERY_PREFIX =
  "Represent this sentence for searching relevant passages: ";

const MAX_CHARS = 8_000; // crude char cap; model tokenizer will truncate further

/**
 * Crude truncation to keep embedding input bounded.
 * BGE models have much smaller context than OpenAI; tokenizer truncation still applies.
 */
function truncateForEmbedding(text: string): string {
  if (text.length <= MAX_CHARS) return text;
  return text.slice(0, MAX_CHARS);
}

let extractorPromise: Promise<any> | null = null;

async function getExtractor(): Promise<any> {
  if (!extractorPromise) {
    const { pipeline } = await import("@huggingface/transformers");
    extractorPromise = pipeline("feature-extraction", MODEL_ID, { dtype: DTYPE });
  }
  return extractorPromise;
}

function tensorToVectors(out: any): number[][] {
  const dims = (out?.dims ?? []) as number[];
  const data = out?.data as Float32Array | undefined;
  if (!data) throw new Error("Unexpected embedding output: missing data");

  const dim = dims.length > 0 ? dims[dims.length - 1] : data.length;
  const batch = dims.length > 1 ? dims[0] : 1;

  if (batch * dim !== data.length) {
    throw new Error(
      `Unexpected embedding output shape: dims=${JSON.stringify(dims)} data_len=${data.length}`,
    );
  }

  const vectors: number[][] = [];
  for (let i = 0; i < batch; i++) {
    const start = i * dim;
    const end = start + dim;
    vectors.push(Array.from(data.slice(start, end)));
  }
  return vectors;
}

async function embedInternal(texts: string[]): Promise<number[][]> {
  if (texts.length === 0) return [];
  const extractor = await getExtractor();
  const out = await extractor(texts.map(truncateForEmbedding), {
    pooling: "mean",
    normalize: true,
  });
  return tensorToVectors(out);
}

/**
 * Generate an embedding for a single text string.
 * Uses local BGE small model (384 dimensions).
 */
export async function embedText(text: string): Promise<number[]> {
  const vectors = await embedInternal([`${QUERY_PREFIX}${text}`]);
  return vectors[0];
}

/**
 * Generate embeddings for multiple texts.
 * For index-time embeddings, passages are encoded without the query prefix.
 */
export async function embedBatch(texts: string[]): Promise<number[][]> {
  return embedInternal(texts);
}

/**
 * Prepare text for embedding: concatenate subject and body with newline separator.
 * This is the standard format for email embeddings.
 */
export function prepareTextForEmbedding(subject: string, bodyText: string): string {
  return `${subject}\n${bodyText}`;
}
