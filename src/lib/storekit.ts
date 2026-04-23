// StoreKit 2 wrapper — thin client for the native StoreKit2Plugin (Swift).
// Server-side verification happens via /api/iap/verify; never trust client
// claims of purchase without the server round-trip.

import { registerPlugin, Capacitor } from "@capacitor/core";
import { isNativePlatform } from "./capacitor";

export interface StoreKitProduct {
  id: string;
  displayName: string;
  description: string;
  price: number;
  displayPrice: string;
  currencyCode?: string;
}

export interface StoreKitTransaction {
  transactionId: string;
  originalTransactionId: string;
  productId: string;
  purchaseDate: number;
  expirationDate?: number;
  revocationDate?: number;
}

export type PurchaseStatus = "purchased" | "userCancelled" | "pending";

interface StoreKit2Plugin {
  getProducts(options: { productIds: string[] }): Promise<{ products: StoreKitProduct[] }>;
  purchase(options: { productId: string }): Promise<{
    status: PurchaseStatus;
    transaction?: StoreKitTransaction;
  }>;
  restore(): Promise<{ entitlements: StoreKitTransaction[] }>;
  getCurrentEntitlements(): Promise<{ entitlements: StoreKitTransaction[] }>;
  presentCodeRedemption(): Promise<void>;
  addListener(
    eventName: "transactionUpdated",
    listener: (transaction: StoreKitTransaction) => void
  ): Promise<{ remove: () => Promise<void> }>;
}

const StoreKit2 = registerPlugin<StoreKit2Plugin>("StoreKit2");

function logError(fn: string, error: unknown, context?: Record<string, unknown>) {
  const err = error as { message?: string; name?: string; code?: string | number; stack?: string };
  console.error(`[StoreKit] ${fn} failed`, {
    ...context,
    name: err?.name,
    code: err?.code,
    message: err?.message ?? String(error),
    stack: err?.stack,
    raw: error,
  });
}

export function isStoreKitAvailable(): boolean {
  const native = isNativePlatform();
  let platform = "unknown";
  let pluginAvailable = false;
  try {
    platform = Capacitor.getPlatform();
    pluginAvailable = Capacitor.isPluginAvailable("StoreKit2");
  } catch (error) {
    logError("isStoreKitAvailable", error);
  }
  console.log("[StoreKit] isStoreKitAvailable", {
    native,
    platform,
    pluginAvailable,
  });
  // Require the native bridge AND the plugin to be registered. If the plugin
  // is missing, calls will silently return undefined / hang — fail fast instead.
  return native && pluginAvailable;
}

export async function getProducts(productIds: string[]): Promise<StoreKitProduct[]> {
  console.log("[StoreKit] getProducts called", { productIds });

  if (!isStoreKitAvailable()) {
    console.warn("[StoreKit] getProducts: skipping — StoreKit not available on this platform");
    return [];
  }

  try {
    console.log("[StoreKit] getProducts: invoking native StoreKit2.getProducts…");
    const result = await StoreKit2.getProducts({ productIds });
    console.log("[StoreKit] getProducts: native returned", {
      requested: productIds,
      returnedCount: result?.products?.length ?? 0,
      returnedIds: result?.products?.map((p) => p.id) ?? [],
      raw: result,
    });
    return result?.products ?? [];
  } catch (error) {
    logError("getProducts", error, { productIds });
    return [];
  }
}

