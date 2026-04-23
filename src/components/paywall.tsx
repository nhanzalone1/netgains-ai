"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Check, Zap, Crown, MessageCircle, Sparkles, RotateCcw } from "lucide-react";
import { Capacitor } from "@capacitor/core";
import { useSubscription } from "./subscription-provider";
import { useToast } from "./toast";
import { SUBSCRIPTION_TIERS, PRODUCT_IDS } from "@/lib/constants";
import { purchaseProduct, restorePurchases, isStoreKitAvailable, getProducts } from "@/lib/storekit";
import { isNativePlatform, apiFetch } from "@/lib/capacitor";

// Map tier IDs to product IDs
const TIER_TO_PRODUCT: Record<string, string> = {
  [SUBSCRIPTION_TIERS.BASIC]: PRODUCT_IDS.BASIC_MONTHLY,
  [SUBSCRIPTION_TIERS.PREMIUM]: PRODUCT_IDS.PREMIUM_MONTHLY,
};

interface PaywallProps {
  isOpen: boolean;
  onClose: () => void;
  trigger?: "limit" | "feature" | "manual";
}

const tiers = [
  {
    id: SUBSCRIPTION_TIERS.FREE,
    name: "Free",
    price: "$0",
    period: "",
    messages: "3",
    features: [
      "3 coach messages per day",
      "Basic workout logging",
      "Nutrition tracking",
    ],
    cta: "Current Plan",
    disabled: true,
    icon: MessageCircle,
  },
  {
    id: SUBSCRIPTION_TIERS.BASIC,
    name: "Basic",
    price: "$6.99",
    period: "/month",
    messages: "15",
    features: [
      "15 coach messages per day",
      "Full workout logging",
      "Nutrition tracking & planning",
      "Progress insights",
    ],
    cta: "Upgrade to Basic",
    popular: true,
    icon: Zap,
  },
  {
    id: SUBSCRIPTION_TIERS.PREMIUM,
    name: "Premium",
    price: "$14.99",
    period: "/month",
    messages: "50",
    features: [
      "50 coach messages per day",
      "Priority AI responses",
      "Advanced workout programming",
      "Detailed nutrition analysis",
      "Full coaching experience",
    ],
    cta: "Go Premium",
    icon: Crown,
  },
];

