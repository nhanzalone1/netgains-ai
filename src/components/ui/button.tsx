"use client";

import { ReactNode } from "react";
import { motion } from "framer-motion";
import { Loader2 } from "lucide-react";

interface ButtonProps {
  children: ReactNode;
  variant?: "primary" | "success" | "ghost" | "outline";
  loading?: boolean;
  icon?: ReactNode;
  className?: string;
  disabled?: boolean;
  onClick?: () => void;
  type?: "button" | "submit" | "reset";
}

const variants = {
  primary: "bg-primary text-primary-foreground",
  success: "bg-success text-white",
  ghost: "bg-muted text-foreground",
  outline: "bg-transparent border-2 border-dashed border-border text-muted-foreground hover:text-foreground hover:border-primary",
};

export function Button({
  children,
  variant = "primary",
  loading = false,
  icon,
  className = "",
  disabled,
  onClick,
  type = "button",
}: ButtonProps) {
  return (
    <motion.button
      type={type}
      whileTap={{ scale: disabled || loading ? 1 : 0.95 }}
      transition={{ duration: 0.1 }}
      className={`
        w-full font-semibold py-4 rounded-2xl min-h-[44px]
        flex items-center justify-center gap-2
        disabled:opacity-50 disabled:cursor-not-allowed
        transition-colors
        ${variants[variant]}
        ${className}
      `}
      disabled={disabled || loading}
      onClick={onClick}
    >
      {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : icon}
      {children}
    </motion.button>
  );
}
