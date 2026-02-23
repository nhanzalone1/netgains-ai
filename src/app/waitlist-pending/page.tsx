"use client";

import { useRouter } from "next/navigation";
import { Dumbbell, Clock, LogOut } from "lucide-react";
import { motion } from "framer-motion";
import { createClient } from "@/lib/supabase/client";
import { GlassCard } from "@/components/ui/glass-card";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/components/auth-provider";

export default function WaitlistPendingPage() {
  const { user } = useAuth();
  const router = useRouter();
  const supabase = createClient();

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push("/waitlist");
    router.refresh();
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
        </div>

        <GlassCard>
          <div className="text-center py-4">
            <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-4">
              <Clock className="w-8 h-8 text-primary" />
            </div>
            <h2 className="font-semibold text-lg mb-2">You&apos;re on the list!</h2>
            <p className="text-sm text-muted-foreground mb-4">
              We&apos;re currently in private beta. You&apos;ll get access soon.
            </p>
            {user?.email && (
              <p className="text-xs text-muted-foreground/70 mb-6">
                Signed in as {user.email}
              </p>
            )}
            <Button variant="outline" onClick={handleLogout} className="gap-2">
              <LogOut className="w-4 h-4" />
              Sign Out
            </Button>
          </div>
        </GlassCard>
      </motion.div>
    </div>
  );
}
