// Daily Brief cache utilities

export interface DailyBrief {
  focus: string;
  target: string;
  nutrition: string;
}

export interface DailyBriefResponse {
  status: "not_onboarded" | "generated";
  brief?: DailyBrief;
  generatedAt: string;
}

interface DailyBriefCache {
  userId: string;
  date: string; // YYYY-MM-DD
  data: DailyBriefResponse;
}

export const DAILY_BRIEF_INVALIDATE_EVENT = "netgains-daily-brief-invalidate";

function getCacheKey(userId: string): string {
  return `netgains-daily-brief-${userId}`;
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
    data,
  };

  localStorage.setItem(getCacheKey(userId), JSON.stringify(cache));
}

export function invalidateDailyBriefCache(userId: string): void {
  if (typeof window === "undefined") return;

  localStorage.removeItem(getCacheKey(userId));

  // Dispatch event so other components can react
  window.dispatchEvent(new CustomEvent(DAILY_BRIEF_INVALIDATE_EVENT, {
    detail: { userId }
  }));
}
