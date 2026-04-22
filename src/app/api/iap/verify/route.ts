// Server-side receipt verification for StoreKit 2 purchases.
//
// Client calls this immediately after a successful purchase (or when restoring)
// with the transactionId returned from the native plugin. We verify the
// transaction with Apple's App Store Server API, then upsert the subscription
// row. The client must NOT be trusted to claim tier on its own.

import { createClient } from "@/lib/supabase/server";
import { createClient as createAdminClient } from "@supabase/supabase-js";
import { verifyTransaction, getSubscriptionStatus } from "@/lib/app-store-server-api";
import { SUBSCRIPTION_TIERS, PRODUCT_TO_TIER } from "@/lib/constants";

function getSupabaseAdmin() {
  return createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const transactionId: string | undefined = body?.transactionId;

    if (!transactionId) {
      return Response.json({ error: "transactionId required" }, { status: 400 });
    }

    const transaction = await verifyTransaction(transactionId);
    const tier = PRODUCT_TO_TIER[transaction.productId] ?? SUBSCRIPTION_TIERS.FREE;

    if (tier === SUBSCRIPTION_TIERS.FREE) {
      return Response.json(
        { error: `Unknown product ID: ${transaction.productId}` },
        { status: 400 }
      );
    }

    // Cross-check with the subscription status endpoint so a revoked/expired
    // subscription doesn't get activated just because the transaction exists.
    const status = await getSubscriptionStatus(transaction.originalTransactionId);
    const isActive = status?.status === 1 || status?.status === 3 || status?.status === 4;
    // 1 = active, 3 = retry (billing retry), 4 = grace period

    const expiresAt = status?.transaction.expiresDate ?? transaction.expiresDate;

    const admin = getSupabaseAdmin();
    const { error: upsertError } = await admin.from("subscriptions").upsert(
      {
        user_id: user.id,
        tier: isActive ? tier : SUBSCRIPTION_TIERS.FREE,
        product_id: transaction.productId,
        apple_transaction_id: transaction.transactionId,
        apple_original_transaction_id: transaction.originalTransactionId,
        expires_at: expiresAt ? new Date(expiresAt).toISOString() : null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id" }
    );

    if (upsertError) {
      console.error("[iap/verify] upsert failed:", upsertError);
      return Response.json({ error: "Database error" }, { status: 500 });
    }

    return Response.json({
      success: true,
      tier: isActive ? tier : SUBSCRIPTION_TIERS.FREE,
      expiresAt: expiresAt ? new Date(expiresAt).toISOString() : null,
      active: isActive,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[iap/verify] error:", message);
    return Response.json({ error: message }, { status: 500 });
  }
}
