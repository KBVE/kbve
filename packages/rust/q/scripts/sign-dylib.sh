#!/usr/bin/env bash
# Re-sign a macOS dylib in place for a local build.
#
# The implementation lives in .github/signing/sign-macos-binary.sh so local builds
# and CI cannot drift apart on what "signed" means. This wrapper exists because nx
# runs the build targets with cwd=packages/rust/q.
set -euo pipefail

target="${1:?usage: sign-dylib.sh <path-to-dylib> [identity]}"
root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../../.." && pwd)"
exec "$root/.github/signing/sign-macos-binary.sh" "$target" "${2:-}"
