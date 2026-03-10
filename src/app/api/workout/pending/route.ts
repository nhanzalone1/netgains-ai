import { createClient } from '@/lib/supabase/server';

// GET: Fetch the current pending workout
export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return new Response('Unauthorized', { status: 401 });
    }

    // Fetch pending workout from coach_memory
    const { data, error } = await supabase
      .from('coach_memory')
      .select('value')
      .eq('user_id', user.id)
      .eq('key', 'pending_workout')
      .single();

    if (error && error.code !== 'PGRST116') {
      // PGRST116 = no rows returned (not an error for us)
      console.error('[pending-workout] GET error:', error);
      return Response.json({ error: error.message }, { status: 500 });
    }

    if (!data) {
      return Response.json({ pending_workout: null });
    }

    try {
      const pendingWorkout = JSON.parse(data.value);
      return Response.json({ pending_workout: pendingWorkout });
    } catch {
      return Response.json({ pending_workout: null, error: 'Failed to parse pending workout' });
    }
  } catch (error) {
    console.error('[pending-workout] Unexpected GET error:', error);
    return Response.json({ error: 'Failed to fetch pending workout' }, { status: 500 });
  }
}

// DELETE: Clear the pending workout (after it's been loaded or dismissed)
export async function DELETE() {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return new Response('Unauthorized', { status: 401 });
    }

    // Delete the pending workout from coach_memory
    const { error } = await supabase
      .from('coach_memory')
      .delete()
      .eq('user_id', user.id)
      .eq('key', 'pending_workout');

    if (error) {
      console.error('[pending-workout] DELETE error:', error);
      return Response.json({ error: error.message }, { status: 500 });
    }

    return Response.json({ success: true });
  } catch (error) {
    console.error('[pending-workout] Unexpected DELETE error:', error);
    return Response.json({ error: 'Failed to clear pending workout' }, { status: 500 });
  }
}
