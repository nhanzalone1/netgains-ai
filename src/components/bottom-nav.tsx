"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Dumbbell, ClipboardList, TrendingUp, Sparkles } from "lucide-react";
import { motion } from "framer-motion";

const navItems = [
  { href: "/program", label: "Program", icon: Dumbbell },
  { href: "/log", label: "Log", icon: ClipboardList },
  { href: "/stats", label: "Stats", icon: TrendingUp },
  { href: "/coach", label: "Coach", icon: Sparkles },
];

export function BottomNav() {
  const pathname = usePathname();

  return (
    <nav className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50">
      <div
        className="flex items-center gap-2 px-6 py-3 rounded-full"
        style={{
          background: "rgba(26, 26, 36, 0.8)",
          backdropFilter: "blur(24px)",
          WebkitBackdropFilter: "blur(24px)",
          border: "1px solid rgba(255, 255, 255, 0.05)",
          boxShadow: "0 8px 32px rgba(0, 0, 0, 0.4)",
        }}
      >
        {navItems.map(({ href, label, icon: Icon }) => {
          const isActive = pathname === href || (href === "/program" && pathname === "/");
          return (
            <Link key={href} href={href}>
              <motion.div
                whileTap={{ scale: 0.95 }}
                className={`flex flex-col items-center justify-center min-w-[64px] min-h-[44px] px-4 py-2 rounded-2xl transition-colors ${
                  isActive
                    ? "text-primary bg-primary/10"
                    : "text-muted-foreground"
                }`}
              >
                <Icon className="w-6 h-6" strokeWidth={isActive ? 2.5 : 2} />
                <span className="text-[10px] mt-1 font-semibold uppercase tracking-wide">
                  {label}
                </span>
              </motion.div>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
