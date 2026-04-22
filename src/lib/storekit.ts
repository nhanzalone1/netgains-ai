// StoreKit 2 wrapper — thin client for the native StoreKit2Plugin (Swift).
// Server-side verification happens via /api/iap/verify; never trust client
// claims of purchase without the server round-trip.

import { registerPlugin } from "@capacitor/core";
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

export function isStoreKitAvailable(): boolean {
  return isNativePlatform();
}

export async function getProducts(productIds: string[]): Promise<StoreKitProduct[]> {
  if (!isStoreKitAvailable()) return [];
  try {
    const result = await StoreKit2.getProducts({ productIds });
    return result.products;
  } catch (error) {
    console.error("[StoreKit] getProducts failed:", error);
    return [];
  }
}

export async function purchaseProduct(productId: string): Promise<{
  success: boolean;
  transaction?: StoreKitTransaction;
  userCancelled?: boolean;
  pending?: boolean;
  error?: string;
}> {
  if (!isStoreKitAvailable()) {
    return { success: false, error: "Purchases are only available in the iOS app" };
  }

  try {
    const result = await StoreKit2.purchase({ productId });
    if (result.status === "purchased" && result.transaction) {
      return { success: true, transaction: result.transaction };
    }
    if (result.status === "userCancelled") {
      return { success: false, userCancelled: true };
    }
    if (result.status === "pending") {
      return { success: false, pending: true };
    }
    return { success: false, error: "Unknown purchase result" };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[StoreKit] purchase failed:", message);
    return { success: false, error: mapPurchaseError(message) };
  }
}

export async function restorePurchases(): Promise<{
  success: boolean;
  entitlements: StoreKitTransaction[];
  error?: string;
}> {
  if (!isStoreKitAvailable()) {
    return { success: false, entitlements: [], error: "Not available on this platform" };
  }

  try {
    const result = await StoreKit2.restore();
    return { success: true, entitlements: result.entitlements };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[StoreKit] restore failed:", message);
    return { success: false, entitlements: [], error: message };
  }
}

export async function getCurrentEntitlements(): Promise<StoreKitTransaction[]> {
  if (!isStoreKitAvailable()) return [];
  try {
    const result = await StoreKit2.getCurrentEntitlements();
    return result.entitlements;
  } catch (error) {
    console.error("[StoreKit] getCurrentEntitlements failed:", error);
    return [];
  }
}

export function onTransactionUpdated(
  listener: (transaction: StoreKitTransaction) => void
): Promise<{ remove: () => Promise<void> }> {
  return StoreKit2.addListener("transactionUpdated", listener);
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
