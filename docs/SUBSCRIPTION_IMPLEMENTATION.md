# Subscription & Smart Routing Implementation

## Status: Code Complete (awaiting Apple approval)

## Pricing Tiers

| Tier | Price | Messages/Day | Sonnet Ratio | Monthly Margin |
|------|-------|--------------|--------------|----------------|
| Free | $0 | 3 | 30% | -$0.21 |
| Basic | $6.99 | 15 | 30% | +$3.35 (56%) |
| Premium | $14.99 | 50 | 50% | +$1.21 (9%) |

## What's Implemented

### 1. Constants (`/lib/constants.ts`)
- `SUBSCRIPTION_TIERS`: free, basic, premium
- `DAILY_MESSAGE_LIMITS`: { free: 3, basic: 15, premium: 50 }
- `SONNET_RATIO`: { free: 0.3, basic: 0.3, premium: 0.5 }
- `AI_MODELS.COACHING_SIMPLE`: Haiku for cost savings

### 2. Chat Route (`/app/api/chat/route.ts`)
- Subscription tier lookup from `subscriptions` table
- Per-tier message limits with tier-specific limit messages
- Smart model routing:
  - Simple messages → always Haiku
  - Complex messages → Sonnet based on tier ratio (30% or 50%)
  - System triggers → always Sonnet

### 3. Message Classification
Simple (→ Haiku):
- Confirmations: "yes", "ok", "log it", "thanks"
- Quick queries: "what's my protein?"
- Short messages (≤3 words)

Complex (→ Sonnet based on ratio):
- Workout/exercise discussions
- Meal planning, recommendations
- Explanations ("why", "how does")
- Goal setting, cutting/bulking
- Food logging with measurements

---

## Still Needed

### 1. Create Subscriptions Table in Supabase

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
  ON subscriptions FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Service role can manage subscriptions"
  ON subscriptions FOR ALL
  USING (auth.role() = 'service_role');

CREATE INDEX idx_subscriptions_user_id ON subscriptions(user_id);
```

### 2. RevenueCat Integration

1. Create account at https://app.revenuecat.com
2. Add iOS app: `ai.netgains.app.noahanzalone`
3. Create products in App Store Connect:
   - `com.netgainsai.basic.monthly` - $6.99/month
   - `com.netgainsai.premium.monthly` - $14.99/month
4. Link products to RevenueCat
5. Install: `npm install @revenuecat/purchases-capacitor`
6. Create webhook endpoint: `/api/webhooks/revenuecat/route.ts`

### 3. Subscription UI Components
- Paywall screen showing tier comparison
- Settings page subscription status
- Upgrade prompts when hitting limits

### 4. Apple Small Business Program
Apply at: https://developer.apple.com/app-store/small-business-program/
Reduces commission from 30% to 15%

---

## Testing Checklist

- [ ] Free user hits 3 message limit
- [ ] Basic user hits 15 message limit
- [ ] Premium user hits 50 message limit
- [ ] Simple messages use Haiku
- [ ] Complex messages respect Sonnet ratio
- [ ] System triggers always use Sonnet
- [ ] Expired subscriptions fall back to free
- [ ] RevenueCat webhook updates tier correctly

---

## Launch Sequence

1. Apple approves v1.0 (no subscriptions)
2. Don't release yet
3. Create subscription products in App Store Connect
4. Set up RevenueCat
5. Run subscriptions SQL in Supabase
6. Test on TestFlight
7. Upload v1.1 with subscriptions
8. Submit v1.1 for review
9. Release v1.1 when approved
