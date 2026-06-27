#!/usr/bin/env bash
# gen-supabase-jwt-keys.sh — Phase 0 of the HS256 -> ES256 JWT migration.
#
# Builds the GOTRUE_JWT_KEYS value: a JSON array of private JWKs
#   [ ES256 EC key (key_ops sign+verify, the new signer),
#     oct HS256 key (key_ops verify-only, validates already-issued tokens) ]
# and seals it into the `supabase-jwt-keys` SealedSecret (key `jwt-keys`).
#
# The HS256 secret is read from the live cluster (matches GOTRUE_JWT_SECRET) and
# only ever lives in memory. The ES256 private key is generated here and lives
# ONLY inside the sealed file — run this ONCE; re-running rotates the ES256 key.
#
# This does NOT wire anything into GoTrue (that is Phase 2). It only produces the
# sealed artifact so the cutover is a one-line env reference later.
#
# Prereqs: kubectl, kubeseal, node, jq. Usage: ./gen-supabase-jwt-keys.sh
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
OUT="${SCRIPT_DIR}/manifests/sealed-supabase-jwt-keys.yaml"
NS=kilobase
SRC_NAME=supabase-jwt
DST_NAME=supabase-jwt-keys
CONTROLLER_NAME="${CONTROLLER_NAME:-sealed-secrets-controller}"
CONTROLLER_NS="${CONTROLLER_NS:-kube-system}"
HS256_KID="${HS256_KID:-hs256-legacy}"

for c in kubectl kubeseal node jq; do
	command -v "$c" >/dev/null || { echo "Error: missing tool: $c" >&2; exit 1; }
done
kubectl get deployment "$CONTROLLER_NAME" -n "$CONTROLLER_NS" >/dev/null 2>&1 ||
	{ echo "Error: sealed-secrets controller not found" >&2; exit 1; }

HS256_SECRET="$(kubectl get secret -n "$NS" "$SRC_NAME" -o jsonpath='{.data.secret}' | base64 -d)"
[ -n "$HS256_SECRET" ] || { echo "Error: could not read $SRC_NAME/secret" >&2; exit 1; }

JWKS="$(HS256_SECRET="$HS256_SECRET" HS256_KID="$HS256_KID" node -e '
  const crypto = require("crypto");
  const b64url = (b) => Buffer.from(b).toString("base64url");
  const { privateKey } = crypto.generateKeyPairSync("ec", { namedCurve: "prime256v1" });
  const ec = privateKey.export({ format: "jwk" }); // { kty, crv, x, y, d }
  const es256 = {
    kty: "EC", crv: "P-256", x: ec.x, y: ec.y, d: ec.d,
    kid: crypto.randomUUID(), alg: "ES256", use: "sig",
    key_ops: ["sign", "verify"],
  };
  const oct = {
    kty: "oct", k: b64url(process.env.HS256_SECRET),
    kid: process.env.HS256_KID, alg: "HS256", use: "sig",
    key_ops: ["verify"],
  };
  process.stdout.write(JSON.stringify([es256, oct]));
')"

echo "$JWKS" | jq -e 'type=="array" and length==2' >/dev/null ||
	{ echo "Error: JWKS build failed" >&2; exit 1; }
echo "Built JWKS: ES256 kid=$(echo "$JWKS" | jq -r '.[0].kid') (signer) + oct HS256 kid=$(echo "$JWKS" | jq -r '.[1].kid') (verify-only)"

printf '%s' "$JWKS" |
	kubectl create secret generic "$DST_NAME" --namespace="$NS" \
		--from-file=jwt-keys=/dev/stdin --dry-run=client -o yaml |
	kubeseal --controller-name="$CONTROLLER_NAME" --controller-namespace="$CONTROLLER_NS" \
		--format=yaml >"$OUT"

echo "Wrote $OUT"
echo "Phase 0 done. NOT yet wired into GoTrue (Phase 2). Commit the sealed file."
