"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";
import { motion } from "framer-motion";
import { Check, Loader2, Sparkles } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

const OFFER_ITEMS = [
  {
    benefit: "A coach that knows your goals, gear, and progress",
    anchor: "Personal trainer: $80–$150/session",
  },
  {
    benefit: "Workouts that adapt to your split, equipment, and recovery",
    anchor: "Custom programming: $50–$200/month",
  },
  {
    benefit: "Nutrition guidance with real macro math, not guesses",
    anchor: "Macro coach: $100–$250/month",
  },
  {
    benefit: "Workout history and trends, all in one place",
    anchor: null,
  },
  {
    benefit: "Available the moment you have a question — at the rack, mid-meal, late at night",
    anchor: "Real coaches sleep. NetGains doesn't.",
  },
];

type ViewState = "loading" | "needs-signup" | "offer" | "code-entry";

function UpgradePageInner() {
  const params = useSearchParams();
  const router = useRouter();
  const queryUserId = params.get("user_id");
  const wasCanceled = params.get("canceled") === "true";

  const [viewState, setViewState] = useState<ViewState>("loading");
  const [authedUserId, setAuthedUserId] = useState<string | null>(null);
  const [betaCode, setBetaCode] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const supabase = createClient();
    let cancelled = false;

    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (cancelled) return;

      if (!user) {
        setViewState("needs-signup");
        return;
      }

      if (queryUserId && queryUserId !== user.id) {
        router.replace("/auth/login?next=/upgrade");
        return;
      }

      setAuthedUserId(user.id);
      setViewState("offer");
    })();

    return () => {
      cancelled = true;
    };
  }, [queryUserId, router]);

  const revealCodeEntry = () => {
    setError(null);
    setViewState("code-entry");
  };

  const handleSubmitCode = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!authedUserId || !betaCode.trim() || submitting) return;

    setSubmitting(true);
    setError(null);

    try {
      const res = await fetch("/api/stripe/create-checkout-session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_id: authedUserId,
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
      window.location.href = url;
    } catch (err) {
      console.error("[upgrade] checkout error:", err);
      setError("We couldn't reach Stripe. Try again in a moment.");
      setSubmitting(false);
    }
  };

  if (viewState === "loading") {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (viewState === "needs-signup") {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-6 max-w-lg mx-auto">
        <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-amber-500/20 to-amber-600/5 flex items-center justify-center mb-4">
          <Sparkles className="w-6 h-6 text-amber-500" />
        </div>
        <h1 className="text-3xl font-bold text-white text-center mb-3 leading-tight">
          Build the body you&apos;ve been promising yourself.
        </h1>
        <p className="text-base text-muted-foreground text-center mb-6">
          NetGains is your AI fitness coach — built for people who&apos;d rather train than spreadsheet.
        </p>
        <p className="text-sm text-amber-500/90 text-center mb-6 font-medium">
          15 founding spots at $14.99/mo, locked in for life. After that, the price goes up.
        </p>
        <Link
          href="/auth/signup?next=/upgrade"
          className="px-6 py-3.5 rounded-xl bg-primary text-white font-semibold hover:bg-primary/90 transition-colors"
        >
          Sign up to claim your founding spot
        </Link>
        <Link
          href="/auth/login?next=/upgrade"
          className="mt-3 text-sm text-muted-foreground hover:text-white transition-colors"
        >
          Already have an account? Log in
        </Link>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col items-center p-6 pt-12 pb-16 max-w-xl mx-auto">
      {wasCanceled && (
        <div className="w-full mb-6 px-4 py-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-sm text-amber-300 text-center">
          No worries — your spot&apos;s still open.
        </div>
      )}

      <div className="text-center mb-10">
        <h1 className="text-3xl md:text-4xl font-bold text-white mb-3 leading-tight">
          Build the body you&apos;ve been promising yourself.
          <br />
          <span className="text-white/70">Without overthinking it.</span>
        </h1>
        <p className="text-base text-muted-foreground">
          NetGains is your AI fitness coach — built for people who&apos;d rather train than spreadsheet.
        </p>
      </div>

      <ul className="w-full space-y-4 mb-10">
        {OFFER_ITEMS.map((item) => (
          <li key={item.benefit} className="flex items-start gap-3">
            <div className="w-6 h-6 rounded-full bg-emerald-500/20 flex items-center justify-center shrink-0 mt-0.5">
              <Check className="w-3.5 h-3.5 text-emerald-500" />
            </div>
            <div className="flex-1">
              <p className="text-base text-white">{item.benefit}</p>
              {item.anchor && (
                <p className="text-xs text-muted-foreground/60 line-through mt-0.5">
                  {item.anchor}
                </p>
              )}
            </div>
          </li>
        ))}
      </ul>

      <div className="text-center mb-3">
        <p className="text-sm text-muted-foreground mb-1">Founding member price</p>
        <div className="flex items-baseline justify-center gap-2">
          <span className="text-5xl font-bold bg-gradient-to-r from-primary to-primary/80 bg-clip-text text-transparent">
            $14.99
          </span>
          <span className="text-lg text-muted-foreground">/month</span>
        </div>
        <p className="text-sm text-white/80 mt-2">Locked in for life.</p>
      </div>

      <p className="text-xs text-muted-foreground text-center mb-8 max-w-sm">
        15 founding spots. After this cohort, the price goes up — and stays up.
      </p>

      {viewState === "offer" && (
        <motion.button
          whileTap={{ scale: 0.98 }}
          onClick={revealCodeEntry}
          className="w-full max-w-sm py-4 rounded-xl bg-primary text-white font-semibold hover:bg-primary/90 transition-colors"
        >
          Continue with founding code
        </motion.button>
      )}

      {viewState === "code-entry" && (
        <form onSubmit={handleSubmitCode} className="w-full max-w-sm space-y-3">
          <label className="block">
            <span className="text-sm text-muted-foreground mb-2 block">
              Enter your founding member code
            </span>
            <input
              type="text"
              value={betaCode}
              onChange={(e) => setBetaCode(e.target.value.toUpperCase())}
              placeholder="FOUNDINGXX"
              autoFocus
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="characters"
              spellCheck={false}
              disabled={submitting}
              className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary/50 disabled:opacity-50 font-mono text-center text-lg"
            />
          </label>
          {error && (
            <p className="text-sm text-red-400 text-center">{error}</p>
          )}
          <motion.button
            type="submit"
            whileTap={{ scale: submitting ? 1 : 0.98 }}
            disabled={!betaCode.trim() || submitting}
            className="w-full py-4 rounded-xl bg-primary text-white font-semibold hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {submitting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Opening checkout...
              </>
            ) : (
              "Subscribe — $14.99/mo"
            )}
          </motion.button>
        </form>
      )}

      <p className="text-xs text-muted-foreground text-center mt-4">
        7-day refund, no questions. Cancel any time.
      </p>
    </div>
  );
}

export default function UpgradePage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      }
    >
      <UpgradePageInner />
    </Suspense>
  );
}
