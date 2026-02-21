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
      daysPerWeek,
    } = body;

    console.log('[coach-onboarding] Received:', JSON.stringify({ name, age, heightInches, weightLbs, goal, coachingMode, trainingSplit, splitRotation, injuries, daysPerWeek }));

    // Validate core required fields (be lenient - we can default some values)
    if (!name || !goal) {
      console.error('[coach-onboarding] Missing core fields:', { name: !!name, goal: !!goal });
      return Response.json({ error: 'Missing required fields: name and goal are required' }, { status: 400 });
    }

    // Use defaults for optional/parseable fields
    const finalAge = age || 25;
    const finalHeight = heightInches || 70;
    const finalWeight = weightLbs || 170;
    const finalCoachingMode = coachingMode || 'assist';
    const finalTrainingSplit = trainingSplit || 'Custom';
    const finalSplitRotation = splitRotation || ['Day 1', 'Day 2', 'Rest'];
    const finalInjuries = injuries || 'none';
    const finalDaysPerWeek = daysPerWeek || 4;

    // Update profile with height, weight, goal, coaching_mode, and mark onboarding complete
    // Profile already exists from signup trigger (or nuclear reset which uses update, not delete)
    console.log('[coach-onboarding] Updating profile for user:', user.id);

    const { data: updateData, error: profileError } = await supabase
      .from('profiles')
      .update({
        height_inches: finalHeight,
        weight_lbs: finalWeight,
        goal,
        coaching_mode: finalCoachingMode,
        onboarding_complete: true,
      })
      .eq('id', user.id)
      .select();

    console.log('[coach-onboarding] Update result:', { updateData, profileError });

    if (profileError) {
      console.error('[coach-onboarding] Profile update failed:', {
        message: profileError.message,
        code: profileError.code,
        details: profileError.details,
        hint: profileError.hint,
        full: JSON.stringify(profileError, null, 2)
      });
      return Response.json({
        error: 'Failed to update profile',
        details: {
          message: profileError.message,
          code: profileError.code,
          hint: profileError.hint
        }
      }, { status: 500 });
    }

    // Check if update actually affected any rows
    if (!updateData || updateData.length === 0) {
      console.error('[coach-onboarding] Profile not found for user:', user.id);

      // Profile doesn't exist - create it
      console.log('[coach-onboarding] Creating profile for user:', user.id);
      const { error: insertError } = await supabase
        .from('profiles')
        .insert({
          id: user.id,
          height_inches: finalHeight,
          weight_lbs: finalWeight,
          goal,
          coaching_mode: finalCoachingMode,
          onboarding_complete: true,
        });

      if (insertError) {
        console.error('[coach-onboarding] Profile insert failed:', insertError);
        return Response.json({
          error: 'Failed to create profile',
          details: {
            message: insertError.message,
            code: insertError.code,
            hint: insertError.hint
          }
        }, { status: 500 });
      }
      console.log('[coach-onboarding] Profile created successfully');
    }

    // Save memories: name, age, training_split, split_rotation, injuries, days_per_week
    // Handle split_rotation - could be array or already stringified
    let splitRotationStr: string;
    if (Array.isArray(finalSplitRotation)) {
      splitRotationStr = JSON.stringify(finalSplitRotation);
    } else if (typeof finalSplitRotation === 'string') {
      splitRotationStr = finalSplitRotation;
    } else {
      splitRotationStr = '[]';
    }

    const memories = [
      { key: 'name', value: String(name) },
      { key: 'age', value: String(finalAge) },
      { key: 'training_split', value: String(finalTrainingSplit) },
      { key: 'split_rotation', value: splitRotationStr },
      { key: 'injuries', value: String(finalInjuries) },
      { key: 'days_per_week', value: String(finalDaysPerWeek) },
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
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return Response.json({ error: 'Onboarding failed unexpectedly', details: errorMessage }, { status: 500 });
  }
}
