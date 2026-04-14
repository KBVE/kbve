#!/usr/bin/env bash
# Launch a Fabric development client with the behavior_statetree mod.
#
# Prerequisites:
#   1. Docker dev server running: npx nx run mc:dev
#   2. Rust native lib built (optional — only needed for AI, not ships):
#      cargo build -p behavior_statetree --release
#
# Usage:
#   cd apps/mc/behavior_statetree
#   ./dev-client.sh
#
# The client launches with the mod loaded. Connect to localhost:25565
# (Velocity proxy → lobby → /mc to switch to Fabric backend).

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
JAVA_DIR="$SCRIPT_DIR/java"

echo "=== KBVE MC Dev Client ==="
echo ""

# Check if the Rust native lib exists (optional — client doesn't need it
# for ship rendering, only the server does for AI)
if [ -f "$SCRIPT_DIR/../target/release/libbehavior_statetree.dylib" ] || \
   [ -f "$SCRIPT_DIR/../target/release/libbehavior_statetree.so" ]; then
    echo "[OK] Rust native lib found"
else
    echo "[WARN] Rust native lib not found — AI features won't work"
    echo "       (Ships + client rendering still work fine)"
    echo "       Build with: cargo build -p behavior_statetree --release"
    echo ""
fi

echo "Building mod + launching Minecraft client..."
echo "Connect to: localhost:25565"
echo ""

cd "$JAVA_DIR"

# runClient launches a full MC client with the mod loaded.
# On macOS, LWJGL needs -XstartOnFirstThread via the Gradle JVM args.
exec gradle runClient --no-daemon
