"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { Sparkles } from "lucide-react";
import { useAuth } from "@/components/auth-provider";
import {
  getDailyBriefCache,
  setDailyBriefCache,
  DAILY_BRIEF_INVALIDATE_EVENT,
  type DailyBriefResponse,
} from "@/lib/daily-brief-cache";

function formatLocalDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function getDebugDate(): string {
  if (typeof window === "undefined") return formatLocalDate(new Date());
  const override = localStorage.getItem("netgains-debug-date-override");
  if (override) {
    const parsed = new Date(override + "T12:00:00");
    if (!isNaN(parsed.getTime())) return override;
  }
  return formatLocalDate(new Date());
}

export function DailyBriefCard() {
  const { user } = useAuth();
  const [brief, setBrief] = useState<DailyBriefResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(false);
  const lastFetchedDateRef = useRef<string | null>(null);

  // Fetch brief from API (not from cache)
  const fetchBriefFromApi = useCallback(async () => {
    if (!user?.id) return;

    const effectiveDate = getDebugDate();

    try {
      const response = await fetch("/api/daily-brief", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ effectiveDate }),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const data: DailyBriefResponse = await response.json();
      setBrief(data);
      setDailyBriefCache(user.id, data);
      lastFetchedDateRef.current = effectiveDate;
    } catch (err) {
      console.error("Failed to fetch daily brief:", err);
      setError(true);
    }

    setIsLoading(false);
  }, [user?.id]);

  // Check cache or fetch - used on mount and visibility changes
  const checkAndFetch = useCallback(() => {
    if (!user?.id) return;

    const effectiveDate = getDebugDate();
    setError(false);

    // Check cache first (synchronous, avoids flicker)
    const cached = getDailyBriefCache(user.id);
    if (cached) {
      setBrief(cached);
      setIsLoading(false);
      lastFetchedDateRef.current = effectiveDate;
      return;
    }

    // No cache, need to fetch
    setIsLoading(true);
    fetchBriefFromApi();
  }, [user?.id, fetchBriefFromApi]);

  // Initial fetch on mount
  useEffect(() => {
    checkAndFetch();
  }, [checkAndFetch]);

  // Listen for cache invalidation
  useEffect(() => {
    const handleInvalidate = () => {
      setIsLoading(true);
      fetchBriefFromApi();
    };

    window.addEventListener(DAILY_BRIEF_INVALIDATE_EVENT, handleInvalidate);
    return () => {
      window.removeEventListener(DAILY_BRIEF_INVALIDATE_EVENT, handleInvalidate);
    };
  }, [fetchBriefFromApi]);

  // Re-check when page becomes visible (catches date changes, workout logs, cross-tab invalidation)
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        // Always re-check cache on visibility change
        // The cache utility handles invalidation timestamp checks
        checkAndFetch();
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [checkAndFetch]);

  // Loading skeleton
  if (isLoading) {
    return (
      <div
        className="mx-4 mt-4 rounded-2xl p-4"
        style={{ background: "#1a1a24", border: "1px solid rgba(255, 255, 255, 0.05)" }}
      >
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-white/5 animate-pulse" />
          <div className="flex-1 space-y-2">
            <div className="h-4 w-24 bg-white/5 rounded animate-pulse" />
            <div className="h-3 w-48 bg-white/5 rounded animate-pulse" />
            <div className="h-3 w-32 bg-white/5 rounded animate-pulse" />
          </div>
        </div>
      </div>
    );
  }

  // Error state - hide the card
  if (error) {
    return null;
  }

  // Not onboarded state
  if (brief?.status === "not_onboarded") {
    return (
      <div
        className="mx-4 mt-4 rounded-2xl p-4"
        style={{
          background: "rgba(255, 71, 87, 0.1)",
          border: "1px solid rgba(255, 71, 87, 0.2)",
        }}
      >
        <div className="flex items-center gap-3">
          <div
            className="w-8 h-8 rounded-full flex items-center justify-center"
            style={{ background: "rgba(255, 71, 87, 0.2)" }}
          >
            <Sparkles className="w-4 h-4 text-primary" />
          </div>
          <div>
            <p className="text-sm font-semibold text-white">Welcome to NetGains</p>
            <p className="text-xs text-muted-foreground">Chat below to meet your AI coach</p>
          </div>
        </div>
      </div>
    );
  }

  // Generated brief state
  if (brief?.status === "generated" && brief.brief) {
    return (
      <div
        className="mx-4 mt-4 rounded-2xl p-4"
        style={{
          background: "#1a1a24",
          border: "1px solid rgba(255, 255, 255, 0.05)",
        }}
      >
        {/* Focus line */}
        <p className="text-sm font-bold text-primary">
          {brief.brief.focus}
        </p>
        {/* Target line */}
        <p className="text-sm text-white mt-1">
          {brief.brief.target}
        </p>
        {/* Nutrition line */}
        <p className="text-xs text-muted-foreground mt-1">
          {brief.brief.nutrition}
        </p>
      </div>
    );
  }

  return null;
}
