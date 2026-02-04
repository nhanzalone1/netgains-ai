"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { User, LogOut } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "./auth-provider";
import { IconButton } from "./ui/icon-button";

export function UserMenu() {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const supabase = createClient();

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    router.push("/auth/login");
    router.refresh();
  };

  if (!user) return null;

  return (
    <div className="relative">
      <IconButton onClick={() => setOpen(!open)}>
        <User className="w-5 h-5" />
      </IconButton>

      <AnimatePresence>
        {open && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-10"
              onClick={() => setOpen(false)}
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: -10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: -10 }}
              transition={{ duration: 0.15 }}
              className="absolute right-0 top-14 z-20 min-w-[200px] overflow-hidden rounded-2xl"
              style={{
                background: "rgba(26, 26, 36, 0.9)",
                backdropFilter: "blur(24px)",
                WebkitBackdropFilter: "blur(24px)",
                border: "1px solid rgba(255, 255, 255, 0.05)",
                boxShadow: "0 8px 32px rgba(0, 0, 0, 0.4)",
              }}
            >
              <div className="p-3 border-b border-white/5">
                <p className="text-xs text-muted-foreground truncate uppercase tracking-wide">
                  {user.email}
                </p>
              </div>
              <motion.button
                whileTap={{ scale: 0.98 }}
                onClick={handleSignOut}
                className="w-full flex items-center gap-3 p-3 text-left hover:bg-white/5 transition-colors min-h-[44px]"
              >
                <LogOut className="w-4 h-4 text-primary" />
                <span className="font-medium">Sign Out</span>
              </motion.button>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
