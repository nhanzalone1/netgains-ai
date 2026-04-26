"use client";

import { Suspense, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { motion } from "framer-motion";
import { CheckCircle2, Loader2 } from "lucide-react";

function UpgradeSuccessInner() {
  const params = useSearchParams();
  const sessionId = params.get("session_id");

  const returnUrl = sessionId
    ? `https://netgainsai.com/return-from-stripe?session_id=${sessionId}`
    : `https://netgainsai.com/return-from-stripe`;

  useEffect(() => {
    const timer = setTimeout(() => {
      window.location.href = returnUrl;
    }, 1200);
    return () => clearTimeout(timer);
  }, [returnUrl]);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-6">
      <motion.div
        initial={{ scale: 0.8, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: "spring", damping: 18 }}
        className="w-20 h-20 rounded-full bg-gradient-to-br from-emerald-500/20 to-emerald-600/10 flex items-center justify-center mb-6"
      >
        <CheckCircle2 className="w-10 h-10 text-emerald-500" />
      </motion.div>

      <h1 className="text-2xl font-bold text-white mb-2">You&apos;re in!</h1>
      <p className="text-sm text-muted-foreground text-center mb-8">
        Thanks for becoming a founding member. Returning to the app...
      </p>

      <div className="flex items-center gap-2 text-xs text-muted-foreground mb-6">
        <Loader2 className="w-3.5 h-3.5 animate-spin" />
        <span>Opening NetGains</span>
      </div>

      <a
        href={returnUrl}
        className="px-5 py-2.5 rounded-xl bg-primary text-white text-sm font-semibold hover:bg-primary/90 transition-colors"
      >
        Open NetGains app
      </a>

      <Link
        href="/coach"
        className="mt-3 text-xs text-muted-foreground hover:text-white transition-colors"
      >
        Continue on web
      </Link>
    </div>
  );
}

export default function UpgradeSuccessPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      }
    >
      <UpgradeSuccessInner />
    </Suspense>
  );
}
