import { createClient } from '@/lib/supabase/server';
import { getMemoryIndex, isPineconeAvailable, getPineconeClient } from '@/lib/pinecone';

/**
 * DELETE /api/memory/clear-test
 * Clears all extracted memories for the current user (for pre-launch cleanup)
 * Query param ?all=true clears everything, otherwise tries to find test records
 */
export async function DELETE(req: Request) {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();

  if (authError || !user) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (!await isPineconeAvailable()) {
    return Response.json({ error: 'Pinecone unavailable' }, { status: 503 });
  }

  const { searchParams } = new URL(req.url);
  const clearAll = searchParams.get('all') === 'true';

  try {
    const pc = getPineconeClient();
    const index = getMemoryIndex();

    // Generate a real embedding for better query results
    const embeddingResponse = await pc.inference.embed({
      model: 'llama-text-embed-v2',
      inputs: ['fitness training nutrition health workout exercise'],
      parameters: { inputType: 'query' }
    });

    const queryVector = embeddingResponse?.data?.[0]?.values;
    if (!queryVector || !Array.isArray(queryVector)) {
      return Response.json({ error: 'Failed to generate query embedding' }, { status: 500 });
    }

    // Query for all user records
    const queryResponse = await index.query({
      vector: queryVector,
      topK: 100,
      filter: {
        user_id: { $eq: user.id },
      },
      includeMetadata: true,
    });

    const matches = queryResponse.matches || [];

    if (matches.length === 0) {
      return Response.json({
        success: true,
        deleted: 0,
        message: 'No memories found'
      });
    }

    // Get IDs to delete
    let idsToDelete: string[];
    if (clearAll) {
      // Clear all memories
      idsToDelete = matches.map(match => match.id);
    } else {
      // Try to identify test records (those with test- prefix or test metadata)
      idsToDelete = matches
        .filter(match => match.id.startsWith('test-') || match.metadata?.test_extraction === true)
        .map(match => match.id);
    }

    if (idsToDelete.length === 0) {
      return Response.json({
        success: true,
        deleted: 0,
        found: matches.length,
        message: clearAll ? 'No memories found' : 'No test records found. Use ?all=true to clear all memories.'
      });
    }

    // Delete records - Pinecone SDK v7 deleteMany takes array directly
    await index.deleteMany(idsToDelete);

    console.log('[Memory Clear] Deleted', idsToDelete.length, 'records for user', user.id);

    return Response.json({
      success: true,
      deleted: idsToDelete.length,
      ids: idsToDelete
    });
  } catch (error) {
    console.error('[Memory Clear] Error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return Response.json({ error: 'Failed to clear records', details: errorMessage }, { status: 500 });
  }
}
