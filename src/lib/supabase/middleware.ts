import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function updateSession(request: NextRequest) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const pathname = request.nextUrl.pathname;

  // Skip Supabase during build if env vars missing
  if (!supabaseUrl || !supabaseAnonKey) {
    return NextResponse.next({ request });
  }

  let supabaseResponse = NextResponse.next({
    request,
  });

  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) =>
          request.cookies.set(name, value)
        );
        supabaseResponse = NextResponse.next({
          request,
        });
        cookiesToSet.forEach(({ name, value, options }) =>
          supabaseResponse.cookies.set(name, value, options)
        );
      },
    },
  });

  // Skip middleware for API routes
  if (pathname.startsWith("/api")) {
    return supabaseResponse;
  }

  const isAuthPage = pathname.startsWith("/auth");
  const isWaitlistPage = pathname === "/waitlist";
  const isWaitlistPendingPage = pathname === "/waitlist-pending";
  const isUpgradePage = pathname === "/upgrade";
  const isUpgradeSuccessPage = pathname === "/upgrade-success";
  const isReturnFromStripePage = pathname === "/return-from-stripe";

  // Public pages — bypass auth gate. Pages handle auth-aware logic themselves.
  if (
    isWaitlistPage ||
    isUpgradePage ||
    isUpgradeSuccessPage ||
    isReturnFromStripePage
  ) {
    return supabaseResponse;
  }

  // Refresh session if expired
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Unauthenticated users: allow auth pages, redirect others to waitlist
  if (!user) {
    if (isAuthPage) {
      return supabaseResponse;
    }
    const url = request.nextUrl.clone();
    url.pathname = "/waitlist";
    return NextResponse.redirect(url);
  }

  // Authenticated users: check if they're an allowed tester
  let hasAccess = false;
  try {
    const { data: allowedTester, error } = await supabase
      .from("allowed_testers")
      .select("id")
      .eq("email", user.email?.toLowerCase() || "")
      .maybeSingle();

    hasAccess = !error && !!allowedTester;
  } catch {
    hasAccess = false;
  }

  // Cohort 1 paid members: also have access via active subscription.
  // Only checked if not already allowed via testers — testers skip the DB roundtrip.
  if (!hasAccess) {
    try {
      const { data: profile } = await supabase
        .from("profiles")
        .select("subscription_status")
        .eq("id", user.id)
        .maybeSingle();
      const status = profile?.subscription_status;
      if (status === "active" || status === "trialing") {
        hasAccess = true;
      }
    } catch {
      // Leave hasAccess false; user lands on waitlist-pending.
    }
  }

  // Users with access: redirect away from waitlist/auth pages to app
  if (hasAccess) {
    if (isAuthPage || isWaitlistPage || isWaitlistPendingPage) {
      const url = request.nextUrl.clone();
      url.pathname = "/coach";
      return NextResponse.redirect(url);
    }
    return supabaseResponse;
  }

  // Not allowed: let them stay on waitlist-pending, redirect others there
  if (isWaitlistPendingPage) {
    return supabaseResponse;
  }

  const url = request.nextUrl.clone();
  url.pathname = "/waitlist-pending";
  return NextResponse.redirect(url);
}
