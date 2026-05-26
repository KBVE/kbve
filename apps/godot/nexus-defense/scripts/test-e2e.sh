#!/usr/bin/env bash
# Run the GdUnit4 e2e suite for nexus-defense.
#
# Builds nd-server in release mode if its binary isn't already on disk
# (override with TD_SERVER_BIN=/path/to/binary to skip), then runs the
# e2e suite against the live server fixture.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
REPO_ROOT="$(cd "$PROJECT_DIR/../../.." && pwd)"

GODOT_BIN="${GODOT_BIN:-godot}"
if ! command -v "$GODOT_BIN" >/dev/null 2>&1; then
  echo "godot binary not found on PATH; set GODOT_BIN=/path/to/godot" >&2
  exit 127
fi

if [[ -z "${TD_SERVER_BIN:-}" ]]; then
  for candidate in \
    "$REPO_ROOT/dist/target/release/nd-server" \
    "$REPO_ROOT/target/release/nd-server"; do
    if [[ -x "$candidate" ]]; then
      export TD_SERVER_BIN="$candidate"
      break
    fi
  done
fi

if [[ -z "${TD_SERVER_BIN:-}" ]]; then
  echo "[test-e2e] building nd-server (release)…"
  (cd "$REPO_ROOT" && cargo build --release -p nd-server)
  for candidate in \
    "$REPO_ROOT/dist/target/release/nd-server" \
    "$REPO_ROOT/target/release/nd-server"; do
    if [[ -x "$candidate" ]]; then
      export TD_SERVER_BIN="$candidate"
      break
    fi
  done
fi

if [[ ! -x "${TD_SERVER_BIN:-}" ]]; then
  echo "[test-e2e] nd-server binary still missing after build attempt" >&2
  exit 1
fi

echo "[test-e2e] using TD_SERVER_BIN=$TD_SERVER_BIN"

cd "$PROJECT_DIR"
if [[ ! -d "$PROJECT_DIR/.godot" ]]; then
  "$GODOT_BIN" --headless --editor --quit >/dev/null 2>&1 || true
fi

exec "$GODOT_BIN" \
  --path "$PROJECT_DIR" \
  --headless \
  -s res://addons/gdUnit4/bin/GdUnitCmdTool.gd \
  --ignoreHeadlessMode \
  -a res://tests/ui \
  -a res://tests/components \
  -a res://tests/e2e \
  "$@"
