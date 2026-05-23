#!/bin/bash
set -e

# nd-native build + sync script
# Builds gdext bindings for nexus-defense and copies binaries into
# apps/godot/nexus-defense/addons/nd_native/bin/{debug,release}
#
# Usage:
#   ./sync.sh                # native (host) debug + release
#   ./sync.sh -mac           # mac arm64 only
#   ./sync.sh -wasm          # WASM (release) — needs nightly + emscripten
#   ./sync.sh -wasm -debug   # WASM debug build (large; do NOT commit)

usage() {
    cat <<EOF
Usage: $(basename "$0") [-mac] [-wasm] [-debug]

  -mac    Build host (mac arm64) only
  -wasm   Build WASM via wasm32-unknown-emscripten (release by default)
  -debug  Pair with -wasm to build debug WASM (large files, don't commit)

No flags = mac + wasm.
EOF
}

BUILD_MAC=false
BUILD_WASM=false
WASM_DEBUG=false
EXPLICIT=false

for arg in "$@"; do
    case "$arg" in
        -mac) BUILD_MAC=true; EXPLICIT=true ;;
        -wasm) BUILD_WASM=true; EXPLICIT=true ;;
        -debug) WASM_DEBUG=true ;;
        -h|--help) usage; exit 0 ;;
        *) echo "Unknown option: $arg"; usage; exit 1 ;;
    esac
done

if [ "$EXPLICIT" = false ]; then
    BUILD_MAC=true
    BUILD_WASM=true
fi

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
WORKSPACE_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"
TARGET_DIR="${CARGO_TARGET_DIR:-$WORKSPACE_ROOT/dist/target}"
ADDON_DIR="$WORKSPACE_ROOT/apps/godot/nexus-defense/addons/nd_native"

mkdir -p "$ADDON_DIR/bin/debug" "$ADDON_DIR/bin/release"

if [ "$BUILD_MAC" = true ]; then
    echo "[1/2] cargo build (debug) nd-native"
    cargo build -p nd-native
    cp "$TARGET_DIR/debug/libnd_native.dylib" "$ADDON_DIR/bin/debug/libnd_native.dylib"

    echo "[2/2] cargo build --release nd-native"
    cargo build -p nd-native --release
    cp "$TARGET_DIR/release/libnd_native.dylib" "$ADDON_DIR/bin/release/libnd_native.dylib"
fi

if [ "$BUILD_WASM" = true ]; then
    if ! command -v emcc >/dev/null 2>&1; then
        echo "emcc not on PATH — install emscripten + activate the SDK first"
        exit 1
    fi

    if [ "$WASM_DEBUG" = true ]; then
        echo "[wasm-debug] cargo +nightly build -Zbuild-std nd-native"
        ( cd "$SCRIPT_DIR" && cargo +nightly build -Zbuild-std=std,panic_abort --target wasm32-unknown-emscripten )
        if [ -f "$TARGET_DIR/wasm32-unknown-emscripten/debug/nd_native.wasm" ]; then
            cp "$TARGET_DIR/wasm32-unknown-emscripten/debug/nd_native.wasm" "$ADDON_DIR/bin/debug/nd_native.wasm"
        fi
    fi

    echo "[wasm-release] cargo +nightly build -Zbuild-std nd-native --release"
    ( cd "$SCRIPT_DIR" && cargo +nightly build -Zbuild-std=std,panic_abort --target wasm32-unknown-emscripten --release )
    cp "$TARGET_DIR/wasm32-unknown-emscripten/release/nd_native.wasm" "$ADDON_DIR/bin/release/nd_native.wasm"
fi

echo "Done. Binaries in $ADDON_DIR/bin/"
