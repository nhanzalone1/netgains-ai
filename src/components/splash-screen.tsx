"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";

export function SplashScreen({ children }: { children: React.ReactNode }) {
  const [showSplash, setShowSplash] = useState(true);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);

    // Check if we've already shown splash this session
    const hasShownSplash = sessionStorage.getItem("netgains-splash-shown");

    if (hasShownSplash) {
      setShowSplash(false);
      return;
    }

    // Mark splash as shown for this session
    sessionStorage.setItem("netgains-splash-shown", "true");

    // Hide splash after 1.5 seconds
    const timer = setTimeout(() => {
      setShowSplash(false);
    }, 1500);

    return () => clearTimeout(timer);
  }, []);

  // Prevent hydration mismatch - render children immediately on server
  if (!mounted) {
    return <>{children}</>;
  }

  return (
    <>
      <AnimatePresence>
        {showSplash && (
          <motion.div
            initial={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.4, ease: "easeOut" }}
            className="fixed inset-0 z-[9999] bg-black flex items-center justify-center"
          >
            <motion.h1
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.3, ease: "easeOut" }}
              className="text-4xl font-black uppercase tracking-tighter text-white"
            >
              NetGains
            </motion.h1>
          </motion.div>
        )}
      </AnimatePresence>
      {children}
    </>
  );
}
