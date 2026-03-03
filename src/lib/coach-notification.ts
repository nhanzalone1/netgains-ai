// Coach notification system for auto-triggered messages
// When meals/workouts are logged, we trigger a coach response
// and show a badge on the Coach tab until they view it

const PENDING_KEY_PREFIX = 'netgains-pending-coach-message-';

export function setPendingCoachMessage(userId: string): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(`${PENDING_KEY_PREFIX}${userId}`, Date.now().toString());
  // Dispatch event so other tabs/components can react
  window.dispatchEvent(new CustomEvent('coach-message-pending', { detail: { userId } }));
}

export function hasPendingCoachMessage(userId: string): boolean {
  if (typeof window === 'undefined') return false;
  return localStorage.getItem(`${PENDING_KEY_PREFIX}${userId}`) !== null;
}

export function clearPendingCoachMessage(userId: string): void {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(`${PENDING_KEY_PREFIX}${userId}`);
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

    // Set pending flag so badge shows
    setPendingCoachMessage(userId);
    return { success: true };
  } catch (error) {
    console.error('Coach trigger error:', error);
    return { success: false, error: 'Network error' };
  }
}
