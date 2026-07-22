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
  cargo build --release --manifest-path "$name/Cargo.toml" "$@"
  cp "$name/target/release/$name" "./$name-$TRIPLE"
  echo "    staged ./$name-$TRIPLE"
}

build_one llm-sidecar $LLM_FEATURES
build_one tts-sidecar
build_one memory-sidecar

echo "sidecars ready."
