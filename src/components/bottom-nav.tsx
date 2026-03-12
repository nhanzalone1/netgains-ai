"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ClipboardList, Utensils, Sparkles, TrendingUp } from "lucide-react";
import { motion } from "framer-motion";
import { useAuth } from "@/components/auth-provider";
import { hasUnreadCoachMessages, markCoachAsViewed } from "@/lib/coach-notification";

const navItems = [
  { href: "/log", label: "Log", icon: ClipboardList },
  { href: "/nutrition", label: "Nutrition", icon: Utensils },
  { href: "/coach", label: "Coach", icon: Sparkles },
  { href: "/stats", label: "Stats", icon: TrendingUp },
];

export function BottomNav() {
  const pathname = usePathname();
  const { user } = useAuth();
  const [hasUnread, setHasUnread] = useState(false);

  // Check for unread messages
  const checkUnread = useCallback(async () => {
    if (!user?.id) return;
    const unread = await hasUnreadCoachMessages(user.id);
    setHasUnread(unread);
  }, [user?.id]);

  // Check on mount and when events fire
  useEffect(() => {
    if (!user?.id) return;

    // Initial check
    checkUnread();

    // Listen for new coach messages
    const handleNewMessage = () => checkUnread();
    window.addEventListener('coach-message-added', handleNewMessage);

    // Check when page becomes visible (returning from background)
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        checkUnread();
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);

    // Periodic check for new messages (catches server-saved responses)
    // Only runs when not on coach page to catch responses from navigating away
    const intervalId = setInterval(() => {
      if (pathname !== '/coach') {
        checkUnread();
      }
    }, 5000); // Check every 5 seconds

    return () => {
      window.removeEventListener('coach-message-added', handleNewMessage);
      document.removeEventListener('visibilitychange', handleVisibility);
      clearInterval(intervalId);
    };
  }, [user?.id, checkUnread, pathname]);

  // Mark as viewed when navigating to coach page
  useEffect(() => {
    if (pathname === '/coach' && user?.id && hasUnread) {
      markCoachAsViewed(user.id);
      setHasUnread(false);
    }
  }, [pathname, user?.id, hasUnread]);

  return (
    <nav className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50">
      <div className="flex items-center gap-2 px-6 py-3 rounded-full glass-elevated">
        {navItems.map(({ href, label, icon: Icon }) => {
          const isActive = pathname === href || (href === "/log" && pathname === "/");
          const showBadge = href === "/coach" && hasUnread && !isActive;

          return (
            <Link key={href} href={href}>
              <motion.div
                data-tour={label.toLowerCase()}
                whileTap={{ scale: 0.95 }}
                className={`relative flex flex-col items-center justify-center min-w-[64px] min-h-[44px] px-4 py-2 rounded-2xl transition-all duration-200 ${
                  isActive
                    ? "text-primary bg-primary/10"
                    : "text-muted-foreground"
                }`}
                style={isActive ? {
                  boxShadow: "0 0 20px rgba(6, 182, 212, 0.4), 0 0 40px rgba(6, 182, 212, 0.2)"
                } : undefined}
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
                    className="absolute -top-1 -right-1 w-3 h-3 bg-primary rounded-full badge-pulse"
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
