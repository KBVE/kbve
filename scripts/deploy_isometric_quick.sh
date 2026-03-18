#!/usr/bin/env bash
set -euo pipefail

# deploy_isometric_quick.sh
# Builds WASM client, generates mkcert TLS certs, starts axum-kbve as a single
# HTTPS server that serves the game client + REST API + game server.
# Usage: ./scripts/deploy_isometric_quick.sh  (or via `nx run isometric:quick`)

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ISO_DIR="$REPO_ROOT/apps/kbve/isometric"
CERT_DIR="$ISO_DIR/certificates"

# ── Kill stale processes on our ports ──
for port in 1420 3080 5000 5001; do
  lsof -ti:"$port" | xargs kill 2>/dev/null || true
done

# ── Load .env from repo root (if present) ──
set -a
[ -f "$REPO_ROOT/.env" ] && . "$REPO_ROOT/.env"
set +a

export PATH="$HOME/.cargo/bin:$PATH"

# ── Ensure wasm-bindgen-cli is installed ──
if ! command -v wasm-bindgen >/dev/null; then
  cargo install wasm-bindgen-cli@0.2.114 --locked
fi

# ── Generate mkcert certs (if not present) ──
if ! command -v mkcert >/dev/null; then
  echo "ERROR: mkcert not found. Install with: brew install mkcert && mkcert -install"
  exit 1
fi

if [ ! -f "$CERT_DIR/localhost+2.pem" ] || [ ! -f "$CERT_DIR/localhost+2-key.pem" ]; then
  echo "[quick] Generating mkcert certs for localhost..."
  cd "$CERT_DIR"
  mkcert localhost 127.0.0.1 ::1
  cd "$REPO_ROOT"
fi

# ── Build WASM client ──
cd "$ISO_DIR/src-tauri"
RUSTUP_TOOLCHAIN=nightly cargo build --lib \
  --target wasm32-unknown-unknown \
  -Z build-std=panic_abort,std

wasm-bindgen \
  "$REPO_ROOT/dist/target/wasm32-unknown-unknown/debug/isometric_game.wasm" \
  --out-dir "$ISO_DIR/wasm-pkg" \
  --target web \
  --out-name isometric_game \
  --debug

cd "$ISO_DIR"

# ── Build the static site (Vite production build) ──
echo "[quick] Building static site with Vite..."
pnpm build

# ── Stage build output to match production path structure ──
# Vite builds with base: '/isometric/', so assets reference /isometric/...
# Production: /arcade/isometric/ (Astro wrapper) + /isometric/ (game assets)
# We nest the Vite output under a staging dir so axum serves it at /isometric/
STAGING_DIR="$ISO_DIR/.quick-staging"
rm -rf "$STAGING_DIR"
mkdir -p "$STAGING_DIR/isometric"
cp -r "$ISO_DIR/dist/"* "$STAGING_DIR/isometric/"

# Create a minimal redirect at root → /isometric/
cat > "$STAGING_DIR/index.html" <<'REDIRECT'
<!DOCTYPE html>
<html><head><meta http-equiv="refresh" content="0;url=/isometric/"></head></html>
REDIRECT

# ── Export cert paths for axum HTTPS + game server WS ──
# mkcert certs work for HTTPS and WebSocket (browser trusts the local CA).
# WebTransport intentionally omits GAME_WT_CERT/KEY so the server generates
# a self-signed cert — Chrome's serverCertificateHashes requires truly
# self-signed certs (≤14 day, no CA chain). mkcert certs are CA-signed
# and will be rejected by Chrome's QUIC stack even with the correct hash.
export HTTP_CERT="$CERT_DIR/localhost+2.pem"
export HTTP_KEY="$CERT_DIR/localhost+2-key.pem"
export GAME_WS_CERT="$CERT_DIR/localhost+2.pem"
export GAME_WS_KEY="$CERT_DIR/localhost+2-key.pem"

# ── Point axum's static file serving at the staged output ──
export STATIC_DIR="$STAGING_DIR"
export HTTP_PORT="${HTTP_PORT:-3080}"

echo "[quick] Starting axum-kbve (HTTPS on port $HTTP_PORT)..."
echo "[quick]   -> https://localhost:$HTTP_PORT/isometric/"
echo "[quick]   -> Game WS on :5000, WT on :5001"

# ── Run axum as the single server (foreground) ──
cargo run -p axum-kbve
