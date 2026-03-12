"use client";

import { ReactNode } from "react";

interface GlassCardProps {
  children: ReactNode;
  className?: string;
  variant?: "default" | "elevated" | "subtle";
}

export function GlassCard({ children, className = "", variant = "default" }: GlassCardProps) {
  const variantClass = {
    default: "glass",
    elevated: "glass-elevated",
    subtle: "glass-subtle",
  }[variant];

  return (
    <div className={`rounded-2xl p-4 ${variantClass} ${className}`}>
      {children}
    </div>
  );
}
