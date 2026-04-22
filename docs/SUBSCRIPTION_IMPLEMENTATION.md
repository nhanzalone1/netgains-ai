# Subscription & Smart Routing Implementation

## Pricing Tiers

| Tier | Price | Messages/Day | Sonnet Ratio | Monthly Margin |
|------|-------|--------------|--------------|----------------|
| Free | $0 | 3 | 30% | -$0.21 |
| Basic | $6.99 | 15 | 30% | +$3.35 (56%) |
| Premium | $14.99 | 50 | 50% | +$1.21 (9%) |

## Architecture

In-app purchases use native **StoreKit 2** (iOS 15+) via a custom Capacitor plugin. No third-party billing SDKs. Server-side receipt verification talks directly to Apple's **App Store Server API**; subscription lifecycle events arrive via **App Store Server Notifications V2**.

```
┌───────────────────────────┐
│ Paywall (React)           │
│  purchaseProduct(id)      │
└──────────┬────────────────┘
           │
           ▼
┌───────────────────────────┐
│ StoreKit2Plugin (Swift)   │   ios/App/App/StoreKit2Plugin.swift
│  Product.purchase()       │
│  Transaction.updates      │
└──────────┬────────────────┘
           │ transactionId
           ▼
┌───────────────────────────┐
│ POST /api/iap/verify      │   src/app/api/iap/verify/route.ts
│  verifyTransaction(id)    │
└──────────┬────────────────┘
           │ HTTPS + JWT (ES256)
           ▼
┌───────────────────────────┐
│ App Store Server API      │
│  /inApps/v1/transactions  │
│  /inApps/v1/subscriptions │
└──────────┬────────────────┘
           │ signed JWS
           ▼
┌───────────────────────────┐
│ Supabase: subscriptions   │
│   (tier, expires_at, …)   │
└──────────┬────────────────┘
           │
           ▼
┌───────────────────────────┐
│ SubscriptionProvider      │   reads `subscriptions` on mount
│ (tier, messagesRemaining) │
└───────────────────────────┘

                 ┌─────────────────────────────────┐
Apple (async) ──►│ POST /api/webhooks/app-store     │  src/app/api/webhooks/app-store/route.ts
                 │  DID_RENEW, EXPIRED, REFUND, …  │
                 └─────────────────────────────────┘
```

## Key Files

### Native (iOS, Swift)
- `ios/App/App/StoreKit2Plugin.swift` — Capacitor plugin wrapping StoreKit 2. Starts a `Transaction.updates` listener on load to catch renewals, ask-to-buy approvals, and refunds.
- `ios/App/App/StoreKit2Plugin.m` — Capacitor `CAP_PLUGIN` registration macro.
- `ios/App/App/capacitor.config.json` — `packageClassList: ["StoreKit2Plugin"]`.
- `ios/App/Podfile` — `platform :ios, '15.0'` (StoreKit 2 requires iOS 15).

### Client (TypeScript)
- `src/lib/storekit.ts` — thin wrapper over the native plugin. Exports `purchaseProduct`, `restorePurchases`, `getCurrentEntitlements`, `onTransactionUpdated`.
- `src/lib/constants.ts` — `IAP_PRODUCTS`, `PRODUCT_IDS`, `PRODUCT_TO_TIER`, `DAILY_MESSAGE_LIMITS`, `SONNET_RATIO`.
- `src/components/paywall.tsx` — initiates purchase, POSTs `transactionId` to `/api/iap/verify`, then calls `refreshSubscription()`.
- `src/components/subscription-provider.tsx` — reads `subscriptions` table. No native SDK calls here; source of truth is server-side state.

### Server
- `src/lib/app-store-server-api.ts` — ES256 JWT signer, `verifyTransaction(transactionId)`, `getSubscriptionStatus(originalTransactionId)`, JWS signature verification for incoming notifications.
- `src/app/api/iap/verify/route.ts` — verifies a purchase with Apple and upserts the `subscriptions` row. Called client-side after every purchase and restore.
- `src/app/api/webhooks/app-store/route.ts` — App Store Server Notifications V2 handler. Processes renewals, expirations, refunds, revocations, etc.

### Tier enforcement
- `src/app/api/chat/route.ts` — reads `subscriptions.tier`, enforces `DAILY_MESSAGE_LIMITS` per tier, routes between Sonnet and Haiku based on `SONNET_RATIO`. Admins (`profiles.is_admin`) bypass limits.

## Database

```sql
CREATE TABLE IF NOT EXISTS subscriptions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE,
  tier TEXT DEFAULT 'free' CHECK (tier IN ('free', 'basic', 'premium')),
  apple_transaction_id TEXT,
  apple_original_transaction_id TEXT,
  product_id TEXT,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own subscription"
  ON subscriptions FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Service role can manage subscriptions"
  ON subscriptions FOR ALL USING (auth.role() = 'service_role');

CREATE INDEX idx_subscriptions_user_id ON subscriptions(user_id);
CREATE INDEX idx_subscriptions_original_txn ON subscriptions(apple_original_transaction_id);
```

The webhook looks up users by `apple_original_transaction_id` — the second index matters.

## Environment Variables

```bash
# From App Store Connect → Users and Access → Integrations → In-App Purchase
APPLE_ISSUER_ID=00000000-0000-0000-0000-000000000000
APPLE_KEY_ID=XXXXXXXXXX
# Base64-encoded .p8 (preserves newlines inside env vars):
#   base64 -i AuthKey_XXXXXXXXXX.p8 | tr -d '\n'
APPLE_PRIVATE_KEY_BASE64=LS0tLS1CRUdJTi...
APPLE_BUNDLE_ID=ai.netgains.app
# "Production" for live + TestFlight-at-live, "Sandbox" for dev/TestFlight sandbox.
APP_STORE_ENVIRONMENT=Production
```

