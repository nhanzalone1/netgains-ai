"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Check, Crown } from "lucide-react";
import { Capacitor } from "@capacitor/core";
import { useSubscription } from "./subscription-provider";
import { useAuth } from "./auth-provider";

interface PaywallProps {
  isOpen: boolean;
  onClose: () => void;
  trigger?: "limit" | "feature" | "manual";
}

const FEATURES = [
  "Unlimited coach messages",
  "Personalized workouts & nutrition that adapt to you",
  "Memory that remembers your goals, gear, and progress",
  "Always running on the smartest AI model",
  "Founding member price locked at $14.99/mo for life",
];

export function Paywall({ isOpen, onClose, trigger = "manual" }: PaywallProps) {
  const { user } = useAuth();
  const [showDisclosure, setShowDisclosure] = useState(false);
  const [redirecting, setRedirecting] = useState(false);

  const upgradeUrl = user?.id
    ? `https://netgainsai.com/upgrade?user_id=${user.id}`
    : `https://netgainsai.com/upgrade`;

  const handleSubscribeClick = () => {
    if (Capacitor.isNativePlatform()) {
      setShowDisclosure(true);
    } else {
      setRedirecting(true);
      window.location.href = upgradeUrl;
    }
  };

  const handleContinueToWeb = async () => {
    setRedirecting(true);
    try {
      const { Browser } = await import("@capacitor/browser");
      await Browser.open({ url: upgradeUrl, presentationStyle: "fullscreen" });
    } catch (err) {
      console.error("[Paywall] Failed to open browser:", err);
      window.location.href = upgradeUrl;
    }
    setShowDisclosure(false);
    setRedirecting(false);
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50"
            onClick={onClose}
          />

          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            transition={{ type: "spring", damping: 25, stiffness: 300 }}
            className="fixed inset-4 md:inset-auto md:left-1/2 md:top-1/2 md:-translate-x-1/2 md:-translate-y-1/2 md:max-w-md md:w-full z-50 overflow-hidden rounded-3xl"
            style={{
              background: "linear-gradient(180deg, rgba(30, 30, 40, 0.98) 0%, rgba(20, 20, 28, 0.98) 100%)",
              border: "1px solid rgba(255, 255, 255, 0.08)",
              boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.5)",
              maxHeight: "90vh",
            }}
          >
            <div className="relative p-6 pb-4 border-b border-white/5">
              <button
                onClick={onClose}
                className="absolute right-4 top-4 w-10 h-10 rounded-full bg-white/5 flex items-center justify-center hover:bg-white/10 transition-colors"
              >
                <X className="w-5 h-5 text-muted-foreground" />
              </button>

              <div className="flex items-center gap-3 mb-2">
                <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-amber-500/20 to-amber-600/5 flex items-center justify-center">
                  <Crown className="w-5 h-5 text-amber-500" />
                </div>
                <div>
                  <h2 className="text-xl font-bold text-white">Unlock Your Coach</h2>
                  <p className="text-sm text-muted-foreground">
                    {trigger === "limit"
                      ? "You've hit your daily limit"
                      : "Founding member pricing — limited spots"}
                  </p>
                </div>
              </div>
            </div>

            <div className="p-6 space-y-5">
              <div className="text-center">
                <div className="flex items-baseline justify-center gap-2 mb-1">
                  <span className="text-4xl font-bold text-white">$14.99</span>
                  <span className="text-muted-foreground">/month</span>
                </div>
                <p className="text-xs text-muted-foreground">
                  Founding member pricing locked in for life
                </p>
              </div>

              <ul className="space-y-2.5">
                {FEATURES.map((feature) => (
                  <li key={feature} className="flex items-start gap-3 text-sm text-white/90">
                    <Check className="w-4 h-4 text-primary shrink-0 mt-0.5" />
                    <span>{feature}</span>
                  </li>
                ))}
              </ul>

              <motion.button
                whileTap={{ scale: 0.98 }}
                onClick={handleSubscribeClick}
                disabled={redirecting}
                className="w-full py-3.5 rounded-xl bg-gradient-to-r from-primary to-primary/90 text-white font-semibold hover:opacity-95 transition-all disabled:opacity-50"
              >
                {redirecting ? "Opening checkout..." : "Subscribe — $14.99/mo"}
              </motion.button>

              <p className="text-center text-xs text-muted-foreground">
                Cancel anytime via your account settings.
              </p>
            </div>
          </motion.div>

          {/* Apple-required disclosure (native only) */}
          {showDisclosure && (
            <>
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="fixed inset-0 bg-black/85 backdrop-blur-sm z-[60]"
              />
              <motion.div
                initial={{ opacity: 0, scale: 0.96 }}
                animate={{ opacity: 1, scale: 1 }}
                className="fixed inset-x-4 top-1/2 -translate-y-1/2 z-[60] mx-auto max-w-sm rounded-2xl p-6"
                style={{
                  background: "rgba(30, 30, 40, 0.98)",
                  border: "1px solid rgba(255, 255, 255, 0.1)",
                }}
              >
                <h3 className="text-lg font-semibold text-white mb-3">
                  You&apos;re about to leave the app
                </h3>
                <p className="text-sm text-white/80 leading-relaxed mb-6">
                  You&apos;re about to visit netgainsai.com to complete your purchase. Transactions made on this site will be processed by Stripe. Apple is not responsible for the privacy or security of transactions made on this website.
                </p>
                <div className="flex gap-3">
                  <button
                    onClick={() => setShowDisclosure(false)}
                    disabled={redirecting}
                    className="flex-1 py-3 rounded-xl bg-white/10 text-white font-medium hover:bg-white/15 transition-colors disabled:opacity-50"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleContinueToWeb}
                    disabled={redirecting}
                    className="flex-1 py-3 rounded-xl bg-primary text-white font-semibold hover:bg-primary/90 transition-colors disabled:opacity-50"
                  >
                    {redirecting ? "Opening..." : "Continue"}
                  </button>
                </div>
              </motion.div>
            </>
          )}
        </>
      )}
    </AnimatePresence>
  );
}

export function UpgradeBanner({ onUpgrade }: { onUpgrade: () => void }) {
  const { isFree, messagesRemaining } = useSubscription();

  if (!isFree) return null;
  if (messagesRemaining > 1) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="mx-4 mb-4 p-3 rounded-2xl bg-gradient-to-r from-primary/20 to-primary/5 border border-primary/20"
    >
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-primary/20 flex items-center justify-center shrink-0">
          <Crown className="w-5 h-5 text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-white">
            {messagesRemaining === 0
              ? "You're out of messages today"
              : `${messagesRemaining} message left today`}
          </p>
          <p className="text-xs text-muted-foreground">
            Unlimited coaching for $14.99/mo
          </p>
        </div>
        <button
          onClick={onUpgrade}
          className="px-4 py-2 rounded-xl bg-primary text-white text-sm font-semibold hover:bg-primary/90 transition-colors shrink-0"
        >
          Upgrade
        </button>
      </div>
    </motion.div>
  );
}
