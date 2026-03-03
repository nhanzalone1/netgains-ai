// Coach notification system for auto-triggered messages
// Uses database to track last viewed time and check for new messages

import { createClient } from '@/lib/supabase/client';

const supabase = createClient();

// Check if there are unread coach messages (assistant messages newer than last viewed)
export async function hasUnreadCoachMessages(userId: string): Promise<boolean> {
  try {
    // Get last viewed timestamp from coach_memory
    const { data: lastViewedData } = await supabase
      .from('coach_memory')
      .select('value')
      .eq('user_id', userId)
      .eq('key', 'coach_last_viewed_at')
      .single();

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
      .single();

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
  }
): Promise<{ success: boolean; error?: string }> {
  try {
    const response = await fetch('/api/coach-trigger', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        triggerType,
        context,
      }),
    });

    if (!response.ok) {
      const data = await response.json();
      return { success: false, error: data.error || 'Failed to trigger coach' };
    }

    // Notify components to recheck for new messages
    notifyNewCoachMessage();
    return { success: true };
  } catch (error) {
    console.error('Coach trigger error:', error);
    return { success: false, error: 'Network error' };
  }
}
