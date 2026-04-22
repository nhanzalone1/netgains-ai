// App Store Server Notifications V2 webhook.
//
// Configure the URL in App Store Connect → App Information →
//   "App Store Server Notifications" → Production Server URL.
//
// Docs: https://developer.apple.com/documentation/appstoreservernotifications
//
// Apple POSTs a JWS-signed envelope. We verify the envelope, decode its
// signedPayload, then decode the nested signedTransactionInfo / signedRenewalInfo,
// and update the subscriptions table accordingly.

import { createClient } from "@supabase/supabase-js";
import {
  decodeAndVerifySignedPayload,
  type JWSTransactionDecodedPayload,
  type JWSRenewalInfoDecodedPayload,
  type AppStoreEnvironment,
} from "@/lib/app-store-server-api";
import { SUBSCRIPTION_TIERS, PRODUCT_TO_TIER } from "@/lib/constants";

function getSupabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

interface NotificationPayload {
  notificationType:
    | "SUBSCRIBED"
    | "DID_RENEW"
    | "DID_FAIL_TO_RENEW"
    | "EXPIRED"
    | "GRACE_PERIOD_EXPIRED"
    | "DID_CHANGE_RENEWAL_STATUS"
    | "DID_CHANGE_RENEWAL_PREF"
    | "OFFER_REDEEMED"
    | "PRICE_INCREASE"
    | "REFUND"
    | "REFUND_DECLINED"
    | "REFUND_REVERSED"
    | "REVOKE"
    | "CONSUMPTION_REQUEST"
    | "RENEWAL_EXTENDED"
    | "RENEWAL_EXTENSION"
    | "TEST";
  subtype?: string;
  notificationUUID: string;
  version: string;
  signedDate: number;
  data?: {
    appAppleId?: number;
    bundleId: string;
    bundleVersion?: string;
    environment: AppStoreEnvironment;
    signedTransactionInfo?: string;
    signedRenewalInfo?: string;
    status?: 1 | 2 | 3 | 4 | 5;
  };
  summary?: Record<string, unknown>;
}

// Active statuses from Apple's subscription-status docs:
// 1 = active, 2 = expired, 3 = billing retry, 4 = grace period, 5 = revoked
function isActiveStatus(status?: number): boolean {
  return status === 1 || status === 3 || status === 4;
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const signedPayload: string | undefined = body?.signedPayload;

    if (!signedPayload) {
      return Response.json({ error: "Missing signedPayload" }, { status: 400 });
    }

    const notification = await decodeAndVerifySignedPayload<NotificationPayload>(signedPayload);

    console.log("[app-store webhook] received:", {
      type: notification.notificationType,
      subtype: notification.subtype,
      uuid: notification.notificationUUID,
      env: notification.data?.environment,
    });

    if (notification.notificationType === "TEST") {
      return Response.json({ success: true, test: true });
    }

    const data = notification.data;
    if (!data?.signedTransactionInfo) {
      // Some notifications (e.g., CONSUMPTION_REQUEST) don't carry transaction info.
      return Response.json({ success: true, skipped: true });
    }

    const transaction = await decodeAndVerifySignedPayload<JWSTransactionDecodedPayload>(
      data.signedTransactionInfo
    );

    // Bundle ID check — Apple could technically post to any URL if someone tried
    // a replay; we only accept our bundle.
    const expectedBundleId = process.env.APPLE_BUNDLE_ID;
    if (expectedBundleId && transaction.bundleId !== expectedBundleId) {
      console.warn("[app-store webhook] bundle mismatch:", transaction.bundleId);
      return Response.json({ error: "Bundle mismatch" }, { status: 400 });
    }

    const admin = getSupabaseAdmin();

    // Find the user who owns this subscription. We keyed by original_transaction_id
    // when we first verified the purchase, so look them up that way.
    const { data: existing, error: lookupError } = await admin
      .from("subscriptions")
      .select("user_id")
      .eq("apple_original_transaction_id", transaction.originalTransactionId)
      .maybeSingle();

    if (lookupError) {
      console.error("[app-store webhook] lookup failed:", lookupError);
      return Response.json({ error: "Database error" }, { status: 500 });
    }

    if (!existing) {
      // This can happen if a notification arrives before /api/iap/verify runs.
      // Log and return 200 so Apple doesn't retry forever; the client-side
      // verify call will sync the state on the next app open.
      console.warn("[app-store webhook] no user for originalTransactionId:", transaction.originalTransactionId);
      return Response.json({ success: true, unmatched: true });
    }

    const userId = existing.user_id;
    const productTier = PRODUCT_TO_TIER[transaction.productId] ?? SUBSCRIPTION_TIERS.FREE;

    let nextTier: string;
    let nextExpiresAt: string | null;

    switch (notification.notificationType) {
      case "SUBSCRIBED":
      case "DID_RENEW":
      case "OFFER_REDEEMED":
      case "RENEWAL_EXTENDED":
      case "RENEWAL_EXTENSION": {
        nextTier = productTier;
        nextExpiresAt = transaction.expiresDate
          ? new Date(transaction.expiresDate).toISOString()
          : null;
        break;
      }

      case "DID_CHANGE_RENEWAL_STATUS":
      case "DID_CHANGE_RENEWAL_PREF":
      case "PRICE_INCREASE":
      case "DID_FAIL_TO_RENEW": {
        // User still has access until expiration; status tells us where we are.
        nextTier = isActiveStatus(data.status) ? productTier : SUBSCRIPTION_TIERS.FREE;
        nextExpiresAt = transaction.expiresDate
          ? new Date(transaction.expiresDate).toISOString()
          : null;
        break;
      }

      case "EXPIRED":
      case "GRACE_PERIOD_EXPIRED":
      case "REVOKE":
      case "REFUND": {
        nextTier = SUBSCRIPTION_TIERS.FREE;
        nextExpiresAt = new Date().toISOString();
        break;
      }

      case "REFUND_DECLINED":
      case "REFUND_REVERSED": {
        // Keep current access.
        nextTier = productTier;
        nextExpiresAt = transaction.expiresDate
          ? new Date(transaction.expiresDate).toISOString()
          : null;
        break;
      }

      default:
        console.log("[app-store webhook] unhandled type:", notification.notificationType);
        return Response.json({ success: true, unhandled: true });
    }

    // Optional: pull renewal info for logging / future grace-period handling.
    if (data.signedRenewalInfo) {
      try {
        const renewal = await decodeAndVerifySignedPayload<JWSRenewalInfoDecodedPayload>(
          data.signedRenewalInfo
        );
        console.log("[app-store webhook] renewal info:", {
          autoRenewStatus: renewal.autoRenewStatus,
          expirationIntent: renewal.expirationIntent,
        });
      } catch (e) {
        console.warn("[app-store webhook] failed to decode renewal info:", e);
      }
    }

    const { error: updateError } = await admin
      .from("subscriptions")
      .update({
        tier: nextTier,
        product_id: transaction.productId,
        apple_transaction_id: transaction.transactionId,
        expires_at: nextExpiresAt,
        updated_at: new Date().toISOString(),
      })
      .eq("user_id", userId);

    if (updateError) {
      console.error("[app-store webhook] update failed:", updateError);
      return Response.json({ error: "Database error" }, { status: 500 });
    }

    return Response.json({ success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[app-store webhook] error:", message);
    // Return 500 so Apple retries; we don't want to silently drop bad payloads.
    return Response.json({ error: message }, { status: 500 });
  }
}

export async function GET() {
  return Response.json({ error: "Method not allowed" }, { status: 405 });
}
