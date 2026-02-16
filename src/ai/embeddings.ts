import { pipeline } from '@huggingface/transformers';
import type { FeatureExtractionPipeline } from '@huggingface/transformers';

const MODEL_NAME = 'Xenova/all-MiniLM-L6-v2';

let cachedPipeline: FeatureExtractionPipeline | undefined;

async function getEmbeddingPipeline(): Promise<FeatureExtractionPipeline> {
  if (cachedPipeline) {
    return cachedPipeline;
  }

  cachedPipeline = await pipeline('feature-extraction', MODEL_NAME);
  return cachedPipeline;
}

export async function generateEmbedding(text: string): Promise<Float32Array> {
  if (!text.trim()) {
    return new Float32Array(0);
  }

  const extractor = await getEmbeddingPipeline();
  const output = await extractor(text, { pooling: 'mean', normalize: true });

  return new Float32Array(output.data as ArrayLike<number>);
}

export function cosineSimilarity(a: Float32Array, b: Float32Array): number {
  if (a.length !== b.length) {
    throw new Error(`Embedding dimension mismatch: ${a.length} vs ${b.length}`);
  }

  if (a.length === 0) {
    return 0;
  }

  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    const valA = a[i]!;
    const valB = b[i]!;
    dotProduct += valA * valB;
    normA += valA * valA;
    normB += valB * valB;
  }

  const denominator = Math.sqrt(normA) * Math.sqrt(normB);
  if (denominator === 0) {
    return 0;
  }

  return dotProduct / denominator;
}
