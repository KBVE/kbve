#!/usr/bin/env bash
# Run the GdUnit4 unit + component test suites for nexus-defense.
# Usage: scripts/test.sh [extra gdunit args...]
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

GODOT_BIN="${GODOT_BIN:-godot}"
if ! command -v "$GODOT_BIN" >/dev/null 2>&1; then
  # CI runners (and most non-game-dev machines) don't ship Godot. Treat
  # the missing binary as a soft skip so `nx run nexus-defense:test`
  # doesn't block the whole monorepo on every PR; local devs still hit
  # the full suite because they have the editor installed.
  #
  # Override by either:
  #   - installing godot on PATH (brew install godot, etc), or
  #   - setting GODOT_BIN=/path/to/godot
  #   - setting ND_REQUIRE_GODOT=1 to fail-fast instead of skip.
  if [[ "${ND_REQUIRE_GODOT:-0}" == "1" ]]; then
    echo "godot binary not found on PATH; set GODOT_BIN=/path/to/godot" >&2
    echo "(ND_REQUIRE_GODOT=1 set — refusing to soft-skip)" >&2
    exit 127
  fi
  echo "::warning::godot binary not found on PATH — skipping nexus-defense:test" >&2
  echo "[skip] Install godot or set GODOT_BIN to run the suite locally." >&2
  exit 0
fi

cd "$PROJECT_DIR"

# Trigger an import pass once so gdUnit4's class_name scan resolves.
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
  "$@"
