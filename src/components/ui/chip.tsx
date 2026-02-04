"use client";

import { motion } from "framer-motion";

interface ChipProps {
  label: string;
  active?: boolean;
  onClick?: () => void;
}

export function Chip({ label, active = false, onClick }: ChipProps) {
  return (
    <motion.button
      type="button"
      whileTap={{ scale: 0.95 }}
      onClick={onClick}
      className={`
        px-4 py-2 rounded-xl font-semibold text-sm uppercase tracking-wide
        transition-colors min-h-[44px]
        ${active
          ? "bg-primary text-primary-foreground"
          : "bg-muted/50 text-muted-foreground hover:text-foreground"
        }
      `}
    >
      {label}
    </motion.button>
  );
}
