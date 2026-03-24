// Coach notification system for auto-triggered messages
// Uses database to track last viewed time and check for new messages

import { createClient } from '@/lib/supabase/client';
import { apiFetch } from '@/lib/capacitor';

const supabase = createClient();

// Debounce state for batching meal triggers
interface PendingMeal {
  mealName: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
}

let pendingMeals: PendingMeal[] = [];
let pendingTriggerTimeout: ReturnType<typeof setTimeout> | null = null;
let pendingUserId: string | null = null;
let pendingTimeContext: { localTime: string; localHour: number; localDate: string } | null = null;

const MEAL_BATCH_DELAY_MS = 3000; // Wait 3 seconds to batch multiple meals

// Check if there are unread coach messages (assistant messages newer than last viewed)
export async function hasUnreadCoachMessages(userId: string): Promise<boolean> {
  try {
    // Get last viewed timestamp from coach_memory
    const { data: lastViewedData } = await supabase
      .from('coach_memory')
      .select('value')
      .eq('user_id', userId)
      .eq('key', 'coach_last_viewed_at')
      .maybeSingle();

    const lastViewedAt = lastViewedData?.value || '1970-01-01T00:00:00Z';

    // Check for assistant messages created after last viewed
    const { count, error } = await supabase
      .from('chat_messages')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('role', 'assistant')
      .eq('hidden', false)
      .gt('created_at', lastViewedAt);

    if (error) {
      console.error('Error checking unread messages:', error);
      return false;
    }

    return (count || 0) > 0;
  } catch (error) {
    console.error('Error in hasUnreadCoachMessages:', error);
    return false;
  }
}

// Mark coach messages as read by updating last viewed timestamp
export async function markCoachAsViewed(userId: string): Promise<void> {
  try {
    const now = new Date().toISOString();

    // Upsert the last viewed timestamp
    const { data: existing } = await supabase
      .from('coach_memory')
      .select('id')
      .eq('user_id', userId)
      .eq('key', 'coach_last_viewed_at')
      .maybeSingle();

    if (existing) {
      await supabase
        .from('coach_memory')
        .update({ value: now })
        .eq('id', existing.id);
    } else {
      await supabase
        .from('coach_memory')
        .insert({ user_id: userId, key: 'coach_last_viewed_at', value: now });
    }
  } catch (error) {
    console.error('Error marking coach as viewed:', error);
  }
}

// Dispatch event to notify components to recheck for new messages
export function notifyNewCoachMessage(): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent('coach-message-added'));
}

// Trigger the coach to generate a "next up" directive
export async function triggerCoachResponse(
  userId: string,
  triggerType: 'meal_logged' | 'workout_completed',
  context: {
    // For meals
    mealName?: string;
    calories?: number;
    protein?: number;
    carbs?: number;
    fat?: number;
    // For workouts
    workoutName?: string;
    exerciseCount?: number;
    exerciseNames?: string[];  // List of exercise names performed
    cardioNotes?: string;  // Free-text cardio description
    workoutId?: string;  // ID of the saved workout for PR lookup
    // Time context
    localTime?: string;  // e.g., "9:30 PM"
    localHour?: number;  // 0-23
    localDate?: string;  // YYYY-MM-DD for correct timezone handling
  }
): Promise<{ success: boolean; error?: string }> {
  console.log('[CoachTrigger] Starting trigger:', { userId, triggerType, context });

  // For meal triggers, batch multiple meals logged within a short window
  if (triggerType === 'meal_logged' && context.mealName) {
    // Add to pending meals
    pendingMeals.push({
      mealName: context.mealName,
      calories: context.calories || 0,
      protein: context.protein || 0,
      carbs: context.carbs || 0,
      fat: context.fat || 0,
    });
    pendingUserId = userId;
    pendingTimeContext = {
      localTime: context.localTime || new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true }),
      localHour: context.localHour ?? new Date().getHours(),
      localDate: context.localDate || new Date().toISOString().split('T')[0],
    };

    console.log('[CoachTrigger] Meal added to batch, total pending:', pendingMeals.length);

    // Clear existing timeout and set a new one
    if (pendingTriggerTimeout) {
      clearTimeout(pendingTriggerTimeout);
    }

    // Wait for more meals, then send batched trigger
    return new Promise((resolve) => {
      pendingTriggerTimeout = setTimeout(async () => {
        const mealsToSend = [...pendingMeals];
        const userIdToSend = pendingUserId;
        const timeContextToSend = pendingTimeContext;

        // Reset pending state
        pendingMeals = [];
        pendingUserId = null;
        pendingTimeContext = null;
        pendingTriggerTimeout = null;

        if (!userIdToSend || !timeContextToSend) {
          resolve({ success: false, error: 'Missing context' });
          return;
        }

        console.log('[CoachTrigger] Sending batched trigger with', mealsToSend.length, 'meals');

        try {
          const response = await apiFetch('/api/coach-trigger', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              triggerType: 'meal_logged',
              context: {
                meals: mealsToSend,
                ...timeContextToSend,
              },
            }),
          });

          if (!response.ok) {
            const data = await response.json();
            console.error('[CoachTrigger] API error:', response.status, data);
            resolve({ success: false, error: data.error || 'Failed to trigger coach' });
            return;
          }

          const result = await response.json();
          console.log('[CoachTrigger] Batched success:', result);

          notifyNewCoachMessage();
          resolve({ success: true });
        } catch (error) {
          console.error('[CoachTrigger] Network error:', error);
          resolve({ success: false, error: 'Network error' });
        }
      }, MEAL_BATCH_DELAY_MS);
    });
  }

  // For workout triggers, send immediately (no batching)
  try {
    const response = await apiFetch('/api/coach-trigger', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        triggerType,
        context,
      }),
    });

    if (!response.ok) {
      const data = await response.json();
      console.error('[CoachTrigger] API error:', response.status, data);
      return { success: false, error: data.error || 'Failed to trigger coach' };
    }

    const result = await response.json();
    console.log('[CoachTrigger] Success:', result);

    // Notify components to recheck for new messages
    notifyNewCoachMessage();
    return { success: true };
  } catch (error) {
    console.error('[CoachTrigger] Network error:', error);
    return { success: false, error: 'Network error' };
  }
}
