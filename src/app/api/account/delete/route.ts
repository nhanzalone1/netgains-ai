import { createClient } from '@/lib/supabase/server';
import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import { getMemoryIndex, isPineconeAvailable } from '@/lib/pinecone';

// Service role client for admin operations (deleting auth user)
function getSupabaseAdmin() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

export async function POST() {
  try {
    // Verify authentication
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      console.log('[Account Delete] Auth failed:', authError?.message);
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const userId = user.id;
    console.log('[Account Delete] Starting deletion for user:', userId);

    const adminClient = getSupabaseAdmin();

    // Get workout IDs first for nested deletes
    const { data: workouts } = await adminClient
      .from('workouts')
      .select('id')
      .eq('user_id', userId);

    const workoutIds = workouts?.map(w => w.id) || [];

    if (workoutIds.length > 0) {
      // Get exercise IDs
      const { data: exercises } = await adminClient
        .from('exercises')
        .select('id')
        .in('workout_id', workoutIds);

      const exerciseIds = exercises?.map(e => e.id) || [];

      if (exerciseIds.length > 0) {
        // Delete sets
        await adminClient
          .from('sets')
          .delete()
          .in('exercise_id', exerciseIds);
      }

      // Delete exercises
      await adminClient
        .from('exercises')
        .delete()
        .in('workout_id', workoutIds);
    }

    // Delete from all user tables (most have ON DELETE CASCADE, but explicit is safer)
    // These can run in parallel since they're independent
    await Promise.all([
      adminClient.from('workouts').delete().eq('user_id', userId),
      adminClient.from('meals').delete().eq('user_id', userId),
      adminClient.from('nutrition_goals').delete().eq('user_id', userId),
      adminClient.from('coach_memory').delete().eq('user_id', userId),
      adminClient.from('chat_messages').delete().eq('user_id', userId),
      adminClient.from('milestones').delete().eq('user_id', userId),
      adminClient.from('weigh_ins').delete().eq('user_id', userId),
      adminClient.from('maxes').delete().eq('user_id', userId),
      adminClient.from('program_settings').delete().eq('user_id', userId),
      adminClient.from('program_progress').delete().eq('user_id', userId),
      adminClient.from('exercise_templates').delete().eq('user_id', userId),
      adminClient.from('split_muscle_groups').delete().eq('user_id', userId),
      adminClient.from('folders').delete().eq('user_id', userId),
      adminClient.from('locations').delete().eq('user_id', userId),
      adminClient.from('program_cycles').delete().eq('user_id', userId),
      adminClient.from('coaching_events').delete().eq('user_id', userId),
      adminClient.from('weekly_snapshots').delete().eq('user_id', userId),
    ]);

    console.log('[Account Delete] Deleted user data from tables');

    // Delete profile
    await adminClient.from('profiles').delete().eq('id', userId);
    console.log('[Account Delete] Deleted profile');

    // Delete Pinecone vectors
    try {
      const pineconeAvailable = await isPineconeAvailable();
      if (pineconeAvailable) {
        const index = getMemoryIndex();

        // Query all vectors for this user
        const queryResponse = await index.query({
          vector: new Array(1024).fill(0), // Dummy vector for metadata-only query
          topK: 10000,
          filter: { user_id: { $eq: userId } },
          includeMetadata: false,
        });

        if (queryResponse.matches && queryResponse.matches.length > 0) {
          const vectorIds = queryResponse.matches.map(m => m.id);
          await index.deleteMany(vectorIds);
          console.log(`[Account Delete] Deleted ${vectorIds.length} Pinecone vectors`);
        } else {
          console.log('[Account Delete] No Pinecone vectors found for user');
        }
      } else {
        console.log('[Account Delete] Pinecone unavailable, skipping vector deletion');
      }
    } catch (pineconeError) {
      console.error('[Account Delete] Pinecone deletion error:', pineconeError);
      // Continue with auth deletion even if Pinecone fails
    }

    // Delete auth user (this will cascade any remaining FK references)
    const { error: authDeleteError } = await adminClient.auth.admin.deleteUser(userId);
    if (authDeleteError) {
      console.error('[Account Delete] Auth user delete failed:', authDeleteError.message);
      return new Response(JSON.stringify({ error: 'Failed to delete account' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    console.log('[Account Delete] Successfully deleted user:', userId);
    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('[Account Delete] Unexpected error:', error);
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}
