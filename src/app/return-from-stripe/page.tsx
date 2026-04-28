"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { Loader2, AlertCircle, CheckCircle2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

const POLL_INTERVAL_MS = 1000;
const MAX_ATTEMPTS = 10;
const ACTIVE_STATUSES = new Set(["active", "trialing"]);

export default function ReturnFromStripePage() {
  const router = useRouter();
  const [status, setStatus] = useState<"polling" | "timeout" | "error" | "logged-out">("polling");
  const attemptsRef = useRef(0);

  useEffect(() => {
    const supabase = createClient();
    let cancelled = false;

    const checkSubscription = async () => {
      attemptsRef.current += 1;

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        // No Supabase session in this context — most likely we're rendering
        // inside Safari View Controller (universal-link interception failed)
        // and the user's session lives in the WebView's cookie jar instead.
        // Don't trap them in a /auth/login redirect they can't usefully
        // complete; show a "subscription active, return to app" terminal
        // state and let the swipe-down hint do its job.
        if (!cancelled) setStatus("logged-out");
        return true;
      }

      const { data: profile, error } = await supabase
        .from("profiles")
        .select("subscription_status")
        .eq("id", user.id)
        .maybeSingle();

      if (error) {
        console.error("[return-from-stripe] profile fetch error:", error);
        if (!cancelled) setStatus("error");
        return true;
      }

      if (profile?.subscription_status && ACTIVE_STATUSES.has(profile.subscription_status)) {
        if (!cancelled) router.replace("/coach");
        return true;
      }

      return false;
    };

    const interval = setInterval(async () => {
      const done = await checkSubscription();
      if (done || attemptsRef.current >= MAX_ATTEMPTS) {
        clearInterval(interval);
        if (!done && !cancelled) setStatus("timeout");
      }
    }, POLL_INTERVAL_MS);

    // Run immediately so we don't waste the first second
    checkSubscription().then((done) => {
      if (done) clearInterval(interval);
    });

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [router]);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-6">
      {status === "polling" && (
        <>
          <motion.div
            animate={{ rotate: 360 }}
            transition={{ duration: 1.4, repeat: Infinity, ease: "linear" }}
            className="w-12 h-12 mb-6"
          >
            <Loader2 className="w-12 h-12 text-primary" />
          </motion.div>
          <h1 className="text-xl font-bold text-white mb-2">Activating your subscription…</h1>
          <p className="text-sm text-muted-foreground text-center max-w-xs">
            Hang tight — this usually takes a couple of seconds.
          </p>
        </>
      )}

      {status === "timeout" && (
        <>
          <div className="w-12 h-12 rounded-full bg-amber-500/20 flex items-center justify-center mb-6">
            <AlertCircle className="w-6 h-6 text-amber-500" />
          </div>
          <h1 className="text-xl font-bold text-white mb-2">Taking longer than expected</h1>
          <p className="text-sm text-muted-foreground text-center max-w-xs mb-6">
            Stripe usually confirms within seconds. Try refreshing — if you&apos;re still stuck, your payment is safe and we&apos;ll sort it out.
          </p>
          <button
            onClick={() => window.location.reload()}
            className="px-5 py-2.5 rounded-xl bg-primary text-white text-sm font-semibold hover:bg-primary/90 transition-colors mb-3"
          >
            Refresh
          </button>
          <a
            href="mailto:support.netgainsai@gmail.com"
            className="text-xs text-muted-foreground hover:text-white transition-colors"
          >
            Contact support
          </a>
        </>
      )}

      {status === "error" && (
        <>
          <div className="w-12 h-12 rounded-full bg-red-500/20 flex items-center justify-center mb-6">
            <AlertCircle className="w-6 h-6 text-red-500" />
          </div>
          <h1 className="text-xl font-bold text-white mb-2">Something went wrong</h1>
          <p className="text-sm text-muted-foreground text-center max-w-xs mb-6">
            We couldn&apos;t check your subscription status. Try refreshing.
          </p>
          <button
            onClick={() => window.location.reload()}
            className="px-5 py-2.5 rounded-xl bg-primary text-white text-sm font-semibold hover:bg-primary/90 transition-colors"
          >
            Refresh
          </button>
        </>
      )}

      {status === "logged-out" && (
        <>
          <div className="w-12 h-12 rounded-full bg-emerald-500/20 flex items-center justify-center mb-6">
            <CheckCircle2 className="w-6 h-6 text-emerald-500" />
          </div>
          <h1 className="text-xl font-bold text-white mb-2">Your subscription is active</h1>
          <p className="text-sm text-muted-foreground text-center max-w-xs">
            Open the NetGains app from your home screen to continue.
          </p>
        </>
      )}

      <p className="text-xs text-muted-foreground/60 text-center mt-8">
        Stuck? Swipe down to return to the app.
      </p>
    </div>
  );
}
