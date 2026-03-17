"use client";

import { createContext, useContext, useEffect, useState, useCallback, useMemo, useRef } from "react";
import { User, AuthChangeEvent } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";
import { useRouter, usePathname } from "next/navigation";

type AuthContextType = {
  user: User | null;
  loading: boolean;
  sessionError: boolean;
};

const AuthContext = createContext<AuthContextType>({
  user: null,
  loading: true,
  sessionError: false,
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [sessionError, setSessionError] = useState(false);
  const supabaseRef = useRef(createClient());
  const router = useRouter();
  const pathname = usePathname();

  // Handle session expiry and auth state changes
  const handleAuthChange = useCallback((event: AuthChangeEvent, session: { user: User } | null) => {
    console.log('[Auth] State change:', event);

    if (event === 'SIGNED_OUT' || event === 'TOKEN_REFRESHED') {
      setSessionError(false);
    }

    if (event === 'SIGNED_OUT') {
      setUser(null);
      // Redirect to waitlist if on protected route
      const isProtectedRoute = pathname?.startsWith('/coach') ||
                               pathname?.startsWith('/log') ||
                               pathname?.startsWith('/nutrition') ||
                               pathname?.startsWith('/stats') ||
                               pathname?.startsWith('/program');
      if (isProtectedRoute) {
        router.push('/waitlist');
      }
    } else {
      setUser(session?.user ?? null);
    }

    setLoading(false);
  }, [pathname, router]);

  useEffect(() => {
    const supabase = supabaseRef.current;

    // Initial session check
    supabase.auth.getSession().then(({ data: { session }, error }) => {
      if (error) {
        console.error('[Auth] Session error:', error.message);
        setSessionError(true);
        setUser(null);
      } else {
        setUser(session?.user ?? null);
      }
      setLoading(false);
    });

    // Listen for auth state changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(handleAuthChange);

    // Periodic session refresh (every 10 minutes)
    const refreshInterval = setInterval(async () => {
      const { data: { session }, error } = await supabase.auth.getSession();
      if (error || !session) {
        console.warn('[Auth] Session refresh failed:', error?.message);
        setSessionError(true);
        setUser(null);
      }
    }, 10 * 60 * 1000);

    return () => {
      subscription.unsubscribe();
      clearInterval(refreshInterval);
    };
  }, [handleAuthChange]);

  const value = useMemo(() => ({ user, loading, sessionError }), [user, loading, sessionError]);

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
