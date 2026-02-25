"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";

export function SplashScreen({ children }: { children: React.ReactNode }) {
  const [showSplash, setShowSplash] = useState(true);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);

    // Hide splash after 1.8 seconds (line: 0.8s + text: 0.4s + pause: 0.6s)
    const timer = setTimeout(() => {
      setShowSplash(false);
    }, 1800);

    return () => clearTimeout(timer);
  }, []);

  // Prevent hydration mismatch - render children immediately on server
  if (!mounted) {
    return <>{children}</>;
  }

  // Upward trending line chart path (like a stock chart going up)
  const chartPath = "M 0 70 L 20 65 L 40 55 L 60 60 L 80 45 L 100 50 L 120 35 L 140 25 L 160 30 L 180 15 L 200 5";

  return (
    <>
      <AnimatePresence>
        {showSplash && (
          <motion.div
            initial={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3, ease: "easeOut" }}
            className="fixed inset-0 z-[9999] bg-black flex flex-col items-center justify-center gap-6"
          >
            {/* Animated Line Chart */}
            <svg
              width="200"
              height="80"
              viewBox="0 0 200 80"
              fill="none"
              className="overflow-visible"
            >
              {/* Glow filter */}
              <defs>
                <filter id="glow" x="-50%" y="-50%" width="200%" height="200%">
                  <feGaussianBlur stdDeviation="3" result="coloredBlur" />
                  <feMerge>
                    <feMergeNode in="coloredBlur" />
                    <feMergeNode in="SourceGraphic" />
                  </feMerge>
                </filter>
              </defs>

              {/* Animated path */}
              <motion.path
                d={chartPath}
                stroke="#06b6d4"
                strokeWidth="3"
                strokeLinecap="round"
                strokeLinejoin="round"
                fill="none"
                filter="url(#glow)"
                initial={{ pathLength: 0, opacity: 0 }}
                animate={{ pathLength: 1, opacity: 1 }}
                transition={{
                  pathLength: { duration: 0.8, ease: "easeOut" },
                  opacity: { duration: 0.1 },
                }}
              />
            </svg>

            {/* Logo Text */}
            <motion.h1
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, ease: "easeOut", delay: 0.7 }}
              className="text-3xl font-black uppercase tracking-tighter text-white"
            >
              NetGains<span className="text-[#06b6d4]">AI</span>
            </motion.h1>
          </motion.div>
        )}
      </AnimatePresence>
      {children}
    </>
  );
}
