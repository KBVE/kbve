#!/usr/bin/env bash
# gen-supabase-jwt-vendor-jwks.sh — Phase 1 vendor accept-both.
#
# Builds the PUBLIC verification material the Supabase data plane needs to accept
# ES256 alongside HS256 during the signing-key transition, derived from the SAME
# ES256 keypair GoTrue will sign with (the sealed `supabase-jwt-keys` private
# JWKS) so the kids match:
#
#   postgrest-jwks : { keys:[ oct(HS256 secret), EC(ES256 public) ] }
#       PostgREST has one knob (PGRST_JWT_SECRET) that can be a full JWKS, so it
#       carries both keys. (Contains the HS256 secret -> sealed.)
#   public-jwks    : { keys:[ EC(ES256 public) ] }
#       Storage keeps its symmetric AUTH_JWT_SECRET and adds JWT_JWKS (EC only).
#       Realtime consumes the same EC-public set. (Public, but sealed for parity.)
#
# Sealed into `supabase-jwt-vendor`. The ES256 private + HS256 secret are read
# from the cluster, used only in memory, and never leave as plaintext.
#
# Prereqs: kubectl, kubeseal, node, jq. Run after gen-supabase-jwt-keys.sh.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
OUT="${SCRIPT_DIR}/manifests/sealed-supabase-jwt-vendor.yaml"
NS=kilobase
CONTROLLER_NAME="${CONTROLLER_NAME:-sealed-secrets-controller}"
CONTROLLER_NS="${CONTROLLER_NS:-kube-system}"

for c in kubectl kubeseal node jq; do
	command -v "$c" >/dev/null || { echo "Error: missing tool: $c" >&2; exit 1; }
done

PRIV_JWKS="$(kubectl get secret supabase-jwt-keys -n "$NS" -o jsonpath='{.data.jwt-keys}' | base64 -d)"
HS256="$(kubectl get secret supabase-jwt -n "$NS" -o jsonpath='{.data.secret}' | base64 -d)"
[ -n "$PRIV_JWKS" ] && [ -n "$HS256" ] || { echo "Error: could not read source secrets" >&2; exit 1; }

BOTH="$(PRIV_JWKS="$PRIV_JWKS" HS256="$HS256" node -e '
  const b64url = (b) => Buffer.from(b).toString("base64url");
  const priv = JSON.parse(process.env.PRIV_JWKS);
  const ec = priv.find(k => k.kty === "EC");
  if (!ec) { console.error("no EC key in supabase-jwt-keys"); process.exit(1); }
  const ecPub = { kty:"EC", crv:ec.crv, x:ec.x, y:ec.y, kid:ec.kid, alg:"ES256", use:"sig" };
  const oct = { kty:"oct", k:b64url(process.env.HS256), kid:"hs256-legacy", alg:"HS256", use:"sig" };
  process.stdout.write(JSON.stringify({keys:[oct, ecPub]}) + " " + JSON.stringify({keys:[ecPub]}));
')"
POSTGREST_JWKS="${BOTH%% *}"
PUBLIC_JWKS="${BOTH#* }"

echo "$POSTGREST_JWKS" | jq -e '.keys | length == 2' >/dev/null
echo "$PUBLIC_JWKS" | jq -e '.keys | length == 1' >/dev/null
echo "Built vendor JWKS — EC kid $(echo "$PUBLIC_JWKS" | jq -r '.keys[0].kid')"

kubectl create secret generic supabase-jwt-vendor --namespace="$NS" \
	--from-literal=postgrest-jwks="$POSTGREST_JWKS" \
	--from-literal=public-jwks="$PUBLIC_JWKS" \
	--dry-run=client -o yaml |
	kubeseal --controller-name="$CONTROLLER_NAME" --controller-namespace="$CONTROLLER_NS" \
		--format=yaml >"$OUT"

echo "Wrote $OUT — commit it."
