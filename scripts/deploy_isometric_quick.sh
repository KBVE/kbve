#!/usr/bin/env bash
set -euo pipefail

# deploy_isometric_quick.sh
# Builds WASM client, generates self-signed WT cert, starts axum server + Astro dev server.
# Usage: ./scripts/deploy_isometric_quick.sh  (or via `nx run isometric:quick`)

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ISO_DIR="$REPO_ROOT/apps/kbve/isometric"
CERT_DIR="$ISO_DIR/certificates"

# ── Kill stale processes on our ports ──
for port in 1420 5000 5001; do
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

# ── Generate self-signed WebTransport cert (lazy — skips if still valid >24h) ──
if [ -x "$CERT_DIR/generate.sh" ]; then
  "$CERT_DIR/generate.sh" --lazy
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

# ── Export cert paths for local dev ──
if [ -f "$CERT_DIR/cert.pem" ] && [ -f "$CERT_DIR/key.pem" ]; then
  export GAME_WT_CERT="$CERT_DIR/cert.pem"
  export GAME_WT_KEY="$CERT_DIR/key.pem"
fi

# ── Start axum game server in background, then Astro dev server in foreground ──
cargo run -p axum-kbve &
pnpm dev
