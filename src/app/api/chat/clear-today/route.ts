import { createClient } from '@/lib/supabase/server';

// Delete today's chat messages to allow regeneration of morning greeting
export async function POST() {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return new Response('Unauthorized', { status: 401 });
    }

    // Get today's date in YYYY-MM-DD format (UTC for database comparison)
    const today = new Date();
    const todayStr = today.toISOString().split('T')[0];

    console.log('[clear-today] Clearing messages for user:', user.id, 'date:', todayStr);

    // Delete messages created today
    const { error, count } = await supabase
      .from('chat_messages')
      .delete()
      .eq('user_id', user.id)
      .gte('created_at', `${todayStr}T00:00:00.000Z`)
      .lt('created_at', `${todayStr}T23:59:59.999Z`);

    if (error) {
      console.error('[clear-today] Delete failed:', error);
      return Response.json({ success: false, error: error.message }, { status: 500 });
    }

    console.log('[clear-today] Deleted', count, 'messages');

    return Response.json({
      success: true,
      deleted: count,
      message: 'Today\'s messages cleared. Refresh the page to get a new morning greeting.'
    });
  } catch (error) {
    console.error('[clear-today] Unexpected error:', error);
    return Response.json({ success: false, error: 'Clear failed unexpectedly' }, { status: 500 });
  }
}
