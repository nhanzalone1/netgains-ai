// Capacitor utilities for native platform detection and API routing

import { Capacitor } from "@capacitor/core";

/**
 * Production API base URL for native apps.
 * Native apps load static assets locally but need to call the production API.
 */
const PRODUCTION_API_URL = "https://netgainsai.com";

/**
 * Check if running in a native Capacitor app (iOS/Android)
 */
export function isNativePlatform(): boolean {
  try {
    return Capacitor.isNativePlatform();
  } catch {
    // Capacitor not available (web build)
    return false;
  }
}

/**
 * Get the current platform: 'ios', 'android', or 'web'
 */
export function getPlatform(): "ios" | "android" | "web" {
  try {
    return Capacitor.getPlatform() as "ios" | "android" | "web";
  } catch {
    return "web";
  }
}

/**
 * Get the base URL for API calls.
 * - Native apps: https://netgainsai.com
 * - Web: empty string (relative URLs)
 */
export function getApiBaseUrl(): string {
  return isNativePlatform() ? PRODUCTION_API_URL : "";
}

/**
 * Build a full API URL from a path.
 * Usage: apiUrl('/api/chat') -> '/api/chat' (web) or 'https://netgainsai.com/api/chat' (native)
 */
export function apiUrl(path: string): string {
  const base = getApiBaseUrl();
  // Ensure path starts with /
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${base}${normalizedPath}`;
}

/**
 * Fetch wrapper that automatically uses the correct API base URL.
 * Drop-in replacement for fetch() when calling API routes.
 *
 * Usage:
 *   // Instead of: fetch('/api/chat', { method: 'POST', ... })
 *   // Use: apiFetch('/api/chat', { method: 'POST', ... })
 */
export async function apiFetch(
  path: string,
  init?: RequestInit
): Promise<Response> {
  const url = apiUrl(path);
  return fetch(url, {
    ...init,
    // Ensure credentials are included for cross-origin requests (native)
    credentials: isNativePlatform() ? "include" : init?.credentials,
  });
}
