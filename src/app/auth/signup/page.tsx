"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Dumbbell, Mail } from "lucide-react";
import { motion } from "framer-motion";
import { createClient } from "@/lib/supabase/client";
import { GlassCard } from "@/components/ui/glass-card";
import { Button } from "@/components/ui/button";

export default function SignupPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [emailSent, setEmailSent] = useState(false);
  const router = useRouter();
  const supabase = createClient();

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (password !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }

    if (password.length < 6) {
      setError("Password must be at least 6 characters");
      return;
    }

    setLoading(true);

    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback`,
      },
    });

    if (error) {
      setError(error.message);
      setLoading(false);
    } else if (data.user && !data.session) {
      // Email confirmation required - show confirmation message
      setEmailSent(true);
      setLoading(false);
    } else if (data.session) {
      // Auto-confirmed (email confirmation disabled in Supabase) - redirect
      router.push("/coach");
      router.refresh();
    } else {
      setLoading(false);
    }
  };

  // Show email confirmation screen
  if (emailSent) {
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
              <Mail className="w-10 h-10 text-primary-foreground" />
            </motion.div>
            <h1 className="text-3xl font-black uppercase tracking-tighter">Check Your Email</h1>
            <p className="text-muted-foreground text-center mt-2">
              We sent a confirmation link to <span className="text-foreground font-medium">{email}</span>
            </p>
          </div>

          <GlassCard>
            <div className="text-center space-y-4">
              <p className="text-muted-foreground">
                Click the link in your email to verify your account and start tracking your gains.
              </p>
              <p className="text-sm text-muted-foreground">
                Didn&apos;t get the email? Check your spam folder.
              </p>
            </div>
          </GlassCard>

          <p className="text-center text-muted-foreground mt-6">
            <Link href="/auth/login" className="text-primary font-semibold">
              Back to sign in
            </Link>
          </p>
        </motion.div>
      </div>
    );
  }

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
          <h1 className="text-3xl font-black uppercase tracking-tighter">Create Account</h1>
          <p className="text-muted-foreground">Start tracking your gains</p>
        </div>

        <GlassCard>
          <form onSubmit={handleSignup} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-muted-foreground mb-2 uppercase tracking-wide">
                Email
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="w-full bg-background/50 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-primary min-h-[44px]"
                placeholder="you@example.com"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-muted-foreground mb-2 uppercase tracking-wide">
                Password
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="w-full bg-background/50 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-primary min-h-[44px]"
                placeholder="••••••••"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-muted-foreground mb-2 uppercase tracking-wide">
                Confirm Password
              </label>
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                className="w-full bg-background/50 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-primary min-h-[44px]"
                placeholder="••••••••"
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
              Create Account
            </Button>
          </form>
        </GlassCard>

        <p className="text-center text-muted-foreground mt-6">
          Already have an account?{" "}
          <Link href="/auth/login" className="text-primary font-semibold">
            Sign in
          </Link>
        </p>
      </motion.div>
    </div>
  );
}
