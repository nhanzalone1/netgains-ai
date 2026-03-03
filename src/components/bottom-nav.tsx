"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ClipboardList, Utensils, Sparkles, TrendingUp } from "lucide-react";
import { motion } from "framer-motion";
import { useAuth } from "@/components/auth-provider";
import { hasPendingCoachMessage, clearPendingCoachMessage } from "@/lib/coach-notification";

const navItems = [
  { href: "/log", label: "Log", icon: ClipboardList },
  { href: "/nutrition", label: "Nutrition", icon: Utensils },
  { href: "/coach", label: "Coach", icon: Sparkles },
  { href: "/stats", label: "Stats", icon: TrendingUp },
];

export function BottomNav() {
  const pathname = usePathname();
  const { user } = useAuth();
  const [hasPending, setHasPending] = useState(false);

  // Check for pending coach messages
  useEffect(() => {
    if (!user?.id) return;

    const checkPending = () => {
      setHasPending(hasPendingCoachMessage(user.id));
    };

    // Initial check
    checkPending();

    // Listen for new pending messages
    const handlePending = () => checkPending();
    window.addEventListener('coach-message-pending', handlePending);

    // Also check on storage changes (for cross-tab sync)
    const handleStorage = (e: StorageEvent) => {
      if (e.key?.startsWith('netgains-pending-coach-message-')) {
        checkPending();
      }
    };
    window.addEventListener('storage', handleStorage);

    return () => {
      window.removeEventListener('coach-message-pending', handlePending);
      window.removeEventListener('storage', handleStorage);
    };
  }, [user?.id]);

  // Clear badge when navigating to coach page
  useEffect(() => {
    if (pathname === '/coach' && user?.id && hasPending) {
      clearPendingCoachMessage(user.id);
      setHasPending(false);
    }
  }, [pathname, user?.id, hasPending]);

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
          const isActive = pathname === href || (href === "/log" && pathname === "/");
          const showBadge = href === "/coach" && hasPending && !isActive;

          return (
            <Link key={href} href={href}>
              <motion.div
                whileTap={{ scale: 0.95 }}
                className={`relative flex flex-col items-center justify-center min-w-[64px] min-h-[44px] px-4 py-2 rounded-2xl transition-colors ${
                  isActive
                    ? "text-primary bg-primary/10"
                    : "text-muted-foreground"
                }`}
              >
                <Icon className="w-6 h-6" strokeWidth={isActive ? 2.5 : 2} />
                <span className="text-[10px] mt-1 font-semibold uppercase tracking-wide">
                  {label}
                </span>
                {/* Notification badge */}
                {showBadge && (
                  <motion.div
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    className="absolute -top-1 -right-1 w-3 h-3 bg-primary rounded-full"
                  />
                )}
              </motion.div>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
