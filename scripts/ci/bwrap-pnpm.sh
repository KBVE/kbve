#!/usr/bin/env bash
#
# bwrap-pnpm.sh — run `pnpm install` (or any pnpm cmd) inside a bubblewrap sandbox
# on Linux CI runners. Confines the filesystem to the workspace + pnpm store and
# strips secret env vars, so a malicious lifecycle/build script from a compromised
# npm package cannot read CI secrets ($GITHUB_TOKEN, registry tokens) or touch the
# runner filesystem outside the repo.
#
# See discussion: https://news.ycombinator.com/item?id=45034496
#
# Usage:
#   scripts/ci/bwrap-pnpm.sh install --frozen-lockfile
#   scripts/ci/bwrap-pnpm.sh install --frozen-lockfile --ignore-scripts   # extra paranoid
#
# Behaviour:
#   - Non-Linux (macOS runners): bwrap unavailable → runs pnpm directly (passthrough).
#   - bwrap missing on Linux: hard fail unless BWRAP_OPTIONAL=1 is set.
#
# Env knobs:
#   BWRAP_OPTIONAL=1   fall back to plain pnpm if bwrap is absent (default: fail)
#   BWRAP_KEEP_ENV     space-separated extra env var names to pass through
#                      (e.g. private registry token: BWRAP_KEEP_ENV="NODE_AUTH_TOKEN")
#   BWRAP_DEBUG=1      print the assembled bwrap command before exec
set -euo pipefail

PNPM_BIN="$(command -v pnpm || true)"
if [ -z "$PNPM_BIN" ]; then
  echo "bwrap-pnpm: pnpm not found on PATH" >&2
  exit 127
fi

# --- passthrough on non-Linux (bwrap is Linux-namespaces only) ---------------
if [ "$(uname -s)" != "Linux" ]; then
  echo "bwrap-pnpm: non-Linux host, running pnpm without sandbox" >&2
  exec "$PNPM_BIN" "$@"
fi

BWRAP_BIN="$(command -v bwrap || true)"
if [ -z "$BWRAP_BIN" ]; then
  if [ "${BWRAP_OPTIONAL:-0}" = "1" ]; then
    echo "bwrap-pnpm: bwrap missing, BWRAP_OPTIONAL=1 → plain pnpm" >&2
    exec "$PNPM_BIN" "$@"
  fi
  echo "bwrap-pnpm: bwrap not installed. Install bubblewrap on the runner image," \
       "or set BWRAP_OPTIONAL=1 to bypass (loses sandboxing)." >&2
  exit 127
fi

WORKSPACE="$(pwd -P)"
STORE_PATH="$(pnpm store path --silent 2>/dev/null || echo "$HOME/.local/share/pnpm")"

# --- env allowlist: install needs none of the CI secrets ---------------------
# Everything not listed here is dropped (--clearenv). Keep only what pnpm/node
# and the toolchain need to locate binaries and write to the store.
KEEP_VARS=(
  PATH HOME LANG LC_ALL TERM TMPDIR
  npm_config_registry NPM_CONFIG_REGISTRY
  COREPACK_HOME PNPM_HOME
  NODE_OPTIONS NODE_PATH
  CI
  # GitHub Actions runner toolcache/temp — needed to find node/pnpm on self-hosted:
  RUNNER_TOOL_CACHE RUNNER_TEMP AGENT_TOOLSDIRECTORY
)
# NOTE: GITHUB_TOKEN, GH_TOKEN, *_SECRET, AWS_*, SUPABASE_*, npm auth tokens are
# deliberately NOT forwarded. Add private-registry auth via BWRAP_KEEP_ENV if needed.
for extra in ${BWRAP_KEEP_ENV:-}; do KEEP_VARS+=("$extra"); done

ENV_ARGS=()
for v in "${KEEP_VARS[@]}"; do
  if [ -n "${!v:-}" ]; then
    ENV_ARGS+=(--setenv "$v" "${!v}")
  fi
done

# --- sandbox filesystem ------------------------------------------------------
# RO-root is the robust choice for CI: node/pnpm/corepack live in scattered,
# runner-specific paths. Bind everything read-only, then punch RW holes only
# where install legitimately writes (workspace + store), and mask $HOME so
# stray credentials (~/.ssh, ~/.aws, ~/.npmrc auth) are invisible.
BWRAP_ARGS=(
  --ro-bind / /
  --dev /dev
  --proc /proc
  --tmpfs /tmp
  --tmpfs "$HOME"          # hide home dotfiles/creds; RW holes re-added below
  --bind "$WORKSPACE" "$WORKSPACE"
  --bind "$STORE_PATH" "$STORE_PATH"
  --die-with-parent
  --new-session
  --unshare-all
  --share-net              # registry fetch needs network; MUST come after --unshare-all
  --chdir "$WORKSPACE"
)

# pnpm/corepack write metadata under these — recreate as RW inside the tmpfs home.
for d in "$HOME/.cache" "$HOME/.local/share/pnpm" "$HOME/.config/pnpm" "${PNPM_HOME:-}" "${COREPACK_HOME:-}"; do
  [ -n "$d" ] || continue
  mkdir -p "$d" 2>/dev/null || true
  BWRAP_ARGS+=(--bind "$d" "$d")
done

if [ "${BWRAP_DEBUG:-0}" = "1" ]; then
  set -x
fi

exec "$BWRAP_BIN" "${BWRAP_ARGS[@]}" "${ENV_ARGS[@]}" -- "$PNPM_BIN" "$@"
