import { createClient } from '@/lib/supabase/server';
import { getMemoryIndex, isPineconeAvailable, getPineconeClient } from '@/lib/pinecone';
import { MEMORY_CATEGORIES, MemoryCategory } from '@/lib/constants';

interface MemoryItem {
  id: string;
  fact: string;
  category: MemoryCategory;
  importance: number;
  extracted_at: string;
}

export async function GET(req: Request) {
  console.log('[Memory List] Request received');

  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();

  if (authError || !user) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const category = searchParams.get('category') as MemoryCategory | null;
  const limit = Math.min(parseInt(searchParams.get('limit') || '100'), 100);

  if (!await isPineconeAvailable()) {
    console.log('[Memory List] Pinecone unavailable');
    return Response.json({ memories: [], total: 0, categories: {} });
  }

  try {
    const pc = getPineconeClient();
    const index = getMemoryIndex();

    // Build filter
    const filter: Record<string, unknown> = { user_id: { $eq: user.id } };
    if (category && MEMORY_CATEGORIES.includes(category)) {
      filter.category = { $eq: category };
    }

    // Generate a generic embedding to query all memories
    // Using a fitness-related phrase to get broad matches
    const embeddingResponse = await pc.inference.embed(
      'llama-text-embed-v2',
      ['fitness training nutrition health wellness workout exercise'],
      { inputType: 'query' }
    );

    // Validate embedding response
    const queryEmbedding = embeddingResponse?.data?.[0]?.values;
    if (!queryEmbedding || !Array.isArray(queryEmbedding)) {
      console.error('[Memory List] Failed to generate query embedding, response:', JSON.stringify(embeddingResponse).substring(0, 200));
      return Response.json({ memories: [], total: 0, categories: {} });
    }

    // Query with high topK to get all user memories
    // The metadata filter will ensure we only get this user's memories
    const results = await index.query({
      vector: queryEmbedding,
      topK: limit,
      filter,
      includeMetadata: true,
    });

    const memories: MemoryItem[] = (results.matches || [])
      .map(match => ({
        id: match.id,
        fact: (match.metadata?.fact as string) || '',
        category: (match.metadata?.category as MemoryCategory) || 'history',
        importance: (match.metadata?.importance as number) || 3,
        extracted_at: (match.metadata?.extracted_at as string) || '',
      }))
      .filter(m => m.fact) // Remove empty facts
      .sort((a, b) => {
        // Sort by importance first, then by date
        if (a.importance !== b.importance) {
          return b.importance - a.importance;
        }
        return new Date(b.extracted_at).getTime() - new Date(a.extracted_at).getTime();
      });

    // Count by category (from the filtered results)
    const categoryCounts: Record<string, number> = {};
    for (const cat of MEMORY_CATEGORIES) {
      categoryCounts[cat] = memories.filter(m => m.category === cat).length;
    }

    console.log('[Memory List] Found', memories.length, 'memories for user');

    return Response.json({
      memories,
      total: memories.length,
      categories: categoryCounts,
    });
  } catch (error) {
    console.error('[Memory List] Error:', error);
    return Response.json({ error: 'Failed to list memories' }, { status: 500 });
  }
}
