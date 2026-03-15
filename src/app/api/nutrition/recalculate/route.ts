import { createClient } from '@/lib/supabase/server';

// Recalculates nutrition goals based on current profile (including intensity)
// Called when user changes goal intensity in profile settings
export async function POST() {
  const supabase = await createClient();

  // Get authenticated user
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Fetch user profile and coach memory for calculation inputs
  const [profileResult, memoriesResult] = await Promise.all([
    supabase
      .from('profiles')
      .select('weight_lbs, height_inches, goal, coaching_intensity')
      .eq('id', user.id)
      .maybeSingle(),
    supabase
      .from('coach_memory')
      .select('key, value')
      .eq('user_id', user.id)
      .in('key', ['age', 'days_per_week']),
  ]);

  if (profileResult.error || !profileResult.data) {
    return Response.json({ error: 'Profile not found' }, { status: 404 });
  }

  const profile = profileResult.data;
  const memories = memoriesResult.data || [];
  const memoryMap: Record<string, string> = {};
  memories.forEach(m => { memoryMap[m.key] = m.value; });

  // Get values with defaults
  const weightLbs = profile.weight_lbs || 170;
  const heightInches = profile.height_inches || 70;
  const age = parseInt(memoryMap.age) || 30;
  const daysPerWeek = parseInt(memoryMap.days_per_week) || 4;
  const goal = profile.goal || 'maintaining';
  const intensity = profile.coaching_intensity || 'moderate';

  // Convert to metric for Mifflin-St Jeor
  const weightKg = weightLbs * 0.453592;
  const heightCm = heightInches * 2.54;

  // Mifflin-St Jeor equation (for men - using +5)
  const bmr = (10 * weightKg) + (6.25 * heightCm) - (5 * age) + 5;

  // Activity factor based on training days
  let activityFactor: number;
  if (daysPerWeek <= 2) {
    activityFactor = 1.375;
  } else if (daysPerWeek <= 4) {
    activityFactor = 1.55;
  } else if (daysPerWeek <= 6) {
    activityFactor = 1.725;
  } else {
    activityFactor = 1.9;
  }

  // Calculate TDEE
  const tdee = bmr * activityFactor;

  // Get calorie adjustment based on intensity
  let calorieAdjustment: number;
  switch (intensity) {
    case 'light':
      calorieAdjustment = 300;
      break;
    case 'aggressive':
      calorieAdjustment = 750;
      break;
    case 'moderate':
    default:
      calorieAdjustment = 500;
      break;
  }

  // Adjust for goal
  let calories: number;
  switch (goal) {
    case 'bulking':
      calories = Math.round(tdee + calorieAdjustment);
      break;
    case 'cutting':
      calories = Math.round(tdee - calorieAdjustment);
      break;
    case 'maintaining':
    default:
      calories = Math.round(tdee);
      break;
  }

  // Calculate macros
  const protein = Math.round(weightLbs); // 1g per lb
  const fat = Math.round((calories * 0.25) / 9); // 25% of calories
  const carbs = Math.round((calories - protein * 4 - fat * 9) / 4); // Remaining

  console.log('[Nutrition Recalculate]', {
    intensity,
    goal,
    tdee: Math.round(tdee),
    calorieAdjustment,
    calories,
    protein,
    carbs,
    fat,
  });

  // Update nutrition goals in database
  const { error: updateError } = await supabase
    .from('nutrition_goals')
    .upsert(
      {
        user_id: user.id,
        calories,
        protein,
        carbs,
        fat,
      },
      { onConflict: 'user_id' }
    );

  if (updateError) {
    console.error('[Nutrition Recalculate] Failed to update goals:', updateError);
    return Response.json({ error: 'Failed to update goals' }, { status: 500 });
  }

  return Response.json({
    success: true,
    goals: { calories, protein, carbs, fat },
    intensity,
    goal,
  });
}
