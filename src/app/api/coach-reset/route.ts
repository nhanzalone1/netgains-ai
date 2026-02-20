import { createClient } from '@/lib/supabase/server';

export async function POST() {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return new Response('Unauthorized', { status: 401 });
    }

    const errors: string[] = [];

    // Reset onboarding and clear all profile data
    const { error: profileError } = await supabase
      .from('profiles')
      .update({
        onboarding_complete: false,
        nutrition_onboarding_complete: false,
        app_tour_shown: false,
        coaching_mode: null,
        goal: null,
        height_inches: null,
        weight_lbs: null,
      })
      .eq('id', user.id);

    if (profileError) {
      console.error('[coach-reset] Profile reset failed:', profileError);
      errors.push('profile');
    }

    // Delete all coach memories
    const { error: memoryError } = await supabase
      .from('coach_memory')
      .delete()
      .eq('user_id', user.id);

    if (memoryError) {
      console.error('[coach-reset] Memory delete failed:', memoryError);
      errors.push('memories');
    }

    // Delete all milestones
    const { error: milestoneError } = await supabase
      .from('milestones')
      .delete()
      .eq('user_id', user.id);

    if (milestoneError) {
      console.error('[coach-reset] Milestone delete failed:', milestoneError);
      errors.push('milestones');
    }

    // Delete all chat messages
    const { error: chatError } = await supabase
      .from('chat_messages')
      .delete()
      .eq('user_id', user.id);

    if (chatError) {
      console.error('[coach-reset] Chat delete failed:', chatError);
      errors.push('chat');
    }

    if (errors.length > 0) {
      return Response.json(
        { success: false, error: `Failed to reset: ${errors.join(', ')}` },
        { status: 500 }
      );
    }

    return Response.json({ success: true });
  } catch (error) {
    console.error('[coach-reset] Unexpected error:', error);
    return Response.json(
      { success: false, error: 'Reset failed unexpectedly' },
      { status: 500 }
    );
  }
}
