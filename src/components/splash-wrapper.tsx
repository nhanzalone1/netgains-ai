"use client";

import { useState, useEffect } from "react";
import { AnimatedSplash } from "./animated-splash";

// Only show splash on native app (Capacitor) or first visit
function shouldShowSplash(): boolean {
  if (typeof window === "undefined") return false;

  // Check if running in Capacitor (native app)
  const isNative = !!(window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } })?.Capacitor?.isNativePlatform?.();

  // For native app, always show splash on app launch
  if (isNative) {
    const splashShown = sessionStorage.getItem("netgains-splash-shown");
    if (!splashShown) {
      sessionStorage.setItem("netgains-splash-shown", "true");
      return true;
    }
    return false;
  }

  // For web, don't show animated splash (too slow)
  return false;
}

export function SplashWrapper({ children }: { children: React.ReactNode }) {
  const [showSplash, setShowSplash] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    setShowSplash(shouldShowSplash());
  }, []);

  // Don't render anything until mounted (prevents hydration mismatch)
  if (!mounted) {
    return (
      <div style={{ backgroundColor: "#0f0f13", minHeight: "100vh" }}>
        {children}
      </div>
    );
  }

  if (showSplash) {
    return (
      <>
        <div style={{ visibility: "hidden" }}>{children}</div>
        <AnimatedSplash onComplete={() => setShowSplash(false)} duration={2000} />
      </>
    );
  }

  return <>{children}</>;
}
