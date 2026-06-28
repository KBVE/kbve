#!/usr/bin/env bash
# Fast native dev loop for arpg-server.
#
# WHY: the docker image pins `--platform=linux/amd64`, so on an arm64 Mac the whole
# Rust build runs under QEMU emulation + `--release` — that's the 5-10 min rebuilds.
# Running natively on the host is arm64 + debug + a warm `target/`: first build is a
# couple minutes, every change after is ~seconds.
#
# WHAT: keeps Valkey in docker (campfire persistence), frees :7979 from the docker
# server, then runs arpg-server natively on :7979 — the exact port/env the web client
# (vite :5402) and browser already use, so nothing else changes. With cargo-watch
# installed it auto-rebuilds + restarts on save (the dev "blue/green": clients
# auto-reconnect via the ReconnectingSocket).
#
#   ./apps/agones/arpg/server/dev.sh
#   cargo install cargo-watch   # one-time, for auto-rebuild-on-save
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../../../.." && pwd)"
cd "$ROOT"
COMPOSE="docker compose -f apps/agones/arpg/docker-compose.yml"

# Kill any prior native server first — cargo-watch's child can outlive a tmux kill
# and keep holding :7979 + the cargo lock (stale world, blocked rebuild). No swap,
# no blue/green: just reap the old one so this start is clean.
pkill -f 'cargo-watch.*arpg-server' 2>/dev/null || true
pkill -f 'cargo run -p arpg-server' 2>/dev/null || true
pkill -f 'target/debug/arpg-server' 2>/dev/null || true
sleep 1

# Valkey up (host-mapped :6379); free :7979 by stopping the docker server so the
# native one can bind it (the two can't share the port).
$COMPOSE up -d valkey
$COMPOSE rm -sf arpg-server 2>/dev/null || true

# Local secret overrides (gitignored). Sourced before the exports so values like
# SUPABASE_JWT_SECRET flow into the ${VAR:-default} fallbacks below.
ENV_FILE="$(cd "$(dirname "$0")" && pwd)/.env"
if [[ -f "$ENV_FILE" ]]; then
    set -a
    . "$ENV_FILE"
    set +a
fi

# Env mirrors docker-compose.yml, except KV points at the host-mapped Valkey
# (localhost, not the in-network `valkey` hostname).
export ARPG_SERVER_ADDR="${ARPG_SERVER_ADDR:-0.0.0.0:7979}"
export ARPG_SERVER_SEED="${ARPG_SERVER_SEED:-12648430}"
export RUST_LOG="${RUST_LOG:-info,arpg_server=debug,simgrid=debug}"
export SUPABASE_URL="${SUPABASE_URL:-https://supabase.kbve.com}"
export SUPABASE_ANON_KEY="${SUPABASE_ANON_KEY:-eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoiYW5vbiIsImlzcyI6InN1cGFiYXNlIiwiaWF0IjoxNzU1NDAzMjAwLCJleHAiOjE5MTMxNjk2MDB9.oietJI22ZytbghFywvdYMSJp7rcsBdBYbcciJxeGWrg}"
export SUPABASE_JWT_SECRET="${SUPABASE_JWT_SECRET:-}"
export KBVE_KV_URL="${KBVE_KV_URL:-redis://localhost:6379}"

# Debug profile (fast compile). Add --release only if you need to profile perf.
if command -v cargo-watch >/dev/null 2>&1; then
    echo "→ native dev (auto rebuild+restart on save). Ctrl-C to stop."
    exec cargo watch \
        -w apps/agones/arpg/server/src \
        -w packages/rust/simgrid/src \
        -x 'run -p arpg-server'
else
    echo "→ native run (one-shot). Tip: 'cargo install cargo-watch' for auto-reload."
    exec cargo run -p arpg-server
fi
