// RevenueCat integration for in-app purchases

import { Purchases, LOG_LEVEL } from "@revenuecat/purchases-capacitor";
import type { PurchasesPackage, CustomerInfo } from "@revenuecat/purchases-capacitor";
import { getPlatform, isNativePlatform } from "./capacitor";
import { SUBSCRIPTION_TIERS, SubscriptionTier } from "./constants";

// Product IDs matching App Store Connect and RevenueCat
export const PRODUCT_IDS = {
  BASIC_MONTHLY: "netgains_basic_monthly",
  PREMIUM_MONTHLY: "netgains_premium_monthly",
} as const;

// Map product IDs to subscription tiers
export const PRODUCT_TO_TIER: Record<string, SubscriptionTier> = {
  [PRODUCT_IDS.BASIC_MONTHLY]: SUBSCRIPTION_TIERS.BASIC,
  [PRODUCT_IDS.PREMIUM_MONTHLY]: SUBSCRIPTION_TIERS.PREMIUM,
};

// Map entitlement IDs to tiers
export const ENTITLEMENT_TO_TIER: Record<string, SubscriptionTier> = {
  basic: SUBSCRIPTION_TIERS.BASIC,
  premium: SUBSCRIPTION_TIERS.PREMIUM,
};

let isConfigured = false;

/**
 * Initialize RevenueCat SDK. Call once after user authenticates.
 */
export async function initializeRevenueCat(userId: string): Promise<void> {
  if (!isNativePlatform()) {
    console.log("[RevenueCat] Skipping init - not on native platform");
    return;
  }

  if (isConfigured) {
    // Already configured, just login the user
    try {
      await Purchases.logIn({ appUserID: userId });
      console.log("[RevenueCat] User logged in:", userId);
    } catch (error) {
      console.error("[RevenueCat] Login failed:", error);
    }
    return;
  }

  const platform = getPlatform();

  // API key is public and safe to include in client code
  // It can only be used to make purchases, not access backend data
  const apiKey = platform === "ios"
    ? process.env.NEXT_PUBLIC_REVENUECAT_API_KEY_IOS
    : process.env.NEXT_PUBLIC_REVENUECAT_API_KEY_ANDROID;

  if (!apiKey) {
    console.error("[RevenueCat] No API key configured for platform:", platform);
    return;
  }

  try {
    await Purchases.configure({
      apiKey,
      appUserID: userId, // Use Supabase user.id for direct mapping
    });

    // Enable debug logs in development
    if (process.env.NODE_ENV === "development") {
      await Purchases.setLogLevel({ level: LOG_LEVEL.DEBUG });
    }

    isConfigured = true;
    console.log("[RevenueCat] Initialized for user:", userId);
  } catch (error) {
    console.error("[RevenueCat] Failed to initialize:", error);
    throw error;
  }
}

/**
 * Get available packages/products for purchase
 */
export async function getOfferings(): Promise<PurchasesPackage[]> {
  if (!isNativePlatform()) return [];

  try {
    const offerings = await Purchases.getOfferings();
    return offerings.current?.availablePackages ?? [];
  } catch (error) {
    console.error("[RevenueCat] Failed to get offerings:", error);
    return [];
  }
}

/**
 * Purchase a package
 */
export async function purchasePackage(pkg: PurchasesPackage): Promise<{
  success: boolean;
  customerInfo?: CustomerInfo;
  error?: string;
  userCancelled?: boolean;
}> {
  if (!isNativePlatform()) {
    return { success: false, error: "Not on native platform" };
  }

  try {
    const result = await Purchases.purchasePackage({
      aPackage: pkg,
    });
    return {
      success: true,
      customerInfo: result.customerInfo,
    };
  } catch (error: unknown) {
    const purchaseError = error as { userCancelled?: boolean; message?: string };
    if (purchaseError.userCancelled) {
      return { success: false, userCancelled: true };
    }
    console.error("[RevenueCat] Purchase failed:", error);
    return {
      success: false,
      error: purchaseError.message || "Purchase failed",
    };
  }
}

/**
 * Purchase a specific product by ID
 */
export async function purchaseProduct(productId: string): Promise<{
  success: boolean;
  customerInfo?: CustomerInfo;
  error?: string;
  userCancelled?: boolean;
}> {
  const packages = await getOfferings();
  const pkg = packages.find((p) => p.product.identifier === productId);

  if (!pkg) {
    console.error("[RevenueCat] Product not found:", productId, "Available:", packages.map(p => p.product.identifier));
    return { success: false, error: `Product ${productId} not found` };
  }

  return purchasePackage(pkg);
}

/**
 * Restore purchases (for reinstalls or new devices)
 */
export async function restorePurchases(): Promise<{
  success: boolean;
  customerInfo?: CustomerInfo;
  error?: string;
}> {
  if (!isNativePlatform()) {
    return { success: false, error: "Not on native platform" };
  }

  try {
    const result = await Purchases.restorePurchases();
    return { success: true, customerInfo: result.customerInfo };
  } catch (error: unknown) {
    console.error("[RevenueCat] Restore failed:", error);
    return {
      success: false,
      error: (error as Error).message || "Restore failed",
    };
  }
}

/**
 * Get current customer info and entitlements
 */
export async function getCustomerInfo(): Promise<CustomerInfo | null> {
  if (!isNativePlatform()) return null;

  try {
    const result = await Purchases.getCustomerInfo();
    return result.customerInfo;
  } catch (error) {
    console.error("[RevenueCat] Failed to get customer info:", error);
    return null;
  }
}

/**
 * Determine subscription tier from customer entitlements
 */
export function getTierFromCustomerInfo(customerInfo: CustomerInfo): SubscriptionTier {
  const entitlements = customerInfo.entitlements.active;

  // Check premium first (higher tier)
  if (entitlements["premium"]?.isActive) {
    return SUBSCRIPTION_TIERS.PREMIUM;
  }
  if (entitlements["basic"]?.isActive) {
    return SUBSCRIPTION_TIERS.BASIC;
  }

  return SUBSCRIPTION_TIERS.FREE;
}

/**
 * Log out current user (call on sign out)
 */
export async function logOutRevenueCat(): Promise<void> {
  if (!isNativePlatform() || !isConfigured) return;

  try {
    await Purchases.logOut();
    console.log("[RevenueCat] User logged out");
  } catch (error) {
    console.error("[RevenueCat] Logout failed:", error);
  }
}

/**
 * Check if RevenueCat is available (native platform with SDK configured)
 */
export function isRevenueCatAvailable(): boolean {
  return isNativePlatform() && isConfigured;
}
