import { createClient } from '@/lib/supabase/server';

export async function POST() {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();

  if (authError || !user) {
    return new Response('Unauthorized', { status: 401 });
  }

  // Reset onboarding
  await supabase
    .from('profiles')
    .update({ onboarding_complete: false })
    .eq('id', user.id);

  // Delete all coach memories
  await supabase
    .from('coach_memory')
    .delete()
    .eq('user_id', user.id);

  return Response.json({ success: true });
}
