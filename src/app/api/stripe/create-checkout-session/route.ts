import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";

interface RequestBody {
  user_id?: string;
  beta_code?: string;
}

export async function POST(req: NextRequest) {
  let body: RequestBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { user_id, beta_code } = body;

  if (!user_id || !beta_code) {
    return NextResponse.json(
      { error: "Missing user_id or beta_code" },
      { status: 400 }
    );
  }

  // 1. Verify the request is authenticated AND the session matches user_id.
  //    This prevents one logged-in user from creating a checkout session
  //    on someone else's behalf.
  const ssrSupabase = await createServerClient();
  const { data: { user: sessionUser } } = await ssrSupabase.auth.getUser();
  if (!sessionUser || sessionUser.id !== user_id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // 2. Already-subscribed guard.
  const { data: profile } = await ssrSupabase
    .from("profiles")
    .select("subscription_status")
    .eq("id", user_id)
    .maybeSingle();

  const status = profile?.subscription_status;
  if (status === "active" || status === "trialing") {
    return NextResponse.json(
      { error: "Already subscribed" },
      { status: 409 }
    );
  }

  // 3. Atomic beta-code claim using service role (beta_codes is RLS-locked).
  const adminSupabase = createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );

  const { data: claimedRows, error: claimError } = await adminSupabase
    .from("beta_codes")
    .update({ used_by: user_id, used_at: new Date().toISOString() })
    .eq("code", beta_code)
    .is("used_by", null)
    .select();

  if (claimError) {
    console.error("[create-checkout-session] beta_codes claim error:", claimError);
    return NextResponse.json(
      { error: "Could not validate beta code" },
      { status: 500 }
    );
  }

  if (!claimedRows || claimedRows.length === 0) {
    return NextResponse.json(
      { error: "Invalid or already-used beta code" },
      { status: 409 }
    );
  }

  // 4. Create Stripe Checkout Session.
  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
    apiVersion: "2024-12-18.acacia",
  });

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://netgainsai.com";

  try {
    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      line_items: [
        {
          price: process.env.STRIPE_PRICE_ID_COHORT_1!,
          quantity: 1,
        },
      ],
      client_reference_id: user_id,
      customer_email: sessionUser.email ?? undefined,
      metadata: {
        beta_code,
        cohort: "cohort_1",
        user_id,
      },
      success_url: `${appUrl}/upgrade-success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${appUrl}/upgrade?canceled=true`,
      allow_promotion_codes: true,
    });

    if (!session.url) {
      throw new Error("Stripe did not return a session URL");
    }

    return NextResponse.json({ url: session.url });
  } catch (err) {
    // Saga: if Stripe failed, revert the beta-code claim so the user can retry.
    console.error("[create-checkout-session] Stripe error:", err);
    await adminSupabase
      .from("beta_codes")
      .update({ used_by: null, used_at: null })
      .eq("code", beta_code)
      .eq("used_by", user_id);

    return NextResponse.json(
      { error: "Could not create checkout session" },
      { status: 500 }
    );
  }
}
