#!/usr/bin/env bash
set -euo pipefail

# Builds libgit2 static libs with native TLS per platform:
#   Mac    -> SecureTransport (Security.framework, no OpenSSL)
#   Linux  -> OpenSSL (system)
#   Win64  -> WinHTTP / SChannel (build on Windows, see notes)
# Output: lib/<Platform>/(libgit2.a|git2.lib)
# Usage:  ./build-libgit2.sh [mac|linux]

LIBGIT2_TAG="v1.9.0"
THIRDPARTY_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/libgit2" && pwd)"
WORK="${TMPDIR:-/tmp}/libgit2-build"
PLATFORM="${1:-}"

if [ -z "$PLATFORM" ]; then
    case "$(uname -s)" in
        Darwin) PLATFORM="mac" ;;
        Linux)  PLATFORM="linux" ;;
        *) echo "Pass platform: mac|linux (Win64 builds on Windows)"; exit 1 ;;
    esac
fi

rm -rf "$WORK" && mkdir -p "$WORK"
git clone --depth 1 --branch "$LIBGIT2_TAG" https://github.com/libgit2/libgit2.git "$WORK/src"

COMMON_ARGS=(
    -DBUILD_SHARED_LIBS=OFF
    -DBUILD_TESTS=OFF
    -DBUILD_CLI=OFF
    -DUSE_SSH=OFF
    -DREGEX_BACKEND=builtin
    -DCMAKE_BUILD_TYPE=Release
)

case "$PLATFORM" in
    mac)
        cmake -S "$WORK/src" -B "$WORK/build" \
            "${COMMON_ARGS[@]}" \
            -DUSE_HTTPS=SecureTransport \
            -DCMAKE_OSX_ARCHITECTURES="x86_64;arm64"
        cmake --build "$WORK/build" --config Release -j
        mkdir -p "$THIRDPARTY_DIR/lib/Mac"
        cp "$WORK/build/libgit2.a" "$THIRDPARTY_DIR/lib/Mac/libgit2.a"
        echo "Built Mac libgit2.a (SecureTransport)"
        ;;
    linux)
        cmake -S "$WORK/src" -B "$WORK/build" \
            "${COMMON_ARGS[@]}" \
            -DUSE_HTTPS=OpenSSL
        cmake --build "$WORK/build" --config Release -j
        mkdir -p "$THIRDPARTY_DIR/lib/Linux"
        cp "$WORK/build/libgit2.a" "$THIRDPARTY_DIR/lib/Linux/libgit2.a"
        echo "Built Linux libgit2.a (OpenSSL)"
        ;;
    *)
        echo "Unknown platform: $PLATFORM"; exit 1 ;;
esac

# Refresh public headers from the built source
rm -rf "$THIRDPARTY_DIR/include"
cp -R "$WORK/src/include" "$THIRDPARTY_DIR/include"
echo "Headers synced from $LIBGIT2_TAG"
