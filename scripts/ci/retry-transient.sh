#!/usr/bin/env bash
set -uo pipefail

RETRY_MAX="${RETRY_MAX:-10}"
RETRY_DELAY="${RETRY_DELAY:-30}"

TRANSIENT_PATTERN='server misbehaving|dial tcp|lookup .* on .*:53|no such host|failed to do request|failed to resolve source metadata|failed to fetch|TLS handshake|handshake timeout|i/o timeout|connection reset|connection refused|unexpected EOF|net/http: request canceled|429 Too Many Requests|error pulling image|pull access denied.*(temporary|timeout)|context deadline exceeded|blob upload unknown|received unexpected HTTP status: 5'

cmd="$*"
if [ -z "$cmd" ]; then
  echo "::error::retry-transient.sh: no command given" >&2
  exit 2
fi

tmp="$(mktemp)"
trap 'rm -f "$tmp"' EXIT

attempt=1
while true; do
  bash -c "$cmd" 2>&1 | tee "$tmp"
  ec="${PIPESTATUS[0]}"
  if [ "$ec" -eq 0 ]; then
    exit 0
  fi

  if ! grep -qiE "$TRANSIENT_PATTERN" "$tmp"; then
    echo "::error::non-transient failure (exit $ec); not retrying" >&2
    exit "$ec"
  fi

  if [ "$attempt" -ge "$RETRY_MAX" ]; then
    echo "::error::still failing after $attempt transient attempts (exit $ec)" >&2
    exit "$ec"
  fi

  echo "::warning::transient failure (attempt $attempt/$RETRY_MAX, exit $ec); retrying in ${RETRY_DELAY}s" >&2
  attempt=$((attempt + 1))
  sleep "$RETRY_DELAY"
done
