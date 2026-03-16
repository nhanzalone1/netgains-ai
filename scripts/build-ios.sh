#!/bin/bash

# Build script for iOS Capacitor app
# Phase 1: Live server mode - app loads from production URL

set -e

echo "Building NetGains iOS app (Phase 1 - Live Server Mode)..."

# Create minimal webDir for Capacitor (required even in live server mode)
mkdir -p out
cat > out/index.html << 'EOF'
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>NetGains</title>
  <style>
    body {
      margin: 0;
      background: #0f0f13;
      color: white;
      font-family: -apple-system, system-ui, sans-serif;
      display: flex;
      align-items: center;
      justify-content: center;
      height: 100vh;
    }
  </style>
</head>
<body>
  <p>Loading NetGains...</p>
  <script>
    // Redirect to production URL (Capacitor handles this via server.url config)
    // This file is a fallback that should rarely be seen
  </script>
</body>
</html>
EOF

echo "Syncing with Capacitor..."
npx cap sync ios

echo ""
echo "iOS build complete!"
echo ""
echo "The app will load from: https://netgainsai.com"
echo ""
echo "Next steps:"
echo "  1. Run 'npx cap open ios' to open in Xcode"
echo "  2. Select your development team in Signing & Capabilities"
echo "  3. Build and run on simulator or device"
