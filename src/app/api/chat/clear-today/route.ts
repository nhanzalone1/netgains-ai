import { createClient } from '@/lib/supabase/server';
import { createClient as createSupabaseClient } from '@supabase/supabase-js';

function getSupabaseAdmin() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

// Delete the onboarding message and allow regeneration of morning greeting
export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return new Response('Unauthorized', { status: 401 });
    }

    // Get local date from client (to handle timezone correctly)
    const body = await request.json().catch(() => ({}));
    const localDate = body.localDate; // Expected format: YYYY-MM-DD

    console.log('[clear-today] User:', user.id, 'localDate:', localDate);

    // Use admin client to bypass RLS
    const adminClient = getSupabaseAdmin();

    // Strategy 1: Delete the specific onboarding message by content pattern
    const { error: deleteOnboardingError, count: onboardingCount } = await adminClient
      .from('chat_messages')
      .delete()
      .eq('user_id', user.id)
      .ilike('content', '%let\'s get you set up%what should i call you%');

    if (deleteOnboardingError) {
      console.error('[clear-today] Delete onboarding message failed:', deleteOnboardingError);
    } else {
      console.log('[clear-today] Deleted', onboardingCount, 'onboarding messages');
    }

    // Strategy 2: Also delete any hidden trigger messages from today
    if (localDate) {
      // Delete messages where created_at starts with the local date
      // This handles timezone issues by matching the date portion
      const { error: deleteTriggerError, count: triggerCount } = await adminClient
        .from('chat_messages')
        .delete()
        .eq('user_id', user.id)
        .eq('hidden', true)
        .gte('created_at', `${localDate}T00:00:00`)
        .lt('created_at', `${localDate}T23:59:59`);

      if (deleteTriggerError) {
        console.error('[clear-today] Delete triggers failed:', deleteTriggerError);
      } else {
        console.log('[clear-today] Deleted', triggerCount, 'hidden triggers');
      }
    }

    return Response.json({
      success: true,
      message: 'Onboarding message cleared. Clear localStorage and refresh to get new greeting.'
    });
  } catch (error) {
    console.error('[clear-today] Unexpected error:', error);
    return Response.json({ success: false, error: 'Clear failed unexpectedly' }, { status: 500 });
  }
}
