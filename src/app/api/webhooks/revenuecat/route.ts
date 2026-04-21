// RevenueCat Webhook Handler
// Receives subscription events and syncs to Supabase

import { createClient } from "@supabase/supabase-js";
import { SUBSCRIPTION_TIERS } from "@/lib/constants";

// Use service role client to bypass RLS
function getSupabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

// RevenueCat webhook event types
type RevenueCatEventType =
  | "INITIAL_PURCHASE"
  | "RENEWAL"
  | "CANCELLATION"
  | "UNCANCELLATION"
  | "EXPIRATION"
  | "BILLING_ISSUE"
  | "PRODUCT_CHANGE"
  | "SUBSCRIBER_ALIAS"
  | "SUBSCRIPTION_PAUSED"
  | "TRANSFER"
  | "NON_RENEWING_PURCHASE"
  | "SUBSCRIPTION_EXTENDED"
  | "TEST";

interface RevenueCatWebhookEvent {
  api_version: string;
  event: {
    type: RevenueCatEventType;
    id: string;
    app_user_id: string; // This is our Supabase user.id
    original_app_user_id: string;
    product_id: string;
    entitlement_ids: string[] | null;
    period_type: "TRIAL" | "INTRO" | "NORMAL";
    purchased_at_ms: number;
    expiration_at_ms: number | null;
    environment: "SANDBOX" | "PRODUCTION";
    store: "APP_STORE" | "MAC_APP_STORE" | "PLAY_STORE" | "AMAZON" | "STRIPE";
    transaction_id: string;
    original_transaction_id: string;
    is_family_share: boolean;
    country_code: string;
    currency: string;
    price: number;
    price_in_purchased_currency: number;
  };
}

// Map product IDs to tiers
const PRODUCT_TO_TIER: Record<string, string> = {
  "com.netgainsai.basic.monthly": SUBSCRIPTION_TIERS.BASIC,
  "com.netgainsai.premium.monthly": SUBSCRIPTION_TIERS.PREMIUM,
};

export async function POST(request: Request) {
  try {
    // Verify webhook secret
    const authHeader = request.headers.get("Authorization");
    const expectedSecret = `Bearer ${process.env.REVENUECAT_WEBHOOK_SECRET}`;

    if (!process.env.REVENUECAT_WEBHOOK_SECRET || authHeader !== expectedSecret) {
      console.error("[RevenueCat Webhook] Unauthorized request");
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body: RevenueCatWebhookEvent = await request.json();
    const event = body.event;

    console.log("[RevenueCat Webhook] Received event:", {
      type: event.type,
      user_id: event.app_user_id,
      product_id: event.product_id,
      environment: event.environment,
    });

    // Skip sandbox events in production (optional - enable for testing)
    // if (process.env.NODE_ENV === "production" && event.environment === "SANDBOX") {
    //   console.log("[RevenueCat Webhook] Skipping sandbox event in production");
    //   return Response.json({ success: true, skipped: true });
    // }

    // Skip TEST events
    if (event.type === "TEST") {
      console.log("[RevenueCat Webhook] Test event received - webhook configured correctly");
      return Response.json({ success: true, test: true });
    }

    const supabase = getSupabaseAdmin();
    const userId = event.app_user_id;

    // Validate user exists in our system
    if (!userId || userId.startsWith("$RCAnonymousID:")) {
      console.warn("[RevenueCat Webhook] Anonymous or missing user ID:", userId);
      // Still process but log warning - might need manual reconciliation
    }

    // Handle different event types
    switch (event.type) {
      case "INITIAL_PURCHASE":
      case "RENEWAL":
      case "UNCANCELLATION":
      case "PRODUCT_CHANGE":
      case "SUBSCRIPTION_EXTENDED": {
        // Active subscription - upsert with new tier
        const tier = PRODUCT_TO_TIER[event.product_id] || SUBSCRIPTION_TIERS.FREE;
        const expiresAt = event.expiration_at_ms
          ? new Date(event.expiration_at_ms).toISOString()
          : null;

        const { error } = await supabase
          .from("subscriptions")
          .upsert(
            {
              user_id: userId,
              tier,
              product_id: event.product_id,
              apple_transaction_id: event.transaction_id,
              apple_original_transaction_id: event.original_transaction_id,
              expires_at: expiresAt,
              updated_at: new Date().toISOString(),
            },
            {
              onConflict: "user_id",
            }
          );

        if (error) {
          console.error("[RevenueCat Webhook] Failed to upsert subscription:", error);
          return Response.json({ error: "Database error" }, { status: 500 });
        }

        console.log("[RevenueCat Webhook] Subscription updated:", {
          userId,
          tier,
          expiresAt,
          eventType: event.type,
        });
        break;
      }

      case "EXPIRATION": {
        // Subscription has fully expired - downgrade to free
        const { error } = await supabase
          .from("subscriptions")
          .update({
            tier: SUBSCRIPTION_TIERS.FREE,
            expires_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq("user_id", userId);

        if (error) {
          console.error("[RevenueCat Webhook] Failed to expire subscription:", error);
          return Response.json({ error: "Database error" }, { status: 500 });
        }

        console.log("[RevenueCat Webhook] Subscription expired:", { userId });
        break;
      }

      case "CANCELLATION": {
        // User cancelled but still has access until expiration
        // Just log - don't change tier yet
        console.log("[RevenueCat Webhook] Subscription cancelled (still active until expiry):", {
          userId,
          expiresAt: event.expiration_at_ms
            ? new Date(event.expiration_at_ms).toISOString()
            : null,
        });
        break;
      }

      case "BILLING_ISSUE": {
        // Log billing issue but don't change subscription yet
        // RevenueCat handles grace periods and will send EXPIRATION if unresolved
        console.warn("[RevenueCat Webhook] Billing issue for user:", userId);
        break;
      }

      case "SUBSCRIPTION_PAUSED": {
        // Android-only: subscription paused
        console.log("[RevenueCat Webhook] Subscription paused:", { userId });
        break;
      }

      case "TRANSFER":
      case "SUBSCRIBER_ALIAS": {
        // User account changes - log for audit
        console.log("[RevenueCat Webhook] Account event:", {
          type: event.type,
          userId,
          originalUserId: event.original_app_user_id,
        });
        break;
      }

      case "NON_RENEWING_PURCHASE": {
        // One-time purchase (not used in our tier system)
        console.log("[RevenueCat Webhook] Non-renewing purchase:", {
          userId,
          productId: event.product_id,
        });
        break;
      }

      default:
        console.log("[RevenueCat Webhook] Unhandled event type:", event.type);
    }

    return Response.json({ success: true });
  } catch (error) {
    console.error("[RevenueCat Webhook] Error processing webhook:", error);
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}

// Reject other methods
export async function GET() {
  return Response.json({ error: "Method not allowed" }, { status: 405 });
}
