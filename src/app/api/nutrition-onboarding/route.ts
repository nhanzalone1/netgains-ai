import { createClient } from '@/lib/supabase/server';

export async function POST(request: Request) {
  const supabase = await createClient();

  // Get authenticated user
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Parse request body
  const body = await request.json();
  const {
    calorieAwareness,
    statedCalories,
    trackingStyle,
    restrictions,
  } = body as {
    calorieAwareness: 'knows' | 'fresh';
    statedCalories?: number;
    trackingStyle: 'scale_app' | 'eyeballing' | 'no_tracking';
    restrictions: string;
  };

  // Fetch user profile for weight and goal
  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('weight_lbs, goal')
    .eq('id', user.id)
    .single();

  if (profileError || !profile) {
    return Response.json({ error: 'Profile not found' }, { status: 404 });
  }

  const weight = profile.weight_lbs || 170; // Default weight if not set
  const goal = profile.goal || 'maintaining'; // Default goal

  // Calculate calories based on goal
  // Bulk: weight × 17 (midpoint of 16-18)
  // Maintain: weight × 15 (midpoint of 14-16)
  // Cut: weight × 12 (midpoint of 11-13)
  let calorieMultiplier: number;
  let goalDescription: string;

  switch (goal) {
    case 'bulking':
      calorieMultiplier = 17;
      goalDescription = 'bulk';
      break;
    case 'cutting':
      calorieMultiplier = 12;
      goalDescription = 'cut';
      break;
    case 'maintaining':
    default:
      calorieMultiplier = 15;
      goalDescription = 'maintain';
      break;
  }

  const suggestedCalories = Math.round(weight * calorieMultiplier);

  // Calculate macros
  // Protein: 1g per lb bodyweight
  const protein = Math.round(weight);
  // Fat: 25% of calories
  const fat = Math.round((suggestedCalories * 0.25) / 9);
  // Carbs: remaining calories
  const carbs = Math.round((suggestedCalories - protein * 4 - fat * 9) / 4);

  // Build personalized message
  let message: string;
  if (statedCalories && Math.abs(statedCalories - suggestedCalories) > 200) {
    message = `You mentioned eating around ${statedCalories.toLocaleString()} calories. Based on your goal to ${goalDescription} at ${weight}lbs, I'd suggest around ${suggestedCalories.toLocaleString()} calories. You can use either as a starting point and adjust based on results.`;
  } else {
    message = `Based on your goal to ${goalDescription} at ${weight}lbs, here's your starting point:`;
  }

  // Save preferences to coach_memory
  const memoriesToSave = [
    { key: 'calorie_awareness', value: calorieAwareness },
    { key: 'tracking_style', value: trackingStyle },
  ];

  if (restrictions && restrictions.trim()) {
    memoriesToSave.push({ key: 'food_restrictions', value: restrictions.trim() });
  }

  // Upsert memories
  for (const memory of memoriesToSave) {
    await supabase
      .from('coach_memory')
      .upsert(
        { user_id: user.id, key: memory.key, value: memory.value },
        { onConflict: 'user_id,key' }
      );
  }

  return Response.json({
    goals: {
      calories: suggestedCalories,
      protein,
      carbs,
      fat,
    },
    userStatedCalories: statedCalories || null,
    suggestedCalories,
    message,
  });
}
