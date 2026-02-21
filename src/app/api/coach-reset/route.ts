import { createClient } from '@/lib/supabase/server';

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return new Response('Unauthorized', { status: 401 });
    }

    // Check for full wipe option
    const url = new URL(request.url);
    const fullWipe = url.searchParams.get('full') === 'true';

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

    // Full wipe: delete workouts, meals, and nutrition goals
    if (fullWipe) {
      // Get all workout IDs first (needed to delete exercises/sets)
      const { data: workouts } = await supabase
        .from('workouts')
        .select('id')
        .eq('user_id', user.id);

      if (workouts && workouts.length > 0) {
        const workoutIds = workouts.map(w => w.id);

        // Get all exercise IDs
        const { data: exercises } = await supabase
          .from('exercises')
          .select('id')
          .in('workout_id', workoutIds);

        if (exercises && exercises.length > 0) {
          const exerciseIds = exercises.map(e => e.id);

          // Delete sets first (foreign key)
          const { error: setsError } = await supabase
            .from('sets')
            .delete()
            .in('exercise_id', exerciseIds);

          if (setsError) {
            console.error('[coach-reset] Sets delete failed:', setsError);
            errors.push('sets');
          }
        }

        // Delete exercises
        const { error: exercisesError } = await supabase
          .from('exercises')
          .delete()
          .in('workout_id', workoutIds);

        if (exercisesError) {
          console.error('[coach-reset] Exercises delete failed:', exercisesError);
          errors.push('exercises');
        }

        // Delete workouts
        const { error: workoutsError } = await supabase
          .from('workouts')
          .delete()
          .eq('user_id', user.id);

        if (workoutsError) {
          console.error('[coach-reset] Workouts delete failed:', workoutsError);
          errors.push('workouts');
        }
      }

      // Delete all meals
      const { error: mealsError } = await supabase
        .from('meals')
        .delete()
        .eq('user_id', user.id);

      if (mealsError) {
        console.error('[coach-reset] Meals delete failed:', mealsError);
        errors.push('meals');
      }

      // Delete nutrition goals
      const { error: nutritionGoalsError } = await supabase
        .from('nutrition_goals')
        .delete()
        .eq('user_id', user.id);

      if (nutritionGoalsError) {
        console.error('[coach-reset] Nutrition goals delete failed:', nutritionGoalsError);
        errors.push('nutrition_goals');
      }
    }

    if (errors.length > 0) {
      return Response.json(
        { success: false, error: `Failed to reset: ${errors.join(', ')}` },
        { status: 500 }
      );
    }

    return Response.json({ success: true, fullWipe });
  } catch (error) {
    console.error('[coach-reset] Unexpected error:', error);
    return Response.json(
      { success: false, error: 'Reset failed unexpectedly' },
      { status: 500 }
    );
  }
}
