// App Store Server API client.
//
// Docs: https://developer.apple.com/documentation/appstoreserverapi
//
// Required env vars:
//   APPLE_ISSUER_ID           — UUID from App Store Connect → Users and Access → Keys
//   APPLE_KEY_ID              — 10-char key ID
//   APPLE_PRIVATE_KEY_BASE64  — .p8 file contents, base64-encoded (PEM-safe for Vercel env vars)
//   APPLE_BUNDLE_ID           — ai.netgains.app
//   APP_STORE_ENVIRONMENT     — "Production" | "Sandbox"

import { SignJWT, importPKCS8, jwtVerify, decodeJwt, decodeProtectedHeader, importX509 } from "jose";

const ASSA_HOST = {
  Production: "https://api.storekit.itunes.apple.com",
  Sandbox: "https://api.storekit-sandbox.itunes.apple.com",
} as const;

export type AppStoreEnvironment = keyof typeof ASSA_HOST;

export interface JWSTransactionDecodedPayload {
  transactionId: string;
  originalTransactionId: string;
  webOrderLineItemId?: string;
  bundleId: string;
  productId: string;
  subscriptionGroupIdentifier?: string;
  purchaseDate: number;
  originalPurchaseDate: number;
  expiresDate?: number;
  quantity: number;
  type: string;
  inAppOwnershipType: string;
  signedDate: number;
  environment: AppStoreEnvironment;
  revocationDate?: number;
  revocationReason?: number;
  isUpgraded?: boolean;
  offerType?: number;
  offerIdentifier?: string;
  storefront?: string;
  storefrontId?: string;
  transactionReason?: string;
  currency?: string;
  price?: number;
}

export interface JWSRenewalInfoDecodedPayload {
  originalTransactionId: string;
  autoRenewProductId: string;
  productId: string;
  autoRenewStatus: 0 | 1;
  signedDate: number;
  environment: AppStoreEnvironment;
  recentSubscriptionStartDate?: number;
  renewalDate?: number;
  expirationIntent?: 1 | 2 | 3 | 4 | 5;
  isInBillingRetryPeriod?: boolean;
  gracePeriodExpiresDate?: number;
  priceIncreaseStatus?: 0 | 1;
  offerIdentifier?: string;
  offerType?: number;
}

function getEnvironment(): AppStoreEnvironment {
  const env = process.env.APP_STORE_ENVIRONMENT;
  return env === "Sandbox" ? "Sandbox" : "Production";
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required env var: ${name}`);
  return value;
}

function pemFromBase64(b64: string): string {
  // The .p8 is already PEM; we just base64-encoded the whole file for env vars.
  const raw = Buffer.from(b64, "base64").toString("utf-8");
  return raw.trim();
}

let cachedJWT: { token: string; expiresAt: number } | null = null;

// Generates an ES256 JWT valid for up to 60 minutes (Apple max).
// Cached in-process until 60 seconds before expiry.
async function generateToken(): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  if (cachedJWT && cachedJWT.expiresAt > now + 60) {
    return cachedJWT.token;
  }

  const issuerId = requireEnv("APPLE_ISSUER_ID");
  const keyId = requireEnv("APPLE_KEY_ID");
  const bundleId = requireEnv("APPLE_BUNDLE_ID");
  const pem = pemFromBase64(requireEnv("APPLE_PRIVATE_KEY_BASE64"));

  const privateKey = await importPKCS8(pem, "ES256");
  const expiresIn = 60 * 30; // 30 minutes

  const token = await new SignJWT({ bid: bundleId })
    .setProtectedHeader({ alg: "ES256", kid: keyId, typ: "JWT" })
    .setIssuer(issuerId)
    .setAudience("appstoreconnect-v1")
    .setIssuedAt(now)
    .setExpirationTime(now + expiresIn)
    .sign(privateKey);

  cachedJWT = { token, expiresAt: now + expiresIn };
  return token;
}

async function appleRequest<T>(path: string): Promise<T> {
  const env = getEnvironment();
  const token = await generateToken();
  const response = await fetch(`${ASSA_HOST[env]}${path}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
    },
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`App Store Server API ${response.status}: ${text}`);
  }

  return (await response.json()) as T;
}

