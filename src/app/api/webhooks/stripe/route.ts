import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// Force Node runtime — Stripe SDK uses Node Buffer for signature verification.
// Force dynamic — webhooks must never be cached/prerendered.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function getStripe() {
  return new Stripe(process.env.STRIPE_SECRET_KEY!, {
    apiVersion: "2024-12-18.acacia",
  });
}

function getServiceClient(): SupabaseClient {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );
}

export async function POST(req: NextRequest) {
  const sig = req.headers.get("stripe-signature");
  if (!sig) {
    return NextResponse.json({ error: "Missing signature" }, { status: 400 });
  }

  // CRITICAL: raw body, NOT req.json(). Stripe signs the literal request bytes.
  const rawBody = await req.text();
  const stripe = getStripe();

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(
      rawBody,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET!
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[stripe-webhook] signature verification failed:", message);
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  const supabase = getServiceClient();

  try {
    switch (event.type) {
      case "checkout.session.completed":
        await handleCheckoutCompleted(supabase, stripe, event.data.object as Stripe.Checkout.Session);
        break;
      case "customer.subscription.created":
        await handleSubscriptionCreated(supabase, event.data.object as Stripe.Subscription);
        break;
      case "customer.subscription.updated":
        await handleSubscriptionUpdated(supabase, event.data.object as Stripe.Subscription);
        break;
      case "customer.subscription.deleted":
        await handleSubscriptionDeleted(supabase, event.data.object as Stripe.Subscription);
        break;
      case "invoice.payment_succeeded":
        await handleInvoicePaymentSucceeded(supabase, stripe, event.data.object as Stripe.Invoice);
        break;
      case "invoice.payment_failed":
        await handleInvoicePaymentFailed(supabase, event.data.object as Stripe.Invoice);
        break;
      default:
        // Decision #1: silently 200 unknown event types so Stripe doesn't retry.
        console.log(`[stripe-webhook] unhandled event: ${event.type}`);
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error(`[stripe-webhook] handler error for ${event.type}:`, message);
    // Return 500 so Stripe retries the delivery.
    return NextResponse.json({ error: "Handler error" }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}

async function handleCheckoutCompleted(
  supabase: SupabaseClient,
  stripe: Stripe,
  session: Stripe.Checkout.Session
) {
  // Resolve the user_id. Prefer client_reference_id; fall back to metadata.user_id
  // (we set both in create-checkout-session/route.ts as defense in depth).
  const userId =
    session.client_reference_id ??
    (session.metadata?.user_id as string | undefined);

  if (!userId) {
    console.error(
      "[stripe-webhook] checkout.session.completed missing user_id",
      { session_id: session.id }
    );
    return;
  }

  const customerId =
    typeof session.customer === "string"
      ? session.customer
      : session.customer?.id ?? null;
  const subscriptionId =
    typeof session.subscription === "string"
      ? session.subscription
      : session.subscription?.id ?? null;
  const betaCode = (session.metadata?.beta_code as string | undefined) ?? null;

  // Fetch the subscription to get the live status + price ID.
  // The session itself doesn't include subscription.status until expanded.
  let status = "active";
  let priceId: string | null = null;
  if (subscriptionId) {
    const sub = await stripe.subscriptions.retrieve(subscriptionId);
    status = sub.status;
    priceId = sub.items.data[0]?.price.id ?? null;
  }

  // Decision #5: write beta_code to profiles for cohort attribution that
  // survives ON DELETE SET NULL on beta_codes.used_by.
  // Decision #3: subscribed_at set on first activation only (this handler).
  const { error } = await supabase
    .from("profiles")
    .update({
      stripe_customer_id: customerId,
      stripe_subscription_id: subscriptionId,
      subscription_status: status,
      subscription_price_id: priceId,
      subscribed_at: new Date().toISOString(),
      beta_code: betaCode,
    })
    .eq("id", userId);

  if (error) {
    console.error("[stripe-webhook] checkout.session.completed update error:", error);
    throw error;
  }
}

async function handleSubscriptionCreated(
  supabase: SupabaseClient,
  sub: Stripe.Subscription
) {
  // Self-healing: try matching by stripe_customer_id first (set by
  // checkout.session.completed if it's already run). If 0 rows match, fall
  // back to sub.metadata.user_id (set by create-checkout-session via
  // subscription_data.metadata) and backfill the customer/subscription IDs
  // onto the profile so subsequent webhooks have a row to match.
  const customerId =
    typeof sub.customer === "string" ? sub.customer : sub.customer.id;
  const priceId = sub.items.data[0]?.price.id ?? null;

  const { error, count } = await supabase
    .from("profiles")
    .update(
      {
        stripe_customer_id: customerId,
        stripe_subscription_id: sub.id,
        subscription_status: sub.status,
        subscription_price_id: priceId,
      },
      { count: "exact" }
    )
    .eq("stripe_customer_id", customerId);

  if (error) {
    console.error("[stripe-webhook] subscription.created update error:", error);
    throw error;
  }

  if (count === 0) {
    const userId = sub.metadata?.user_id as string | undefined;
    if (!userId) {
      console.error(
        "[stripe-webhook] subscription.created: 0 rows matched and no user_id in sub.metadata",
        { customerId, sub_id: sub.id }
      );
      return;
    }
    const { error: fallbackErr } = await supabase
      .from("profiles")
      .update({
        stripe_customer_id: customerId,
        stripe_subscription_id: sub.id,
        subscription_status: sub.status,
        subscription_price_id: priceId,
      })
      .eq("id", userId);
    if (fallbackErr) {
      console.error("[stripe-webhook] subscription.created fallback error:", fallbackErr);
      throw fallbackErr;
    }
  }
}

async function handleSubscriptionUpdated(
  supabase: SupabaseClient,
  sub: Stripe.Subscription
) {
  // Status sync, self-healing on race with checkout.session.completed.
  // If 0 rows match by stripe_customer_id, fall back to sub.metadata.user_id
  // and backfill IDs so the profile is recoverable on the next webhook.
  const customerId =
    typeof sub.customer === "string" ? sub.customer : sub.customer.id;

  const { error, count } = await supabase
    .from("profiles")
    .update(
      {
        stripe_customer_id: customerId,
        stripe_subscription_id: sub.id,
        subscription_status: sub.status,
      },
      { count: "exact" }
    )
    .eq("stripe_customer_id", customerId);

  if (error) {
    console.error("[stripe-webhook] subscription.updated update error:", error);
    throw error;
  }

  if (count === 0) {
    const userId = sub.metadata?.user_id as string | undefined;
    if (!userId) {
      console.error(
        "[stripe-webhook] subscription.updated: 0 rows matched and no user_id in sub.metadata",
        { customerId, sub_id: sub.id }
      );
      return;
    }
    const { error: fallbackErr } = await supabase
      .from("profiles")
      .update({
        stripe_customer_id: customerId,
        stripe_subscription_id: sub.id,
        subscription_status: sub.status,
      })
      .eq("id", userId);
    if (fallbackErr) {
      console.error("[stripe-webhook] subscription.updated fallback error:", fallbackErr);
      throw fallbackErr;
    }
  }
}

async function handleSubscriptionDeleted(
  supabase: SupabaseClient,
  sub: Stripe.Subscription
) {
  // Cancellation took effect (period ended OR immediate cancel).
  // Decision #2: do NOT revert beta_codes.used_by — slot is forfeit (refund-fraud guard).
  // Keep stripe_customer_id and stripe_subscription_id for audit trail; only flip status.
  const customerId =
    typeof sub.customer === "string" ? sub.customer : sub.customer.id;

  const { error } = await supabase
    .from("profiles")
    .update({
      subscription_status: "canceled",
    })
    .eq("stripe_customer_id", customerId);

  if (error) {
    console.error("[stripe-webhook] subscription.deleted update error:", error);
    throw error;
  }
}

async function handleInvoicePaymentSucceeded(
  supabase: SupabaseClient,
  stripe: Stripe,
  invoice: Stripe.Invoice
) {
  // Renewal succeeded. Refresh subscription_status (likely 'active').
  // Decision #3: do NOT touch subscribed_at — that's first-activation only.
  const customerId =
    typeof invoice.customer === "string"
      ? invoice.customer
      : invoice.customer?.id ?? null;
  if (!customerId) return;

  const subscriptionId =
    typeof invoice.subscription === "string"
      ? invoice.subscription
      : invoice.subscription?.id ?? null;
  if (!subscriptionId) return;

  // Pull live status from Stripe rather than guessing from the invoice.
  const sub = await stripe.subscriptions.retrieve(subscriptionId);

  const { error } = await supabase
    .from("profiles")
    .update({
      subscription_status: sub.status,
    })
    .eq("stripe_customer_id", customerId);

  if (error) {
    console.error("[stripe-webhook] invoice.payment_succeeded update error:", error);
    throw error;
  }
}

async function handleInvoicePaymentFailed(
  supabase: SupabaseClient,
  invoice: Stripe.Invoice
) {
  // Decision #4: log-only. No DB write — Stripe will retry per dunning config,
  // and the resulting customer.subscription.updated will flip status to 'past_due'.
  // Log line includes user_id, customer_id, subscription_id, attempt_count, amount_due
  // for support audit. Vercel retains console output ~24h.
  const customerId =
    typeof invoice.customer === "string"
      ? invoice.customer
      : invoice.customer?.id ?? null;
  const subscriptionId =
    typeof invoice.subscription === "string"
      ? invoice.subscription
      : invoice.subscription?.id ?? null;
  const attemptCount = invoice.attempt_count ?? 0;

  // Look up our user_id from the customer mapping (best-effort).
  let userId: string | null = null;
  if (customerId) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("id")
      .eq("stripe_customer_id", customerId)
      .maybeSingle();
    userId = profile?.id ?? null;
  }

  console.log(
    "[stripe-webhook] invoice.payment_failed",
    {
      user_id: userId,
      customer_id: customerId,
      subscription_id: subscriptionId,
      attempt_count: attemptCount,
      amount_due: invoice.amount_due,
      currency: invoice.currency,
    }
  );
}
