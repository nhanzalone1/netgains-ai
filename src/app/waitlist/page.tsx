"use client";

import { useState } from "react";
import Link from "next/link";
import { Dumbbell, Mail, Rocket, CheckCircle } from "lucide-react";
import { motion } from "framer-motion";
import { createClient } from "@/lib/supabase/client";
import { GlassCard } from "@/components/ui/glass-card";
import { Button } from "@/components/ui/button";

export default function WaitlistPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const supabase = createClient();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const emailToSubmit = email.trim().toLowerCase();

    // Check if already on waitlist
    const { data: existing } = await supabase
      .from("waitlist_emails")
      .select("id")
      .eq("email", emailToSubmit)
      .single();

    if (existing) {
      setSubmitted(true);
      setLoading(false);
      return;
    }

    // Add to waitlist
    const { error: insertError } = await supabase
      .from("waitlist_emails")
      .insert([{ email: emailToSubmit }]);

    if (insertError) {
      setError("Something went wrong. Please try again.");
      console.error("Waitlist error:", insertError);
    } else {
      setSubmitted(true);
    }
    setLoading(false);
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-sm"
      >
        <div className="flex flex-col items-center mb-8">
          <motion.div
            initial={{ scale: 0.8 }}
            animate={{ scale: 1 }}
            transition={{ delay: 0.1 }}
            className="w-20 h-20 bg-primary rounded-3xl flex items-center justify-center mb-4 shadow-lg shadow-primary/30"
          >
            <Dumbbell className="w-10 h-10 text-primary-foreground" />
          </motion.div>
          <h1 className="text-3xl font-black uppercase tracking-tighter">NetGains</h1>
          <p className="text-muted-foreground text-center mt-2">
            AI-powered fitness coaching.<br />
            Currently in private beta.
          </p>
        </div>

        <GlassCard>
          {!submitted ? (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="flex items-center gap-3 mb-2">
                <Rocket className="w-5 h-5 text-primary" />
                <h2 className="font-semibold">Join the Waitlist</h2>
              </div>
              <p className="text-sm text-muted-foreground mb-4">
                Get early access when we expand the beta.
              </p>

              <div className="relative">
                <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  className="w-full bg-background/50 rounded-xl pl-12 pr-4 py-3 focus:outline-none focus:ring-2 focus:ring-primary min-h-[44px]"
                  placeholder="you@example.com"
                />
              </div>

              {error && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  className="text-primary text-sm bg-primary/10 rounded-xl p-3 border border-primary/20"
                >
                  {error}
                </motion.div>
              )}

              <Button type="submit" loading={loading}>
                Join Waitlist
              </Button>
            </form>
          ) : (
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="text-center py-4"
            >
              <CheckCircle className="w-12 h-12 text-green-500 mx-auto mb-4" />
              <h2 className="font-semibold text-lg mb-2">You&apos;re on the list!</h2>
              <p className="text-sm text-muted-foreground">
                We&apos;ll email you when it&apos;s your turn.
              </p>
            </motion.div>
          )}
        </GlassCard>

        <div className="text-center mt-6 space-y-2">
          <p className="text-muted-foreground">
            Already have access?{" "}
            <Link href="/auth/signup" className="text-primary font-semibold">
              Sign up
            </Link>
          </p>
          <p className="text-muted-foreground/70 text-sm">
            Already have an account?{" "}
            <Link href="/auth/login" className="text-primary/80 hover:text-primary">
              Log in
            </Link>
          </p>
        </div>
      </motion.div>
    </div>
  );
}
