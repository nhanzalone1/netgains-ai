import { createClient } from '@/lib/supabase/server';

export async function POST(request: Request) {
  const supabase = await createClient();

  // Get authenticated user
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Parse request body with error handling
  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'Invalid JSON in request body' }, { status: 400 });
  }

  const { goals } = body as {
    goals: {
      calories: number;
      protein: number;
      carbs: number;
      fat: number;
    };
  };

  // Upsert nutrition goals
  const { error: goalsError } = await supabase
    .from('nutrition_goals')
    .upsert(
      {
        user_id: user.id,
        calories: goals.calories,
        protein: goals.protein,
        carbs: goals.carbs,
        fat: goals.fat,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id' }
    );

  if (goalsError) {
    console.error('Failed to save nutrition goals:', goalsError);
    return Response.json({ error: 'Failed to save goals' }, { status: 500 });
  }

  // Mark nutrition onboarding as complete
  const { error: profileError } = await supabase
    .from('profiles')
    .update({ nutrition_onboarding_complete: true })
    .eq('id', user.id);

  if (profileError) {
    console.error('Failed to update profile:', profileError);
    // Don't fail the whole request - goals were saved
  }

  return Response.json({ success: true });
}
