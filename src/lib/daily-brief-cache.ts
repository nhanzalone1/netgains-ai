// Daily Brief cache utilities

// Must match the version in /api/daily-brief/route.ts
const EXPECTED_VERSION = 6;

export interface NutritionData {
  consumed: { calories: number; protein: number; carbs: number; fat: number };
  goals: { calories: number; protein: number; carbs: number; fat: number };
  display: string;
}

export interface PR {
  exercise: string;
  weight: number;
  reps: number;
}

export interface DailyBrief {
  mode: 'pre_workout' | 'post_workout' | 'rest_day';
  focus: string;
  target?: string;           // Pre-workout: "Beat: Squat 225x5"
  achievement?: string;      // Post-workout: "Squat 225x5"
  prs?: PR[];
  motivationalLine?: string; // Post-workout: "That PR is going to pay off."
  nutrition: NutritionData;
}

export interface DailyBriefResponse {
  status: "not_onboarded" | "generated";
  version?: number;
  brief?: DailyBrief;
  generatedAt: string;
}

interface DailyBriefCache {
  userId: string;
  date: string; // YYYY-MM-DD
  version: number;
  cachedAt: number; // timestamp when cached
  data: DailyBriefResponse;
}

export const DAILY_BRIEF_INVALIDATE_EVENT = "netgains-daily-brief-invalidate";

function getCacheKey(userId: string): string {
  return `netgains-daily-brief-${userId}`;
}

function getInvalidationKey(userId: string): string {
  return `netgains-daily-brief-invalidated-${userId}`;
}

function getLastInvalidationTime(userId: string): number {
  if (typeof window === "undefined") return 0;
  const stored = localStorage.getItem(getInvalidationKey(userId));
  return stored ? parseInt(stored, 10) : 0;
}

function getDebugDate(): Date {
  if (typeof window === "undefined") return new Date();
  const override = localStorage.getItem("netgains-debug-date-override");
  if (override) {
    const parsed = new Date(override + "T12:00:00");
    if (!isNaN(parsed.getTime())) return parsed;
  }
  return new Date();
}

function getTodayString(): string {
  const date = getDebugDate();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function getDailyBriefCache(userId: string): DailyBriefResponse | null {
  if (typeof window === "undefined") return null;

  try {
    const stored = localStorage.getItem(getCacheKey(userId));
    if (!stored) return null;

    const cache: DailyBriefCache = JSON.parse(stored);

    // Check if cache is for today
    if (cache.date !== getTodayString()) {
      return null; // Stale cache
    }

    // Check if userId matches
    if (cache.userId !== userId) {
      return null;
    }

    // Check if version matches (invalidate cache if code changed)
    if (cache.version !== EXPECTED_VERSION) {
      return null;
    }

    // Check if cache was created before last invalidation (cross-tab support)
    const lastInvalidation = getLastInvalidationTime(userId);
    if (cache.cachedAt && cache.cachedAt < lastInvalidation) {
      return null;
    }

    return cache.data;
  } catch {
    return null;
  }
}

export function setDailyBriefCache(userId: string, data: DailyBriefResponse): void {
  if (typeof window === "undefined") return;

  const cache: DailyBriefCache = {
    userId,
    date: getTodayString(),
    version: EXPECTED_VERSION,
    cachedAt: Date.now(),
    data,
  };

  localStorage.setItem(getCacheKey(userId), JSON.stringify(cache));
}

export function invalidateDailyBriefCache(userId: string): void {
  if (typeof window === "undefined") return;

  localStorage.removeItem(getCacheKey(userId));

  // Set invalidation timestamp for cross-tab cache busting
  // Other tabs will see this and know their cache is stale
  localStorage.setItem(getInvalidationKey(userId), Date.now().toString());

  // Dispatch event so other components can react (same-tab)
  window.dispatchEvent(new CustomEvent(DAILY_BRIEF_INVALIDATE_EVENT, {
    detail: { userId }
  }));
}
