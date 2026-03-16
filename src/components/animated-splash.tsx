"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";

interface AnimatedSplashProps {
  onComplete: () => void;
  duration?: number;
}

export function AnimatedSplash({ onComplete, duration = 2000 }: AnimatedSplashProps) {
  const [show, setShow] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => {
      setShow(false);
      setTimeout(onComplete, 500); // Wait for fade out
    }, duration);

    return () => clearTimeout(timer);
  }, [duration, onComplete]);

  return (
    <AnimatePresence>
      {show && (
        <motion.div
          initial={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.5 }}
          className="fixed inset-0 z-[9999] flex items-center justify-center"
          style={{ backgroundColor: "#0f0f13" }}
        >
          <svg
            width="200"
            height="150"
            viewBox="0 0 430 400"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            {/* Animated line path */}
            <motion.path
              d="M 80 380 L 150 340 L 220 280 L 290 310 L 360 220 L 430 120"
              stroke="#06b6d4"
              strokeWidth="32"
              strokeLinecap="round"
              strokeLinejoin="round"
              fill="none"
              initial={{ pathLength: 0 }}
              animate={{ pathLength: 1 }}
              transition={{
                duration: 1.5,
                ease: "easeOut",
              }}
            />

            {/* Glow circle at peak - appears at end */}
            <motion.circle
              cx="430"
              cy="120"
              r="24"
              fill="#06b6d4"
              opacity={0.3}
              initial={{ scale: 0, opacity: 0 }}
              animate={{ scale: 1, opacity: 0.3 }}
              transition={{ delay: 1.3, duration: 0.3 }}
            />
            <motion.circle
              cx="430"
              cy="120"
              r="12"
              fill="#06b6d4"
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ delay: 1.3, duration: 0.3, type: "spring" }}
            />
          </svg>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
