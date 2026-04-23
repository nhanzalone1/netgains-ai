import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "ai.netgains.app.noahanzalone",
  appName: "NetGains",
  webDir: "out",
  server: {
    // Live server mode: load directly from production URL
    // This is Phase 1 approach - simpler, always up-to-date
    // For Phase 2, can switch to bundled static assets
    url: "https://netgainsai.com",
    cleartext: false,
    // Allow navigation to external URLs (Supabase auth, etc.)
    allowNavigation: ["netgainsai.com", "*.supabase.co"],
  },
  ios: {
    // Recommended iOS settings
    contentInset: "automatic",
    backgroundColor: "#0f0f13",
    preferredContentMode: "mobile",
    // Prevent white/gradient flash while loading
    allowsLinkPreview: false,
  },
  plugins: {
    // Splash screen configuration
    // Static splash shows briefly, then web app shows animated splash
    SplashScreen: {
      launchAutoHide: true,
      launchShowDuration: 500,
      launchFadeOutDuration: 300,
      backgroundColor: "#0f0f13",
      showSpinner: false,
    },
  },
};

export default config;
