"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "./auth-provider";
import { TermsAcceptance } from "./terms-acceptance";

export function TermsGate({ children }: { children: React.ReactNode }) {
  const { user, loading: authLoading } = useAuth();
  const [termsAccepted, setTermsAccepted] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);
  const supabase = createClient();

  useEffect(() => {
    const checkTermsAcceptance = async () => {
      if (!user) {
        setLoading(false);
        return;
      }

      try {
        const { data } = await supabase
          .from("profiles")
          .select("terms_accepted_at")
          .eq("id", user.id)
          .maybeSingle();

        setTermsAccepted(!!data?.terms_accepted_at);
      } catch (error) {
        console.error("Failed to check terms acceptance:", error);
        // Default to showing terms if we can't check
        setTermsAccepted(false);
      }
      setLoading(false);
    };

    if (!authLoading) {
      checkTermsAcceptance();
    }
  }, [user, authLoading, supabase]);

  // Still loading auth or terms status
  if (authLoading || loading) {
    return <>{children}</>;
  }

  // No user (not logged in) - show normal content (will redirect to login)
  if (!user) {
    return <>{children}</>;
  }

  // User hasn't accepted terms - show acceptance screen
  if (termsAccepted === false) {
    return <TermsAcceptance onAccept={() => setTermsAccepted(true)} />;
  }

  // Terms accepted - show app
  return <>{children}</>;
}
