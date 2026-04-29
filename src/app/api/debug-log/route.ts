// TEMPORARY DIAGNOSTIC ENDPOINT — DELETE AFTER FOLLOWUP #2 SUB-B IS RESOLVED.
// Forwards client-side logs from the WebView to Vercel server logs so we can
// observe SubscriptionProvider behavior on a tethered-iPhone test without
// connecting Safari Web Inspector. No auth, no rate limit — does nothing
// useful and gets removed within the hour.

import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    console.log("[client-debug]", body.message);
  } catch {
    // Swallow malformed payloads — diagnostic-only, not load-bearing.
  }
  return NextResponse.json({ ok: true });
}
