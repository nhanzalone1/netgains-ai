"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { User, LogOut, Palette, Check } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "./auth-provider";
import { useTheme, themes } from "./theme-provider";
import { IconButton } from "./ui/icon-button";

export function UserMenu() {
  const { user } = useAuth();
  const { theme, setTheme } = useTheme();
  const [open, setOpen] = useState(false);
  const [showThemes, setShowThemes] = useState(false);
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
              onClick={() => {
                setOpen(false);
                setShowThemes(false);
              }}
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: -10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: -10 }}
              transition={{ duration: 0.15 }}
              className="absolute right-0 top-14 z-20 min-w-[220px] overflow-hidden rounded-2xl"
              style={{
                background: "rgba(26, 26, 36, 0.95)",
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

              {/* Theme Picker */}
              <div className="border-b border-white/5">
                <motion.button
                  whileTap={{ scale: 0.98 }}
                  onClick={() => setShowThemes(!showThemes)}
                  className="w-full flex items-center gap-3 p-3 text-left hover:bg-white/5 transition-colors min-h-[44px]"
                >
                  <Palette className="w-4 h-4 text-primary" />
                  <span className="font-medium flex-1">Theme</span>
                  <div
                    className="w-4 h-4 rounded-full"
                    style={{ background: theme.primary }}
                  />
                </motion.button>

                <AnimatePresence>
                  {showThemes && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.2 }}
                      className="overflow-hidden"
                    >
                      <div className="px-2 pb-2 grid grid-cols-3 gap-2">
                        {themes.map((t) => (
                          <motion.button
                            key={t.id}
                            whileTap={{ scale: 0.95 }}
                            onClick={() => setTheme(t.id)}
                            className="flex flex-col items-center gap-1.5 p-2 rounded-xl transition-colors"
                            style={{
                              background:
                                theme.id === t.id
                                  ? "rgba(255, 255, 255, 0.1)"
                                  : "transparent",
                            }}
                          >
                            <div
                              className="w-8 h-8 rounded-full flex items-center justify-center"
                              style={{ background: t.primary }}
                            >
                              {theme.id === t.id && (
                                <Check className="w-4 h-4 text-white" />
                              )}
                            </div>
                            <span className="text-[10px] text-muted-foreground font-medium">
                              {t.name.split(" ")[0]}
                            </span>
                          </motion.button>
                        ))}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
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
