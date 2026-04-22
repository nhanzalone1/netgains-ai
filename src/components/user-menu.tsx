"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { User, LogOut, Settings, FileText, Crown, Zap, MessageCircle, UserX } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "./auth-provider";
import { useSubscription } from "./subscription-provider";
import { IconButton } from "./ui/icon-button";
import { Paywall } from "./paywall";
import { DeleteAccountModal } from "./delete-account-modal";
import { apiFetch } from "@/lib/capacitor";
import { SUBSCRIPTION_TIERS } from "@/lib/constants";

export function UserMenu() {
  const { user } = useAuth();
  const { tier, messagesRemaining, dailyLimit, isFree, expiresAt, showPaywall, setShowPaywall } = useSubscription();
  const [open, setOpen] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const router = useRouter();
  const supabase = createClient();

  const handleSignOut = async () => {
    // Clear all user-specific localStorage data to prevent data leakage on shared devices
    const keysToRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && (
        key.startsWith('netgains-') ||
        key.startsWith('coach-') ||
        key.includes(user?.id || '')
      )) {
        keysToRemove.push(key);
      }
    }
    keysToRemove.forEach(key => localStorage.removeItem(key));

    await supabase.auth.signOut();
    router.push("/auth/login");
    router.refresh();
  };

  const handleDeleteAccount = async () => {
    const response = await apiFetch("/api/account/delete", { method: "POST" });

    if (!response.ok) {
      const data = await response.json();
      throw new Error(data.error || "Failed to delete account");
    }

    // Clear all localStorage data
    const keysToRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && (
        key.startsWith('netgains-') ||
        key.startsWith('coach-') ||
        key.includes(user?.id || '')
      )) {
        keysToRemove.push(key);
      }
    }
    keysToRemove.forEach(key => localStorage.removeItem(key));

    // Redirect to login
    router.push("/auth/login");
    router.refresh();
  };

  if (!user) return null;

  return (
    <div className="relative">
      <IconButton onClick={() => setOpen(!open)}>
        <User className="w-5 h-5" />
      </IconButton>

      <AnimatePresence>
        {open && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-10"
              onClick={() => setOpen(false)}
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: -10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: -10 }}
              transition={{ duration: 0.15 }}
              className="absolute right-0 top-14 z-20 min-w-[220px] overflow-hidden rounded-2xl"
              style={{
                background: "rgba(26, 26, 36, 0.95)",
                backdropFilter: "blur(24px)",
                WebkitBackdropFilter: "blur(24px)",
                border: "1px solid rgba(255, 255, 255, 0.05)",
                boxShadow: "0 8px 32px rgba(0, 0, 0, 0.4)",
              }}
            >
              <div className="p-3 border-b border-white/5">
                <p className="text-xs text-muted-foreground truncate uppercase tracking-wide">
                  {user.email}
                </p>
              </div>

              {/* Subscription Status */}
              <div className="p-3 border-b border-white/5">
                <div className="flex items-center gap-3">
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                    tier === SUBSCRIPTION_TIERS.PREMIUM
                      ? "bg-gradient-to-br from-amber-500/20 to-amber-600/10"
                      : tier === SUBSCRIPTION_TIERS.BASIC
                      ? "bg-primary/20"
                      : "bg-white/10"
                  }`}>
                    {tier === SUBSCRIPTION_TIERS.PREMIUM ? (
                      <Crown className="w-5 h-5 text-amber-500" />
                    ) : tier === SUBSCRIPTION_TIERS.BASIC ? (
                      <Zap className="w-5 h-5 text-primary" />
                    ) : (
                      <MessageCircle className="w-5 h-5 text-muted-foreground" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-white capitalize">
                      {tier} Plan
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {messagesRemaining}/{dailyLimit} messages today
                    </p>
                  </div>
                  {isFree && (
                    <motion.button
                      whileTap={{ scale: 0.95 }}
                      onClick={() => {
                        setOpen(false);
                        setShowPaywall(true);
                      }}
                      className="px-3 py-1.5 rounded-lg bg-primary text-white text-xs font-semibold hover:bg-primary/90 transition-colors"
                    >
                      Upgrade
                    </motion.button>
                  )}
                </div>
              </div>

              {/* Settings */}
              <div className="border-b border-white/5">
                <motion.button
                  whileTap={{ scale: 0.98 }}
                  onClick={() => {
                    setOpen(false);
                    router.push("/settings");
                  }}
                  className="w-full flex items-center gap-3 p-3 text-left hover:bg-white/5 transition-colors min-h-[44px]"
                >
                  <Settings className="w-4 h-4 text-primary" />
                  <span className="font-medium">Settings</span>
                </motion.button>
              </div>

              {/* Terms & Privacy */}
              <div className="border-b border-white/5">
                <motion.button
                  whileTap={{ scale: 0.98 }}
                  onClick={() => {
                    setOpen(false);
                    router.push("/terms");
                  }}
                  className="w-full flex items-center gap-3 p-3 text-left hover:bg-white/5 transition-colors min-h-[44px]"
                >
                  <FileText className="w-4 h-4 text-primary" />
                  <span className="font-medium">Terms & Privacy</span>
                </motion.button>
              </div>

              <motion.button
                whileTap={{ scale: 0.98 }}
                onClick={handleSignOut}
                className="w-full flex items-center gap-3 p-3 text-left hover:bg-white/5 transition-colors min-h-[44px] border-b border-white/5"
              >
                <LogOut className="w-4 h-4 text-primary" />
                <span className="font-medium">Sign Out</span>
              </motion.button>

              {/* Delete Account */}
              <motion.button
                whileTap={{ scale: 0.98 }}
                onClick={() => {
                  setOpen(false);
                  setShowDeleteModal(true);
                }}
                className="w-full flex items-center gap-3 p-3 text-left hover:bg-red-500/10 transition-colors min-h-[44px]"
              >
                <UserX className="w-4 h-4 text-red-500" />
                <span className="font-medium text-red-500">Delete Account</span>
              </motion.button>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Subscription Paywall */}
      <Paywall
        isOpen={showPaywall}
        onClose={() => setShowPaywall(false)}
        trigger="manual"
      />

      {/* Delete Account Modal */}
      <DeleteAccountModal
        open={showDeleteModal}
        onClose={() => setShowDeleteModal(false)}
        onConfirm={handleDeleteAccount}
        subscriptionTier={tier}
        subscriptionExpiresAt={expiresAt}
      />
    </div>
  );
}