export async function purchaseProduct(productId: string): Promise<{
  success: boolean;
  transaction?: StoreKitTransaction;
  userCancelled?: boolean;
  pending?: boolean;
  error?: string;
  rawError?: string;
  errorName?: string;
  errorCode?: string | number;
}> {
  console.log("[StoreKit] purchaseProduct called", { productId });

  if (!isStoreKitAvailable()) {
    const error = "Purchases are only available in the iOS app";
    console.warn("[StoreKit] purchaseProduct: skipping —", error);
    return { success: false, error };
  }

  try {
    console.log("[StoreKit] purchaseProduct: invoking native StoreKit2.purchase…");
    const result = await StoreKit2.purchase({ productId });
    console.log("[StoreKit] purchaseProduct: native returned", {
      productId,
      status: result?.status,
      hasTransaction: !!result?.transaction,
      transactionId: result?.transaction?.transactionId,
      originalTransactionId: result?.transaction?.originalTransactionId,
      expirationDate: result?.transaction?.expirationDate,
      raw: result,
    });

    if (result.status === "purchased" && result.transaction) {
      console.log("[StoreKit] purchaseProduct: SUCCESS", {
        productId,
        transactionId: result.transaction.transactionId,
      });
      return { success: true, transaction: result.transaction };
    }
    if (result.status === "userCancelled") {
      console.log("[StoreKit] purchaseProduct: user cancelled", { productId });
      return { success: false, userCancelled: true };
    }
    if (result.status === "pending") {
      console.log("[StoreKit] purchaseProduct: pending (ask-to-buy / SCA)", { productId });
      return { success: false, pending: true };
    }
    console.warn("[StoreKit] purchaseProduct: unknown status", { status: result?.status });
    return { success: false, error: "Unknown purchase result" };
  } catch (error) {
    const err = error as { message?: string; name?: string; code?: string | number };
    const message = error instanceof Error ? error.message : String(error);
    logError("purchaseProduct", error, { productId });
    const mapped = mapPurchaseError(message);
    console.log("[StoreKit] purchaseProduct: mapped error", { raw: message, mapped });
    return {
      success: false,
      error: mapped,
      rawError: message,
      errorName: err?.name,
      errorCode: err?.code,
    };
  }
}

export async function restorePurchases(): Promise<{
  success: boolean;
  entitlements: StoreKitTransaction[];
  error?: string;
}> {
  console.log("[StoreKit] restorePurchases called");

  if (!isStoreKitAvailable()) {
    const error = "Not available on this platform";
    console.warn("[StoreKit] restorePurchases: skipping —", error);
    return { success: false, entitlements: [], error };
  }

  try {
    console.log("[StoreKit] restorePurchases: invoking native StoreKit2.restore…");
    const result = await StoreKit2.restore();
    console.log("[StoreKit] restorePurchases: native returned", {
      entitlementCount: result?.entitlements?.length ?? 0,
      entitlements: result?.entitlements?.map((e) => ({
        productId: e.productId,
        transactionId: e.transactionId,
        expirationDate: e.expirationDate,
        revocationDate: e.revocationDate,
      })),
    });
    return { success: true, entitlements: result?.entitlements ?? [] };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logError("restorePurchases", error);
    return { success: false, entitlements: [], error: message };
  }
}

export async function getCurrentEntitlements(): Promise<StoreKitTransaction[]> {
  console.log("[StoreKit] getCurrentEntitlements called");

  if (!isStoreKitAvailable()) {
    console.warn("[StoreKit] getCurrentEntitlements: skipping — StoreKit not available");
    return [];
  }

  try {
    console.log("[StoreKit] getCurrentEntitlements: invoking native…");
    const result = await StoreKit2.getCurrentEntitlements();
    console.log("[StoreKit] getCurrentEntitlements: native returned", {
      count: result?.entitlements?.length ?? 0,
      productIds: result?.entitlements?.map((e) => e.productId) ?? [],
    });
    return result?.entitlements ?? [];
  } catch (error) {
    logError("getCurrentEntitlements", error);
    return [];
  }
}

export function onTransactionUpdated(
  listener: (transaction: StoreKitTransaction) => void
): Promise<{ remove: () => Promise<void> }> {
  console.log("[StoreKit] onTransactionUpdated: registering listener");
  return StoreKit2.addListener("transactionUpdated", (transaction) => {
    console.log("[StoreKit] transactionUpdated event", {
      productId: transaction.productId,
      transactionId: transaction.transactionId,
      expirationDate: transaction.expirationDate,
      revocationDate: transaction.revocationDate,
    });
    listener(transaction);
  });
}

function mapPurchaseError(message: string): string {
  const m = message.toLowerCase();
  if (m.includes("cancel")) return "Purchase cancelled";
  if (m.includes("network") || m.includes("internet")) {
    return "No internet connection. Please check your network and try again.";
  }
  if (m.includes("not allowed") || m.includes("restricted")) {
    return "Purchases are not allowed on this device. Check device restrictions in Settings.";
  }
  if (m.includes("verification")) {
    return "The App Store couldn't verify this purchase. Please try again.";
  }
  return "Something went wrong with the purchase. Please try again.";
}
