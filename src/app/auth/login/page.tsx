"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Dumbbell } from "lucide-react";
import { motion } from "framer-motion";
import { createClient } from "@/lib/supabase/client";
import { GlassCard } from "@/components/ui/glass-card";
import { Button } from "@/components/ui/button";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const supabase = createClient();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      setError(error.message);
      setLoading(false);
    } else {
      router.push("/coach");
      router.refresh();
    }
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
          <p className="text-muted-foreground">Track your strength gains</p>
        </div>

        <GlassCard>
          <form onSubmit={handleLogin} className="space-y-4">
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
              Sign In
            </Button>
          </form>
        </GlassCard>

        <p className="text-center text-muted-foreground mt-6">
          Don&apos;t have an account?{" "}
          <Link href="/auth/signup" className="text-primary font-semibold">
            Sign up
          </Link>
        </p>
      </motion.div>
    </div>
  );
}
