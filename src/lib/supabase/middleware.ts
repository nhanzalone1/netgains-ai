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

  // Allow waitlist page without any auth check
  if (isWaitlistPage) {
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
  let isAllowedTester = false;
  try {
    const { data: allowedTester, error } = await supabase
      .from("allowed_testers")
      .select("id")
      .eq("email", user.email?.toLowerCase() || "")
      .single();

    isAllowedTester = !error && !!allowedTester;
  } catch {
    isAllowedTester = false;
  }

  // Allowed testers: redirect away from waitlist/auth pages to app
  if (isAllowedTester) {
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
