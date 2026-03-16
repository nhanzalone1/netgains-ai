import { getMemoryIndex, isPineconeAvailable, RetrievedMemory, getPineconeClient } from './pinecone';
import { PINECONE_CONFIG } from './constants';

// Re-export for convenience
export type { RetrievedMemory };

/**
 * Retrieves relevant long-term memories for a user based on query text.
 * Uses Pinecone's integrated inference for embeddings.
 * Gracefully degrades if Pinecone is unavailable.
 */
export async function retrieveRelevantMemories(
  userId: string,
  queryText: string
): Promise<RetrievedMemory[]> {
  // Graceful degradation if Pinecone is unavailable
  const available = await isPineconeAvailable();
  if (!available) {
    console.warn('[Memory] Pinecone unavailable, skipping retrieval');
    return [];
  }

  try {
    const pc = getPineconeClient();
    const index = getMemoryIndex();

    // Generate embedding using Pinecone's inference API
    const embeddingResponse = await pc.inference.embed({
      model: 'llama-text-embed-v2',
      inputs: [queryText],
      parameters: { inputType: 'query' }
    });

    // Validate embedding response
    const queryEmbedding = embeddingResponse?.data?.[0]?.values;
    if (!queryEmbedding || !Array.isArray(queryEmbedding)) {
      console.error('[Memory] Failed to generate query embedding, response:', JSON.stringify(embeddingResponse).substring(0, 200));
      return [];
    }

    // Query with user filter
    const results = await index.query({
      vector: queryEmbedding,
      topK: PINECONE_CONFIG.RETRIEVAL_TOP_K,
      filter: { user_id: { $eq: userId } },
      includeMetadata: true,
    });

    if (!results.matches || results.matches.length === 0) {
      console.log('[Memory] No memories found for user');
      return [];
    }

    // Filter by similarity threshold and map to memory objects
    const memories: RetrievedMemory[] = results.matches
      .filter(match => (match.score ?? 0) >= PINECONE_CONFIG.SIMILARITY_THRESHOLD)
      .map(match => ({
        id: match.id,
        fact: (match.metadata?.fact as string) || '',
        category: (match.metadata?.category as string) || 'other',
        importance: (match.metadata?.importance as number) || 3,
        score: match.score ?? 0,
        extracted_at: (match.metadata?.extracted_at as string) || '',
      }))
      .filter(m => m.fact); // Remove any with empty facts

    // Sort by relevance (score) first, then recency
    memories.sort((a, b) => {
      if (Math.abs(a.score - b.score) > 0.1) {
        return b.score - a.score; // Higher score first
      }
      // If scores are close, prefer more recent
      return new Date(b.extracted_at).getTime() - new Date(a.extracted_at).getTime();
    });

    console.log(`[Memory] Retrieved ${memories.length} memories for query`);

    // Update access metadata asynchronously (fire and forget)
    updateAccessMetadata(index, results.matches.map(m => m.id)).catch(err => {
      console.error('[Memory] Failed to update access metadata:', err);
    });

    return memories;
  } catch (error) {
    console.error('[Memory] Retrieval error:', error);
    return []; // Graceful degradation
  }
}

/**
 * Updates last_accessed timestamp for retrieved memories.
 * Runs asynchronously to not block retrieval.
 */
async function updateAccessMetadata(
  index: ReturnType<typeof getMemoryIndex>,
  vectorIds: string[]
) {
  const now = new Date().toISOString();

  // Batch update in parallel
  const updatePromises = vectorIds.slice(0, 10).map(id =>
    index.update({
      id,
      metadata: {
        last_accessed: now,
      },
    }).catch(() => {
      // Silent failure for analytics - don't break the flow
    })
  );

  await Promise.all(updatePromises);
}
