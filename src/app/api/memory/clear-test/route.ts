import { createClient } from '@/lib/supabase/server';
import { getMemoryIndex, isPineconeAvailable } from '@/lib/pinecone';

/**
 * DELETE /api/memory/clear-test
 * Deletes all test extraction records (IDs starting with "test-") for the current user
 */
export async function DELETE() {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();

  if (authError || !user) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (!await isPineconeAvailable()) {
    return Response.json({ error: 'Pinecone unavailable' }, { status: 503 });
  }

  try {
    const index = getMemoryIndex();

    // Query for test records belonging to this user
    // We need to find records with IDs starting with "test-{userId}"
    const testIdPrefix = `test-${user.id}`;

    // Delete by ID prefix - Pinecone allows deleting by ID list
    // First, let's query to find the test record IDs
    const queryResponse = await index.query({
      vector: new Array(1024).fill(0), // Dummy vector
      topK: 100,
      filter: {
        user_id: { $eq: user.id },
      },
      includeMetadata: true,
    });

    const testRecordIds = (queryResponse.matches || [])
      .filter(match => match.id.startsWith('test-') || match.metadata?.test_extraction === true)
      .map(match => match.id);

    if (testRecordIds.length === 0) {
      return Response.json({
        success: true,
        deleted: 0,
        message: 'No test records found'
      });
    }

    // Delete the test records
    await index.deleteMany(testRecordIds);

    return Response.json({
      success: true,
      deleted: testRecordIds.length,
      ids: testRecordIds
    });
  } catch (error) {
    console.error('[Memory Clear Test] Error:', error);
    return Response.json({ error: 'Failed to clear test records' }, { status: 500 });
  }
}