## App Store Connect Setup

1. **Create subscription products** (if not already):
   - `com.netgainsai.basic.monthly` — $6.99/month
   - `com.netgainsai.premium.monthly` — $14.99/month
   - Both in the same subscription group so users can upgrade/downgrade.

2. **Generate App Store Server API key**:
   - App Store Connect → Users and Access → Integrations → In-App Purchase → `+`
   - Download the `.p8` file (one-time only — save it).
   - Copy the Key ID (10 chars) and Issuer ID (UUID).
   - Base64-encode: `base64 -i AuthKey_XXXXXXXXXX.p8 | tr -d '\n'`
   - Set `APPLE_PRIVATE_KEY_BASE64`, `APPLE_KEY_ID`, `APPLE_ISSUER_ID` in Vercel + `.env.local`.

3. **Configure App Store Server Notifications V2**:
   - App Store Connect → your app → App Information → App Store Server Notifications.
   - Production Server URL: `https://netgainsai.com/api/webhooks/app-store`
   - Sandbox Server URL: same (our handler checks bundleId against `APPLE_BUNDLE_ID`).
   - Version: **Version 2**.
   - Click "Send Test Notification" to verify — should hit the webhook and return 200.

4. **Xcode**:
   - Target → Signing & Capabilities → `+ Capability` → In-App Purchase (if not already enabled).
   - Deployment target: iOS 15.0 (already set in `Podfile` and `project.pbxproj`).

## Local Testing

StoreKit 2 supports local testing without sandbox Apple IDs via a **StoreKit Configuration File**:

1. Xcode → File → New → File → Storekit Configuration File → "NetGains.storekit".
2. Add two Auto-Renewable Subscriptions matching the product IDs above.
3. Edit Scheme → Run → Options → StoreKit Configuration → "NetGains.storekit".
4. Run on simulator. Purchases execute locally and mint fake transactions.

For end-to-end testing with real Apple flow, use Sandbox:
1. Create a Sandbox tester in App Store Connect.
2. Sign out of App Store on device → run app → buy → Apple prompts for sandbox login.
3. Sandbox renewals happen at accelerated intervals (1 week → 3 mins).
4. Set `APP_STORE_ENVIRONMENT=Sandbox` in the server env for that build.

## Purchase Flow

1. User taps a tier → `paywall.tsx` calls `purchaseProduct(productId)`.
2. `storekit.ts` calls native `StoreKit2Plugin.purchase`.
3. Native plugin: `Product.purchase()` → returns a verified `Transaction`. Does **not** call `transaction.finish()` yet.
4. Plugin returns `{ transactionId, originalTransactionId, productId, expirationDate }`.
5. Client POSTs `{ transactionId }` to `/api/iap/verify`.
6. Server: JWT-signs an App Store Server API request, fetches the signed transaction, verifies the JWS signature, cross-checks with `GET /inApps/v1/subscriptions/{originalTransactionId}` for live status, upserts the `subscriptions` row.
7. Server responds `{ success: true, tier }`.
8. Client calls `refreshSubscription()` → `SubscriptionProvider` re-reads `subscriptions` → UI updates.
9. Renewals/cancellations arrive on `/api/webhooks/app-store` and keep the row fresh. A belt-and-suspenders `Transaction.updates` listener in the plugin also forwards updates, so renewals sync even if the webhook is delayed.

## Restore Flow

1. User taps "Restore Purchases" → `storekit.ts` → native plugin.
2. Plugin calls `AppStore.sync()` then iterates `Transaction.currentEntitlements`.
3. Returns an array of active verified transactions.
4. Client POSTs each `transactionId` to `/api/iap/verify` → server upserts subscription.
5. `refreshSubscription()` → UI updates.

## Smart Routing

Already wired in `api/chat/route.ts`, independent of billing:
- **Simple messages** (confirmations, short queries, ≤3 words) → always Haiku
- **Complex messages** → Sonnet with probability `SONNET_RATIO[tier]` (30% Free/Basic, 50% Premium), else Haiku
- **System triggers** (post-workout, daily brief) → always Sonnet

## Testing Checklist

- [ ] Free user hits 3-message limit → upgrade CTA appears
- [ ] Basic purchase succeeds → `subscriptions.tier = 'basic'` within 2s
- [ ] Premium purchase succeeds → tier = 'premium'
- [ ] Expired row falls back to Free (SubscriptionProvider handles this)
- [ ] Restore purchases on fresh install recovers active subscription
- [ ] Refund event from App Store Connect → webhook flips tier to Free
- [ ] Sandbox renewal (after ~3 min) → webhook extends `expires_at`
- [ ] Webhook TEST event from App Store Connect returns 200
- [ ] Admin bypass (`profiles.is_admin=true`) skips message limit
- [ ] Free-tier user on the iOS app with no subscription sees the paywall, not a crash

## Why native StoreKit 2 (vs RevenueCat or similar)

- **No third-party billing dependency** — one less SaaS, one less SDK, one less account with keys to rotate.
- **iOS 15+ API is clean** — `Product.purchase()` returns a verified `Transaction`; no need to parse receipt binaries.
- **Direct JWS signing on the server side is ~150 lines** with `jose` — smaller surface area than maintaining a webhook auth secret + RC API key.
- **Apple's own retry semantics** for Server Notifications V2 are well-defined (they retry for up to 3 days).
