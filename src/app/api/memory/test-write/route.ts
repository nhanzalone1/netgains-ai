import { createClient } from '@/lib/supabase/server';
import { getMemoryIndex, isPineconeAvailable, getPineconeClient } from '@/lib/pinecone';

/**
 * POST /api/memory/test-write
 * Simple test to verify Pinecone writes work (bypasses Claude extraction)
 */
export async function POST() {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();

  if (authError || !user) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (!await isPineconeAvailable()) {
    return Response.json({ error: 'Pinecone unavailable' }, { status: 503 });
  }

  try {
    const pc = getPineconeClient();
    const index = getMemoryIndex();
    const now = new Date().toISOString();

    // Generate embedding for a test fact
    const testFact = 'This is a test memory to verify Pinecone works';

    const embeddingResponse = await pc.inference.embed({
      model: 'llama-text-embed-v2',
      inputs: [testFact],
      parameters: { inputType: 'passage' }
    });

    const embedding = embeddingResponse?.data?.[0]?.values;
    if (!embedding) {
      return Response.json({ error: 'Failed to generate embedding' }, { status: 500 });
    }

    // Create test vector
    const vectorId = `test-${user.id}-${Date.now()}`;
    const vector = {
      id: vectorId,
      values: embedding,
      metadata: {
        user_id: user.id,
        category: 'training',
        importance: 3,
        fact: testFact,
        source_text: 'Test write endpoint',
        extracted_at: now,
        last_accessed: now,
        test_record: true,
      },
    };

    // Upsert to Pinecone (SDK v7 syntax)
    await index.upsert({ records: [vector] });

    console.log('[Memory Test] Successfully wrote test vector:', vectorId);

    return Response.json({
      success: true,
      message: 'Test record written to Pinecone',
      id: vectorId,
    });
  } catch (error) {
    console.error('[Memory Test] Error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return Response.json({ error: 'Failed to write test record', details: errorMessage }, { status: 500 });
  }
}