export function Paywall({ isOpen, onClose, trigger = "manual" }: PaywallProps) {
  const { tier: currentTier, refreshSubscription } = useSubscription();
  const toast = useToast();
  const [purchasing, setPurchasing] = useState<string | null>(null);
  const [restoring, setRestoring] = useState(false);
  const [purchaseError, setPurchaseError] = useState<string | null>(null);
  // DEBUG: on-screen diagnostics for purchase failures. Temporary.
  const [debugLines, setDebugLines] = useState<string[]>([]);

  const handlePurchase = async (tierId: string) => {
    if (tierId === SUBSCRIPTION_TIERS.FREE || tierId === currentTier) return;

    // DEBUG — reset and start collecting diagnostics for this attempt.
    const debug: string[] = [];
    const log = (line: string) => {
      debug.push(line);
      setDebugLines([...debug]);
    };
    const stringify = (v: unknown) => {
      try {
        return JSON.stringify(v, null, 2);
      } catch {
        return String(v);
      }
    };

    log(`tapped tier: ${tierId}`);

    // Check if on native platform
    if (!isNativePlatform()) {
      log("isNativePlatform(): false — skipping");
      toast.info("Subscriptions are available in the iOS app");
      return;
    }

    const productId = TIER_TO_PRODUCT[tierId];
    if (!productId) {
      log(`no productId for tier: ${tierId}`);
      toast.error("Invalid subscription tier");
      return;
    }
    log(`productId: ${productId}`);

    // DEBUG — platform + plugin diagnostics
    try {
      log(`Capacitor.getPlatform(): ${Capacitor.getPlatform()}`);
      log(`Capacitor.isNativePlatform(): ${Capacitor.isNativePlatform()}`);
      log(`Capacitor.isPluginAvailable("StoreKit2"): ${Capacitor.isPluginAvailable("StoreKit2")}`);
      log(`isStoreKitAvailable(): ${isStoreKitAvailable()}`);
    } catch (e) {
      log(`diagnostic error: ${e instanceof Error ? e.message : String(e)}`);
    }

    // DEBUG — can we load the product from StoreKit at all?
    try {
      const products = await getProducts([productId]);
      log(`getProducts returned ${products.length} product(s)`);
      log(`ids: ${products.map((p) => p.id).join(", ") || "(none)"}`);
      if (products.length > 0) {
        log(`product[0]: ${stringify(products[0])}`);
      }
    } catch (e) {
      const err = e as { message?: string; name?: string; stack?: string };
      log(`getProducts THREW: ${err.name ?? "Error"}: ${err.message ?? String(e)}`);
      if (err.stack) log(`stack: ${err.stack}`);
    }

    setPurchasing(tierId);
    setPurchaseError(null);

    try {
      log("calling purchaseProduct…");
      const result = await purchaseProduct(productId);
      log(`purchaseProduct result: ${stringify({
        success: result.success,
        userCancelled: result.userCancelled,
        pending: result.pending,
        hasTransaction: !!result.transaction,
        transactionId: result.transaction?.transactionId,
        errorName: result.errorName,
        errorCode: result.errorCode,
        rawError: result.rawError,
        mappedError: result.error,
      })}`);

      if (result.success && result.transaction) {
        // Verify the transaction server-side before trusting it.
        log("calling /api/iap/verify…");
        const verifyRes = await apiFetch("/api/iap/verify", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ transactionId: result.transaction.transactionId }),
        });
        log(`verify status: ${verifyRes.status}`);

        if (!verifyRes.ok) {
          const errBody = await verifyRes.json().catch(() => ({}));
          log(`verify body: ${stringify(errBody)}`);
          const errorMsg = errBody.error || "Purchase could not be verified. Please contact support.";
          setPurchaseError(errorMsg);
          toast.error(errorMsg);
          return;
        }

        toast.success("Purchase successful! Activating your subscription...");
        await refreshSubscription();
        onClose();
      } else if (result.userCancelled) {
        console.log("[Paywall] User cancelled purchase");
      } else if (result.pending) {
        toast.info("Purchase is pending approval. You'll get access once it's confirmed.");
      } else {
        const errorMsg = result.rawError || result.error || "Something went wrong. Please try again.";
        setPurchaseError(errorMsg);
        toast.error(result.error || errorMsg);
      }
    } catch (error) {
      const err = error as { message?: string; name?: string; stack?: string };
      console.error("[Paywall] Purchase error:", error);
      log(`UNCAUGHT: ${err.name ?? "Error"}: ${err.message ?? String(error)}`);
      if (err.stack) log(`stack: ${err.stack}`);
      const errorMsg = err.message || String(error);
      setPurchaseError(errorMsg);
      toast.error(errorMsg);
    } finally {
      setPurchasing(null);
    }
  };

  const handleRestore = async () => {
    if (!isNativePlatform()) {
      toast.info("Restore is available in the iOS app");
      return;
    }

    setRestoring(true);

    try {
      const result = await restorePurchases();

      if (!result.success) {
        toast.error(result.error || "Failed to restore purchases.");
        return;
      }

      const active = result.entitlements.filter(
        (e) => !e.revocationDate && (!e.expirationDate || e.expirationDate > Date.now())
      );

      if (active.length === 0) {
        toast.info("No active subscriptions found to restore.");
        return;
      }

      // Verify each active entitlement server-side.
      let restored = 0;
      for (const entitlement of active) {
        const verifyRes = await apiFetch("/api/iap/verify", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ transactionId: entitlement.transactionId }),
        });
        if (verifyRes.ok) restored++;
      }

      if (restored > 0) {
        toast.success("Purchases restored successfully!");
        await refreshSubscription();
        onClose();
      } else {
        toast.error("Couldn't verify restored purchases. Please contact support.");
      }
    } catch (error) {
      console.error("[Paywall] Restore error:", error);
      toast.error("Something went wrong. Please try again.");
    } finally {
      setRestoring(false);
    }
  };

  const getCtaText = (tier: typeof tiers[0]) => {
    if (tier.id === currentTier) return "Current Plan";
    if (tier.id === SUBSCRIPTION_TIERS.FREE) return "Free";
    if (purchasing === tier.id) return "Processing...";
    return tier.cta;
  };

  const isDisabled = (tier: typeof tiers[0]) => {
    return tier.id === currentTier || tier.id === SUBSCRIPTION_TIERS.FREE || purchasing !== null || restoring;
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50"
            onClick={onClose}
          />

          {/* Modal */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            transition={{ type: "spring", damping: 25, stiffness: 300 }}
            className="fixed inset-4 md:inset-auto md:left-1/2 md:top-1/2 md:-translate-x-1/2 md:-translate-y-1/2 md:max-w-lg md:w-full z-50 overflow-hidden rounded-3xl"
            style={{
              background: "linear-gradient(180deg, rgba(30, 30, 40, 0.98) 0%, rgba(20, 20, 28, 0.98) 100%)",
              border: "1px solid rgba(255, 255, 255, 0.08)",
              boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.5)",
              maxHeight: "90vh",
            }}
          >
            {/* Header */}
            <div className="relative p-6 pb-4 border-b border-white/5">
              <button
                onClick={onClose}
                className="absolute right-4 top-4 w-10 h-10 rounded-full bg-white/5 flex items-center justify-center hover:bg-white/10 transition-colors"
              >
                <X className="w-5 h-5 text-muted-foreground" />
              </button>

              <div className="flex items-center gap-3 mb-2">
                <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center">
                  <Sparkles className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <h2 className="text-xl font-bold text-white">Upgrade Your Coach</h2>
                  <p className="text-sm text-muted-foreground">
                    {trigger === "limit"
                      ? "You've hit your daily limit"
                      : "Get more from your AI fitness coach"}
                  </p>
                </div>
              </div>
            </div>

            {/* Tiers */}
            <div className="p-4 space-y-3 overflow-y-auto" style={{ maxHeight: "calc(90vh - 120px)" }}>
              {tiers.map((tier) => {
                const isCurrentTier = tier.id === currentTier;
                const Icon = tier.icon;

                return (
                  <motion.div
                    key={tier.id}
                    whileTap={{ scale: 0.98 }}
                    className={`relative p-4 rounded-2xl border transition-all ${
                      tier.popular
                        ? "border-primary/50 bg-primary/5"
                        : isCurrentTier
                        ? "border-white/20 bg-white/5"
                        : "border-white/10 bg-white/[0.02]"
                    }`}
                  >
                    {tier.popular && (
                      <div className="absolute -top-2.5 left-4 px-3 py-0.5 bg-primary rounded-full">
                        <span className="text-[10px] font-bold text-white uppercase tracking-wide">
                          Most Popular
                        </span>
                      </div>
                    )}

                    <div className="flex items-start gap-4">
                      <div
                        className={`w-12 h-12 rounded-2xl flex items-center justify-center ${
                          tier.popular
                            ? "bg-primary/20"
                            : "bg-white/10"
                        }`}
                      >
                        <Icon className={`w-6 h-6 ${tier.popular ? "text-primary" : "text-white/60"}`} />
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-baseline gap-2 mb-1">
                          <span className="text-lg font-bold text-white">{tier.name}</span>
                          <span className="text-xl font-bold text-white">{tier.price}</span>
                          <span className="text-sm text-muted-foreground">{tier.period}</span>
                        </div>

                        <p className="text-sm text-primary font-medium mb-3">
                          {tier.messages} messages/day
                        </p>

                        <ul className="space-y-1.5 mb-4">
                          {tier.features.map((feature, i) => (
                            <li key={i} className="flex items-center gap-2 text-sm text-muted-foreground">
                              <Check className="w-4 h-4 text-primary shrink-0" />
                              {feature}
                            </li>
                          ))}
                        </ul>

                        <button
                          onClick={() => handlePurchase(tier.id)}
                          disabled={isDisabled(tier)}
                          className={`w-full py-3 rounded-xl font-semibold text-sm transition-all ${
                            isCurrentTier
                              ? "bg-white/10 text-white/50 cursor-default"
                              : tier.id === SUBSCRIPTION_TIERS.FREE
                              ? "bg-white/5 text-white/30 cursor-default"
                              : tier.popular
                              ? "bg-primary text-white hover:bg-primary/90 active:scale-[0.98]"
                              : "bg-white/10 text-white hover:bg-white/15 active:scale-[0.98]"
                          } disabled:opacity-50 disabled:cursor-not-allowed`}
                        >
                          {getCtaText(tier)}
                        </button>
                      </div>
                    </div>
                  </motion.div>
                );
              })}

              {/* Error message */}
              {purchaseError && (
                <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20">
                  <p className="text-sm text-red-400 text-center">{purchaseError}</p>
                </div>
              )}

              {/* DEBUG overlay — temporary. Shows raw diagnostics from the
                  purchase flow so we can see exactly what StoreKit returns. */}
              {debugLines.length > 0 && (
                <div className="p-3 rounded-xl bg-red-500/15 border-2 border-red-500/60">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[11px] font-bold text-red-300 uppercase tracking-wider">
                      DEBUG
                    </span>
                    <button
                      onClick={() => setDebugLines([])}
                      className="text-red-300 hover:text-red-200 text-xs px-2 py-0.5 rounded bg-red-500/20"
                    >
                      clear
                    </button>
                  </div>
                  <pre
                    className="text-[10px] leading-snug text-red-100 whitespace-pre-wrap break-words font-mono max-h-64 overflow-y-auto"
                    style={{ WebkitUserSelect: "text", userSelect: "text" }}
                  >
                    {debugLines.join("\n")}
                  </pre>
                </div>
              )}

              {/* Footer */}
              <div className="pt-2 pb-4 space-y-2">
                <p className="text-center text-xs text-muted-foreground">
                  Cancel anytime. Subscriptions auto-renew monthly.
                </p>
                {isNativePlatform() && (
                  <button
                    onClick={handleRestore}
                    disabled={restoring || purchasing !== null}
                    className="w-full flex items-center justify-center gap-2 py-2 text-xs text-primary hover:text-primary/80 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <RotateCcw className={`w-3.5 h-3.5 ${restoring ? "animate-spin" : ""}`} />
                    {restoring ? "Restoring..." : "Restore Purchases"}
                  </button>
                )}
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

// Compact upgrade banner for showing in-app
export function UpgradeBanner({ onUpgrade }: { onUpgrade: () => void }) {
  const { tier, messagesRemaining, dailyLimit } = useSubscription();

  if (tier !== SUBSCRIPTION_TIERS.FREE) return null;
  if (messagesRemaining > 1) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="mx-4 mb-4 p-3 rounded-2xl bg-gradient-to-r from-primary/20 to-primary/5 border border-primary/20"
    >
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-primary/20 flex items-center justify-center shrink-0">
          <Zap className="w-5 h-5 text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-white">
            {messagesRemaining === 0
              ? "You're out of messages today"
              : `${messagesRemaining} message left today`}
          </p>
          <p className="text-xs text-muted-foreground">
            Upgrade for up to {tier === SUBSCRIPTION_TIERS.FREE ? "15" : "50"} messages/day
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
