/**
 * chromaService.js — Vector DB for chat context.
 *
 * ChromaDB is OPTIONAL. When unavailable (production without Chroma),
 * all operations gracefully return empty results instead of throwing.
 */

let ChromaClient, pipeline;
let chromaClient = null;
let chromaAvailable = false;
let extractor = null;

// ═══════════════ LAZY INITIALIZATION ═══════════════

/**
 * Attempt to connect to ChromaDB. If it fails, mark as unavailable
 * and all subsequent calls become no-ops.
 */
const initChroma = async () => {
  if (chromaClient !== null) return chromaAvailable;

  try {
    const chromaModule = await import('chromadb');
    ChromaClient = chromaModule.ChromaClient;
    chromaClient = new ChromaClient({ path: process.env.CHROMA_URL || "http://localhost:8000" });

    // Test the connection with a heartbeat
    await chromaClient.heartbeat();
    chromaAvailable = true;
    console.log('✅ ChromaDB connected');
  } catch (e) {
    chromaClient = 'unavailable'; // mark as attempted
    chromaAvailable = false;
    console.warn('⚠ ChromaDB not available — chat will use cached context only:', e.message);
  }

  return chromaAvailable;
};

// Initialize transformer pipeline for embeddings
const getExtractor = async () => {
  if (!extractor) {
    try {
      const transformersModule = await import('@xenova/transformers');
      pipeline = transformersModule.pipeline;
      extractor = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2');
    } catch (e) {
      console.warn('⚠ Transformers pipeline not available:', e.message);
      return null;
    }
  }
  return extractor;
};

export const generateEmbedding = async (text) => {
  const ext = await getExtractor();
  if (!ext) return null;

  const output = await ext(text, { pooling: 'mean', normalize: true });
  let list = output.tolist();
  if (Array.isArray(list[0])) {
    return list[0];
  }
  return list;
};

const dummyEmbeddingFunction = {
  generate: async (texts) => {
    const embeddings = [];
    for (const text of texts) {
      const emb = await generateEmbedding(text);
      if (emb) embeddings.push(emb);
    }
    return embeddings;
  }
};

export const storeDocuments = async (repoName, chunks, metadatas) => {
  const available = await initChroma();
  if (!available) return false;

  try {
    const collection = await chromaClient.getOrCreateCollection({
      name: repoName.replace(/[^a-zA-Z0-9_-]/g, '_'),
      embeddingFunction: dummyEmbeddingFunction
    });

    // Generate embeddings one by one to avoid memory spikes
    const embeddings = [];
    for (const chunk of chunks) {
      const emb = await generateEmbedding(chunk);
      if (!emb) return false;
      embeddings.push(emb);
    }

    const ids = chunks.map((_, i) => `chunk_${Date.now()}_${i}`);

    await collection.upsert({
      ids,
      embeddings,
      documents: chunks,
      metadatas
    });

    return true;
  } catch (error) {
    console.warn("ChromaDB store error:", error.message);
    return false;
  }
};

export const queryDocuments = async (repoName, query, nResults = 5) => {
  const available = await initChroma();
  if (!available) return [];

  try {
    const collection = await chromaClient.getCollection({
      name: repoName.replace(/[^a-zA-Z0-9_-]/g, '_'),
      embeddingFunction: dummyEmbeddingFunction
    });

    const queryEmbedding = await generateEmbedding(query);
    if (!queryEmbedding) return [];

    const results = await collection.query({
      queryEmbeddings: [queryEmbedding],
      nResults
    });

    if (results && results.documents && results.documents.length > 0) {
      return results.documents[0];
    }
    return [];
  } catch (error) {
    console.warn("Chroma query error:", error.message);
    return [];
  }
};
