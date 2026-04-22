"use client";

import { ReactNode, HTMLAttributes } from "react";

interface GlassCardProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
  className?: string;
  variant?: "default" | "elevated" | "subtle";
}

export function GlassCard({ children, className = "", variant = "default", ...props }: GlassCardProps) {
  const variantClass = {
    default: "glass",
    elevated: "glass-elevated",
    subtle: "glass-subtle",
  }[variant];

  return (
    <div className={`rounded-2xl p-4 ${variantClass} ${className}`} {...props}>
      {children}
    </div>
  );
}
