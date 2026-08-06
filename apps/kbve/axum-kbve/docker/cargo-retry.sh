#!/bin/sh
set -eu

LOG=/tmp/cargo-retry.log
STATUS=/tmp/cargo-retry.status

{ if "$@" 2>&1; then echo 0 >"$STATUS"; else echo $? >"$STATUS"; fi; } | tee "$LOG"
code=$(cat "$STATUS")

if [ "$code" -eq 0 ]; then
    exit 0
fi

if ! grep -q "extern location for .* does not exist" "$LOG"; then
    exit "$code"
fi

echo "::warning::sccache returned a cache hit without its rlib; purging target and recompiling with SCCACHE_RECACHE=1"
rm -rf target
SCCACHE_RECACHE=1 "$@"
