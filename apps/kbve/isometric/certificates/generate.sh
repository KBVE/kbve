#!/usr/bin/env bash
# Generate a self-signed EC certificate for local WebTransport development.
#
# Output files (in this directory):
#   cert.pem   — X.509 certificate (PEM, prime256v1, 14-day validity)
#   key.pem    — EC private key (PEM, unencrypted)
#   digest.txt — SHA-256 fingerprint as hex (no colons, 64 chars)
#
# Usage:
#   ./generate.sh          # regenerate unconditionally
#   ./generate.sh --lazy   # skip if cert.pem exists and hasn't expired

set -euo pipefail
cd "$(dirname "$0")"

CERT=cert.pem
KEY=key.pem
DIGEST=digest.txt
DAYS=14

# --lazy: skip generation if cert exists and is still valid
if [[ "${1:-}" == "--lazy" ]] && [[ -f "$CERT" ]]; then
    if openssl x509 -checkend 86400 -noout -in "$CERT" 2>/dev/null; then
        echo "[certificates] cert.pem still valid (>24h remaining) — skipping regeneration"
        exit 0
    fi
    echo "[certificates] cert.pem expired or expiring soon — regenerating"
fi

echo "[certificates] generating self-signed EC certificate (prime256v1, ${DAYS} days)..."

openssl req -x509 \
    -newkey ec -pkeyopt ec_paramgen_curve:prime256v1 \
    -keyout "$KEY" -out "$CERT" \
    -days "$DAYS" -nodes \
    -subj "/CN=localhost" \
    -addext "subjectAltName=DNS:localhost,IP:127.0.0.1,IP:::1" \
    2>/dev/null

# Extract SHA-256 fingerprint (hex, no colons)
FINGERPRINT=$(openssl x509 -in "$CERT" -noout -sha256 -fingerprint \
    | sed 's/^.*=//' | sed 's/://g')

echo -n "$FINGERPRINT" > "$DIGEST"

echo "[certificates] cert.pem  — $(openssl x509 -in "$CERT" -noout -dates 2>/dev/null | head -1)"
echo "[certificates] digest.txt — $FINGERPRINT"
echo "[certificates] done"
