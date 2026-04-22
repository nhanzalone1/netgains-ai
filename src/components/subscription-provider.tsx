"use client";

import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from "react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "./auth-provider";
import { SUBSCRIPTION_TIERS, DAILY_MESSAGE_LIMITS, SubscriptionTier } from "@/lib/constants";

interface SubscriptionContextType {
  tier: SubscriptionTier;
  isLoading: boolean;
  dailyLimit: number;
  messagesUsed: number;
  messagesRemaining: number;
  expiresAt: Date | null;
  isPremium: boolean;
  isBasic: boolean;
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
  const [expiresAt, setExpiresAt] = useState<Date | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [messagesUsed, setMessagesUsed] = useState(0);
  const [showPaywall, setShowPaywall] = useState(false);
  const supabase = createClient();

  const refreshSubscription = useCallback(async () => {
    if (!user?.id) {
      setTier(SUBSCRIPTION_TIERS.FREE);
      setExpiresAt(null);
      setIsLoading(false);
      return;
    }

    try {
      const { data: subscription } = await supabase
        .from("subscriptions")
        .select("tier, expires_at")
        .eq("user_id", user.id)
        .maybeSingle();

      if (subscription?.tier && subscription.tier !== SUBSCRIPTION_TIERS.FREE) {
        const expires = subscription.expires_at ? new Date(subscription.expires_at) : null;
        const isExpired = expires && expires < new Date();

        if (!isExpired) {
          setTier(subscription.tier as SubscriptionTier);
          setExpiresAt(expires);
        } else {
          setTier(SUBSCRIPTION_TIERS.FREE);
          setExpiresAt(null);
        }
      } else {
        setTier(SUBSCRIPTION_TIERS.FREE);
        setExpiresAt(null);
      }
    } catch (error) {
      console.error("Failed to fetch subscription:", error);
      setTier(SUBSCRIPTION_TIERS.FREE);
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

  // Refresh message count periodically
  useEffect(() => {
    const interval = setInterval(refreshMessageCount, 30000);
    return () => clearInterval(interval);
  }, [refreshMessageCount]);

  const dailyLimit = DAILY_MESSAGE_LIMITS[tier];
  const messagesRemaining = Math.max(0, dailyLimit - messagesUsed);

  const value: SubscriptionContextType = {
    tier,
    isLoading,
    dailyLimit,
    messagesUsed,
    messagesRemaining,
    expiresAt,
    isPremium: tier === SUBSCRIPTION_TIERS.PREMIUM,
    isBasic: tier === SUBSCRIPTION_TIERS.BASIC,
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