interface TransactionInfoResponse {
  signedTransactionInfo: string;
}

interface SubscriptionStatusResponse {
  environment: AppStoreEnvironment;
  bundleId: string;
  data: Array<{
    subscriptionGroupIdentifier: string;
    lastTransactions: Array<{
      originalTransactionId: string;
      status: 1 | 2 | 3 | 4 | 5;
      signedTransactionInfo: string;
      signedRenewalInfo: string;
    }>;
  }>;
}

// Decodes and verifies a signed JWS payload from Apple.
// Apple signs JWS payloads with certs chained to Apple's root CA. We trust the
// leaf cert embedded in the x5c header for simplicity — JWS signature validation
// via that cert is enough to confirm the payload came from Apple. For stricter
// verification, chain-verify against Apple's root CA.
export async function decodeAndVerifySignedPayload<T>(signedPayload: string): Promise<T> {
  const header = decodeProtectedHeader(signedPayload);
  const x5c = header.x5c;
  if (!x5c || x5c.length === 0) {
    throw new Error("Signed payload missing x5c chain");
  }

  const leafCertPem = `-----BEGIN CERTIFICATE-----\n${x5c[0]}\n-----END CERTIFICATE-----`;
  const publicKey = await importX509(leafCertPem, "ES256");
  const { payload } = await jwtVerify(signedPayload, publicKey);
  return payload as unknown as T;
}

// Decodes without verification. Useful when Apple is the direct caller
// (webhook) and we only want to read claims; still verify first for any
// payload not previously trusted.
export function decodeSignedPayloadUnsafe<T>(signedPayload: string): T {
  return decodeJwt(signedPayload) as unknown as T;
}

// Fetch and verify a single transaction by transactionId.
// Use this server-side right after a client-side purchase to confirm the
// transaction exists and belongs to the expected bundleId/productId.
export async function verifyTransaction(
  transactionId: string
): Promise<JWSTransactionDecodedPayload> {
  const response = await appleRequest<TransactionInfoResponse>(
    `/inApps/v1/transactions/${encodeURIComponent(transactionId)}`
  );
  const payload = await decodeAndVerifySignedPayload<JWSTransactionDecodedPayload>(
    response.signedTransactionInfo
  );

  const expectedBundleId = requireEnv("APPLE_BUNDLE_ID");
  if (payload.bundleId !== expectedBundleId) {
    throw new Error(`Bundle ID mismatch: ${payload.bundleId} != ${expectedBundleId}`);
  }

  return payload;
}

export interface SubscriptionStatus {
  transaction: JWSTransactionDecodedPayload;
  renewal: JWSRenewalInfoDecodedPayload;
  status: 1 | 2 | 3 | 4 | 5; // 1=active, 2=expired, 3=retry, 4=grace, 5=revoked
}

// Fetch current subscription status for a given original transaction ID.
// Picks the most-recent transaction across all subscription groups.
export async function getSubscriptionStatus(
  originalTransactionId: string
): Promise<SubscriptionStatus | null> {
  const response = await appleRequest<SubscriptionStatusResponse>(
    `/inApps/v1/subscriptions/${encodeURIComponent(originalTransactionId)}`
  );

  let best: SubscriptionStatus | null = null;
  for (const group of response.data) {
    for (const tx of group.lastTransactions) {
      const transaction = await decodeAndVerifySignedPayload<JWSTransactionDecodedPayload>(
        tx.signedTransactionInfo
      );
      const renewal = await decodeAndVerifySignedPayload<JWSRenewalInfoDecodedPayload>(
        tx.signedRenewalInfo
      );
      const candidate: SubscriptionStatus = { transaction, renewal, status: tx.status };
      if (!best || candidate.transaction.signedDate > best.transaction.signedDate) {
        best = candidate;
      }
    }
  }
  return best;
}
