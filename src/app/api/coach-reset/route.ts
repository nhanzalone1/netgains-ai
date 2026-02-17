import { createClient } from '@/lib/supabase/server';

export async function POST() {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();

  if (authError || !user) {
    return new Response('Unauthorized', { status: 401 });
  }

  // Reset onboarding and clear all profile data
  await supabase
    .from('profiles')
    .update({
      onboarding_complete: false,
      app_tour_shown: false,
      coaching_mode: null,
      goal: null,
      height_inches: null,
      weight_lbs: null,
    })
    .eq('id', user.id);

  // Delete all coach memories
  await supabase
    .from('coach_memory')
    .delete()
    .eq('user_id', user.id);

  return Response.json({ success: true });
}
