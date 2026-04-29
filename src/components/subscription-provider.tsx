"use client";

import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from "react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "./auth-provider";
import { SUBSCRIPTION_TIERS, DAILY_MESSAGE_LIMITS, SubscriptionTier } from "@/lib/constants";

const PREMIUM_STATUSES = new Set(["active", "trialing"]);

interface SubscriptionContextType {
  tier: SubscriptionTier;
  subscriptionStatus: string | null;
  isLoading: boolean;
  dailyLimit: number;
  messagesUsed: number;
  messagesRemaining: number;
  isPremium: boolean;
  isFree: boolean;
  refreshSubscription: () => Promise<void>;
  refreshMessageCount: () => Promise<void>;
  showPaywall: boolean;
  setShowPaywall: (show: boolean) => void;
}

const SubscriptionContext = createContext<SubscriptionContextType | undefined>(undefined);

export function SubscriptionProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [tier, setTier] = useState<SubscriptionTier>(SUBSCRIPTION_TIERS.FREE);
  const [subscriptionStatus, setSubscriptionStatus] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [messagesUsed, setMessagesUsed] = useState(0);
  const [showPaywall, setShowPaywall] = useState(false);
  const supabase = createClient();

  const refreshSubscription = useCallback(async () => {
    if (!user?.id) {
      setTier(SUBSCRIPTION_TIERS.FREE);
      setSubscriptionStatus(null);
      setIsLoading(false);
      return;
    }

    try {
      const { data: profile } = await supabase
        .from("profiles")
        .select("subscription_status")
        .eq("id", user.id)
        .maybeSingle();

      const status = profile?.subscription_status ?? null;
      setSubscriptionStatus(status);
      setTier(status && PREMIUM_STATUSES.has(status) ? SUBSCRIPTION_TIERS.PREMIUM : SUBSCRIPTION_TIERS.FREE);
    } catch (error) {
      console.error("Failed to fetch subscription:", error);
      setTier(SUBSCRIPTION_TIERS.FREE);
      setSubscriptionStatus(null);
    }

    setIsLoading(false);
  }, [user?.id, supabase]);

  const refreshMessageCount = useCallback(async () => {
    if (!user?.id) {
      setMessagesUsed(0);
      return;
    }

    try {
      const today = new Date().toISOString().split("T")[0];
      const countKey = `message_count_${today}`;

      const { data } = await supabase
        .from("coach_memory")
        .select("value")
        .eq("user_id", user.id)
        .eq("key", countKey)
        .maybeSingle();

      setMessagesUsed(data ? parseInt(data.value) : 0);
    } catch (error) {
      console.error("Failed to fetch message count:", error);
    }
  }, [user?.id, supabase]);

  useEffect(() => {
    refreshSubscription();
    refreshMessageCount();
  }, [refreshSubscription, refreshMessageCount]);

  useEffect(() => {
    const interval = setInterval(refreshMessageCount, 30000);
    return () => clearInterval(interval);
  }, [refreshMessageCount]);

  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        refreshSubscription();
      }
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => document.removeEventListener("visibilitychange", handleVisibilityChange);
  }, [refreshSubscription]);

  useEffect(() => {
    const handleFocus = () => {
      if (document.visibilityState === "visible") {
        refreshSubscription();
      }
    };
    window.addEventListener("focus", handleFocus);
    return () => window.removeEventListener("focus", handleFocus);
  }, [refreshSubscription]);

  const dailyLimit = DAILY_MESSAGE_LIMITS[tier];
  const messagesRemaining = Math.max(0, dailyLimit - messagesUsed);

  const value: SubscriptionContextType = {
    tier,
    subscriptionStatus,
    isLoading,
    dailyLimit,
    messagesUsed,
    messagesRemaining,
    isPremium: tier === SUBSCRIPTION_TIERS.PREMIUM,
    isFree: tier === SUBSCRIPTION_TIERS.FREE,
    refreshSubscription,
    refreshMessageCount,
    showPaywall,
    setShowPaywall,
  };

  return (
    <SubscriptionContext.Provider value={value}>
      {children}
    </SubscriptionContext.Provider>
  );
}

export function useSubscription() {
  const context = useContext(SubscriptionContext);
  if (context === undefined) {
    throw new Error("useSubscription must be used within a SubscriptionProvider");
  }
  return context;
}
