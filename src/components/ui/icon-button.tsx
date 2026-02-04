"use client";

import { ReactNode } from "react";
import { motion } from "framer-motion";

interface IconButtonProps {
  children: ReactNode;
  active?: boolean;
  className?: string;
  onClick?: () => void;
  disabled?: boolean;
}

export function IconButton({
  children,
  active = false,
  className = "",
  onClick,
  disabled,
}: IconButtonProps) {
  return (
    <motion.button
      whileTap={{ scale: disabled ? 1 : 0.95 }}
      transition={{ duration: 0.1 }}
      className={`
        w-11 h-11 min-w-[44px] min-h-[44px] rounded-xl
        flex items-center justify-center
        transition-colors
        ${active
          ? "bg-primary text-primary-foreground"
          : "text-foreground"
        }
        ${className}
      `}
      style={!active ? {
        background: "rgba(26, 26, 36, 0.6)",
        backdropFilter: "blur(8px)",
        WebkitBackdropFilter: "blur(8px)",
      } : undefined}
      onClick={onClick}
      disabled={disabled}
    >
      {children}
    </motion.button>
  );
}
