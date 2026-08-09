#!/usr/bin/env bash
# Builds the Onichan sidecar binaries and stages them at the externalBin
# locations Tauri expects: sidecars/<name>-<target-triple>.
#
# Heavy native deps (llama-cpp-2, piper-rs/ort, lancedb/ort) live in these
# standalone crates (excluded from the root cargo workspace) so a normal
# `cargo build` of the app never compiles them. Run this once (or in CI)
# before `cargo tauri dev` / `build`.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

TRIPLE="$(rustc -vV | sed -n 's/^host: //p')"
echo "target triple: $TRIPLE"

OS="$(uname -s)"
LLM_FEATURES=""
case "$OS" in
  Darwin) LLM_FEATURES="--features metal" ;;
  Linux)  LLM_FEATURES="" ;;  # add --features cuda|vulkan in CI as needed
esac

build_one() {
  local name="$1"; shift
  echo "==> building $name $*"
  CARGO_TARGET_DIR="$SCRIPT_DIR/$name/target" \
    cargo build --release --manifest-path "$name/Cargo.toml" "$@"
  cp "$name/target/release/$name" "./$name-$TRIPLE"
  echo "    staged ./$name-$TRIPLE"
}

build_one llm-sidecar $LLM_FEATURES
build_one mistralrs-sidecar $LLM_FEATURES
build_one tts-sidecar
build_one kokoro-sidecar
build_one memory-sidecar
build_one discord-sidecar

# rMLX: built-in MLX engine (Apple Silicon only). Links mlx-c dynamically —
# `brew install mlx-c` is a build AND runtime prerequisite; for app bundles the
# two dylibs (libmlxc, libmlx) must ship alongside with fixed rpaths.
if [ "$OS" = "Darwin" ] && [ ! -f "./rmlx-$TRIPLE" ]; then
  if [ -d "$(brew --prefix mlx-c 2>/dev/null)" ]; then
    echo "==> building rmlx (MLX engine)"
    MLX_C_PREFIX="$(brew --prefix mlx-c)" cargo install --git https://github.com/Pushkinist/rMLX       --bin rmlx rmlx-cli --root "$SCRIPT_DIR/.rmlx-install"
    cp "$SCRIPT_DIR/.rmlx-install/bin/rmlx" "./rmlx-$TRIPLE"
    echo "    staged ./rmlx-$TRIPLE"
  else
    echo "WARNING: mlx-c not installed (brew install mlx-c) — skipping rmlx; MLX engine unavailable"
  fi
fi

# piper-rs needs espeak-ng's compiled phoneme data at runtime; the crates.io
# package ships none (and the data can't be compiled on case-insensitive APFS).
# Stage it from a system espeak-ng install.
if [ ! -d "$SCRIPT_DIR/espeak-ng-data" ]; then
  for src in /opt/homebrew/share/espeak-ng-data /usr/share/espeak-ng-data /usr/lib/*/espeak-ng-data; do
    if [ -d "$src" ]; then
      cp -RL "$src" "$SCRIPT_DIR/espeak-ng-data"
      echo "staged espeak-ng-data from $src"
      break
    fi
  done
  [ -d "$SCRIPT_DIR/espeak-ng-data" ] || echo "WARNING: espeak-ng-data not found — install espeak-ng (brew install espeak-ng); TTS will crash without it"
fi

echo "sidecars ready."
