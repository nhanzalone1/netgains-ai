import { createClient } from '@/lib/supabase/server';

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const {
      name,
      age,
      heightInches,
      weightLbs,
      goal,
      coachingMode,
      trainingSplit,
      splitRotation,
      injuries,
    } = body;

    // Validate required fields
    if (!name || !age || !heightInches || !weightLbs || !goal || !coachingMode || !trainingSplit || !splitRotation) {
      return Response.json({ error: 'Missing required fields' }, { status: 400 });
    }

    // Upsert profile with height, weight, goal, coaching_mode, and mark onboarding complete
    // Using upsert in case profile doesn't exist yet (though it should from signup trigger)
    const { error: profileError } = await supabase
      .from('profiles')
      .upsert({
        id: user.id,
        height_inches: heightInches,
        weight_lbs: weightLbs,
        goal,
        coaching_mode: coachingMode,
        onboarding_complete: true,
      }, { onConflict: 'id' });

    if (profileError) {
      console.error('[coach-onboarding] Profile update failed:', profileError);
      return Response.json({ error: 'Failed to update profile' }, { status: 500 });
    }

    // Save memories: name, age, training_split, split_rotation, injuries
    const memories = [
      { key: 'name', value: name },
      { key: 'age', value: String(age) },
      { key: 'training_split', value: trainingSplit },
      { key: 'split_rotation', value: JSON.stringify(splitRotation) },
      { key: 'injuries', value: injuries || 'none' },
    ];

    for (const memory of memories) {
      // Upsert each memory
      const { error: memoryError } = await supabase
        .from('coach_memory')
        .upsert(
          {
            user_id: user.id,
            key: memory.key,
            value: memory.value,
          },
          { onConflict: 'user_id,key' }
        );

      if (memoryError) {
        console.error(`[coach-onboarding] Memory save failed for ${memory.key}:`, memoryError);
        // Continue with other memories even if one fails
      }
    }

    return Response.json({ success: true });
  } catch (error) {
    console.error('[coach-onboarding] Unexpected error:', error);
    return Response.json({ error: 'Onboarding failed unexpectedly' }, { status: 500 });
  }
}
