"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { Brain, ExternalLink, AlertCircle } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "./auth-provider";
import { Button } from "./ui/button";
import Link from "next/link";

interface AIConsentModalProps {
  onConsent: () => void;
}

export function AIConsentModal({ onConsent }: AIConsentModalProps) {
  const { user } = useAuth();
  const [accepting, setAccepting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const supabase = createClient();

  const handleConsent = async () => {
    if (!user) return;

    setAccepting(true);
    setError(null);

    try {
      const { error: updateError } = await supabase
        .from("profiles")
        .update({ consent_ai_data: true })
        .eq("id", user.id);

      if (updateError) {
        console.error("Failed to save AI consent:", updateError);
        setError("Failed to save. Please check your connection and try again.");
        setAccepting(false);
        return;
      }

      onConsent();
    } catch (err) {
      console.error("Failed to save AI consent:", err);
      setError("Something went wrong. Please try again.");
      setAccepting(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
    >
      {/* Backdrop - blurs the coach UI behind */}
      <div
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        style={{ background: "rgba(0, 0, 0, 0.75)" }}
      />

      {/* Modal content */}
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="relative w-full max-w-md rounded-2xl overflow-hidden"
        style={{ background: "var(--background)" }}
      >
        {/* Header */}
        <div className="p-6 text-center">
          <div className="w-16 h-16 rounded-2xl bg-primary/20 flex items-center justify-center mx-auto mb-4">
            <Brain className="w-8 h-8 text-primary" />
          </div>
          <h1 className="text-2xl font-bold mb-2">AI Data Processing</h1>
          <p className="text-muted-foreground text-sm">
            Your coach is powered by AI. Please review how your data is used.
          </p>
        </div>

        {/* Content */}
        <div className="px-6 pb-4 space-y-4">
          {/* Data sharing disclosure */}
          <div
            className="rounded-xl p-4"
            style={{ background: "rgba(255,255,255,0.03)" }}
          >
            <p className="text-sm text-foreground/90 leading-relaxed">
              NetGains AI sends your messages, workout data, and nutrition information to{" "}
              <strong className="text-foreground">Anthropic&apos;s Claude AI</strong>{" "}
              to provide personalized coaching.
            </p>
          </div>

          {/* No training disclosure */}
          <div
            className="rounded-xl p-4"
            style={{ background: "rgba(255,255,255,0.03)" }}
          >
            <p className="text-sm text-foreground/90 leading-relaxed">
              Your data is processed to generate responses and is{" "}
              <strong className="text-foreground">not used to train AI models</strong>.
            </p>
          </div>

          {/* Learn more link */}
          <Link
            href="/privacy"
            className="flex items-center justify-center gap-2 text-sm text-primary hover:underline py-2"
          >
            <span>Learn More</span>
            <ExternalLink className="w-4 h-4" />
          </Link>
        </div>

        {/* Footer with Accept Button */}
        <div className="p-6 pt-2 border-t border-white/5">
          <p className="text-xs text-muted-foreground text-center mb-4">
            By tapping &quot;I Agree&quot;, you consent to your data being processed by Anthropic&apos;s Claude AI as described above.
          </p>
          {error && (
            <div className="flex items-center gap-2 p-3 mb-4 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}
          <Button
            onClick={handleConsent}
            loading={accepting}
            className="w-full"
          >
            I Agree
          </Button>
        </div>
      </motion.div>
    </motion.div>
  );
}
