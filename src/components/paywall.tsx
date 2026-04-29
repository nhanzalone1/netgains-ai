"use client";

import { useEffect, useState } from "react";
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

// TEMPORARY DIAGNOSTIC — REMOVE WITH /api/debug-log AFTER FOLLOWUP #2 SUB-B IS RESOLVED.
const debugLog = (message: string) => {
  fetch("/api/debug-log", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message }),
  }).catch(() => {});
};

const FEATURES = [
  "Unlimited coach messages",
  "Personalized workouts & nutrition that adapt to you",
  "Memory that remembers your goals, gear, and progress",
  "Always running on the smartest AI model",
  "Founding member price locked at $14.99/mo for life",
];

export function Paywall({ isOpen, onClose, trigger = "manual" }: PaywallProps) {
  const { user } = useAuth();
  const { refreshSubscription } = useSubscription();
  const [betaCode, setBetaCode] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [checkoutUrl, setCheckoutUrl] = useState<string | null>(null);
  const [showDisclosure, setShowDisclosure] = useState(false);
  const [redirecting, setRedirecting] = useState(false);

  useEffect(() => {
    if (!isOpen) {
      setBetaCode("");
      setError(null);
      setCheckoutUrl(null);
    }
  }, [isOpen]);

  const handleSubscribe = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user?.id || !betaCode.trim() || submitting) return;

    setSubmitting(true);
    setError(null);

    try {
      const res = await fetch("/api/stripe/create-checkout-session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          user_id: user.id,
          beta_code: betaCode.trim().toUpperCase(),
        }),
      });

      if (res.status === 409) {
        setError("That code isn't valid or has been used. Got the right one?");
        setSubmitting(false);
        return;
      }

      if (!res.ok) {
        setError("We couldn't reach Stripe. Try again in a moment.");
        setSubmitting(false);
        return;
      }

      const { url } = await res.json();

      if (Capacitor.isNativePlatform()) {
        setCheckoutUrl(url);
        setSubmitting(false);
        setShowDisclosure(true);
      } else {
        window.location.href = url;
      }
    } catch (err) {
      console.error("[Paywall] checkout error:", err);
      setError("We couldn't reach Stripe. Try again in a moment.");
      setSubmitting(false);
    }
  };

  const handleContinueToCheckout = async () => {
    if (!checkoutUrl) return;
    setRedirecting(true);
    try {
      const { Browser } = await import("@capacitor/browser");
      const listener = await Browser.addListener("browserFinished", () => {
        debugLog("[paywall] browserFinished fired, calling refreshSubscription");
        refreshSubscription();
        listener.remove();
      });
      debugLog("[paywall] browserFinished listener registered");
      await Browser.open({ url: checkoutUrl, presentationStyle: "fullscreen" });
    } catch (err) {
      console.error("[Paywall] Failed to open browser:", err);
      window.location.href = checkoutUrl;
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

              <form onSubmit={handleSubscribe} className="space-y-3">
                <label className="block">
                  <span className="text-sm text-white/90 mb-1.5 block font-medium">
                    Founding member code
                  </span>
                  <input
                    type="text"
                    value={betaCode}
                    onChange={(e) => setBetaCode(e.target.value.toUpperCase())}
                    placeholder="FOUNDINGXX"
                    autoComplete="off"
                    autoCorrect="off"
                    autoCapitalize="characters"
                    spellCheck={false}
                    disabled={submitting}
                    className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary/50 disabled:opacity-50 font-mono text-center text-lg"
                  />
                  <span className="text-xs text-muted-foreground mt-1.5 block">
                    Founding members lock in $14.99/mo for life.
                  </span>
                </label>
                {error && (
                  <p className="text-sm text-red-400 text-center">{error}</p>
                )}
                <motion.button
                  type="submit"
                  whileTap={{ scale: submitting ? 1 : 0.98 }}
                  disabled={!betaCode.trim() || submitting}
                  className="w-full py-3.5 rounded-xl bg-gradient-to-r from-primary to-primary/90 text-white font-semibold hover:opacity-95 transition-all disabled:opacity-50"
                >
                  {submitting ? "Validating code..." : "Subscribe — $14.99/mo"}
                </motion.button>
              </form>

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
                  You&apos;re about to visit Stripe to complete your purchase. Transactions made on this site will be processed by Stripe. Apple is not responsible for the privacy or security of transactions made on this website.
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
                    onClick={handleContinueToCheckout}
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
