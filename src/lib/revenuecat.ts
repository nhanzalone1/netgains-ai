// RevenueCat integration for in-app purchases

import { Purchases, LOG_LEVEL } from "@revenuecat/purchases-capacitor";
import type { PurchasesPackage, CustomerInfo } from "@revenuecat/purchases-capacitor";
import { getPlatform, isNativePlatform } from "./capacitor";
import { SUBSCRIPTION_TIERS, SubscriptionTier } from "./constants";

// Product IDs matching App Store Connect and RevenueCat
export const PRODUCT_IDS = {
  BASIC_MONTHLY: "com.netgainsai.basic.monthly",
  PREMIUM_MONTHLY: "com.netgainsai.premium.monthly",
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
 * Never throws — logs errors and returns gracefully.
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
    // Don't throw — allow app to function without purchases.
    // iPad compatibility mode and other edge cases can cause init failures.
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
    const purchaseError = error as {
      userCancelled?: boolean;
      message?: string;
      code?: number | string;
    };
    if (purchaseError.userCancelled) {
      return { success: false, userCancelled: true };
    }
    console.error("[RevenueCat] Purchase failed:", error);

    // Map common StoreKit/RevenueCat error codes to user-friendly messages
    const errorMessage = getUserFriendlyPurchaseError(purchaseError);
    return {
      success: false,
      error: errorMessage,
    };
  }
}

/**
 * Map RevenueCat/StoreKit errors to user-friendly messages.
 * Covers iPad compatibility mode issues, network errors, and StoreKit failures.
 */
function getUserFriendlyPurchaseError(error: {
  message?: string;
  code?: number | string;
}): string {
  const message = (error.message || "").toLowerCase();
  const code = String(error.code || "");

  // StoreKit not available or storefront issues (common on iPad compat mode)
  if (
    message.includes("storekit") ||
    message.includes("storefront") ||
    message.includes("sk_error") ||
    code === "STORE_PROBLEM" ||
    code === "4"
  ) {
    return "The App Store couldn't process this purchase. Please try again, or open the App Store app first and retry.";
  }

  // Network errors
  if (
    message.includes("network") ||
    message.includes("internet") ||
    message.includes("offline") ||
    code === "NETWORK_ERROR" ||
    code === "1"
  ) {
    return "No internet connection. Please check your network and try again.";
  }

  // Payment not allowed (parental controls, restrictions)
  if (
    message.includes("not allowed") ||
    message.includes("payment") ||
    code === "PURCHASE_NOT_ALLOWED" ||
    code === "3"
  ) {
    return "Purchases are not allowed on this device. Please check your device restrictions in Settings.";
  }

  // Product already owned
  if (
    message.includes("already") ||
    code === "PRODUCT_ALREADY_PURCHASED" ||
    code === "6"
  ) {
    return "You already have this subscription. Try restoring purchases instead.";
  }

  // Generic fallback
  return "Something went wrong with the purchase. Please try again.";
}

/**
 * Purchase a specific product by ID.
 * Retries fetching offerings once if the first attempt returns empty
 * (common on iPad compatibility mode where StoreKit loads slowly).
 */
export async function purchaseProduct(productId: string): Promise<{
  success: boolean;
  customerInfo?: CustomerInfo;
  error?: string;
  userCancelled?: boolean;
}> {
  if (!isNativePlatform()) {
    return { success: false, error: "Not on native platform" };
  }

  if (!isConfigured) {
    return {
      success: false,
      error: "The App Store is unavailable right now. Please restart the app and try again.",
    };
  }

  // First attempt to load offerings
  let packages = await getOfferings();

  // Retry once after a short delay — StoreKit can be slow to load products
  // on iPad compatibility mode or first launch
  if (packages.length === 0) {
    console.log("[RevenueCat] No packages found, retrying after delay...");
    await new Promise((resolve) => setTimeout(resolve, 2000));
    packages = await getOfferings();
  }

  const pkg = packages.find((p) => p.product.identifier === productId);

  if (!pkg) {
    console.error("[RevenueCat] Product not found:", productId, "Available:", packages.map(p => p.product.identifier));
    return {
      success: false,
      error: packages.length === 0
        ? "Unable to load subscription options. Please check your internet connection and try again."
        : "This subscription is temporarily unavailable. Please try again later.",
    };
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
