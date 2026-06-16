#!/usr/bin/env bash
# reseal-supabase-jwt-keys.sh — re-mint + reseal the Supabase anon + service_role
# JWTs in the supabase-jwt SealedSecret, signed with the CURRENT JWT secret.
#
# Why: the sealed anon-key / service-key were signed with a secret that no longer
# matches GoTrue's GOTRUE_JWT_SECRET (== supabase-jwt/secret) — GoTrue rejects the
# service key as not_admin even though its role claim is service_role. Re-minting
# with the live cluster secret makes them verify again.
#
# Surgical: only anon-key + service-key are replaced; secret / automaton-key /
# expiry are left untouched. The signing secret is read from the cluster and
# lives only in memory (never disk, history, or git).
#
# Prereqs: kubectl (cluster access), kubeseal, openssl, yq.
# Usage:   ./reseal-supabase-jwt-keys.sh
#          # overridable: CONTROLLER_NAME, CONTROLLER_NS, EXP_SECONDS
#
# After running: review the diff, commit + PR (ArgoCD applies; ExternalSecrets
# refresh consumers). The anon key is embedded in frontend builds — rebuild +
# redeploy those (e.g. astro-kbve / cryptothrone) so clients carry the new key.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MANIFEST="${SCRIPT_DIR}/manifests/kilobase-jwt-secret-sealed.yaml"
NS=kilobase
NAME=supabase-jwt
CONTROLLER_NAME="${CONTROLLER_NAME:-sealed-secrets-controller}"
CONTROLLER_NS="${CONTROLLER_NS:-kube-system}"
EXP_SECONDS="${EXP_SECONDS:-315360000}" # 10y, matches Supabase key convention

for c in kubectl kubeseal openssl yq; do
	command -v "$c" >/dev/null || {
		echo "Error: missing required tool: $c" >&2
		exit 1
	}
done
kubectl get deployment "$CONTROLLER_NAME" -n "$CONTROLLER_NS" >/dev/null 2>&1 || {
	echo "Error: sealed-secrets controller not found ($CONTROLLER_NAME/$CONTROLLER_NS)" >&2
	exit 1
}
[ -f "$MANIFEST" ] || {
	echo "Error: manifest not found: $MANIFEST" >&2
	exit 1
}

JWT_SECRET="$(kubectl get secret -n "$NS" "$NAME" -o jsonpath='{.data.secret}' | base64 -d)"
[ -n "$JWT_SECRET" ] || {
	echo "Error: could not read $NAME/secret from the cluster" >&2
	exit 1
}

b64url() { openssl base64 -A | tr '+/' '-_' | tr -d '='; }

mint() { # $1 = role -> prints a signed HS256 JWT
	local now header payload data sig
	now="$(date +%s)"
	header="$(printf '{"alg":"HS256","typ":"JWT"}' | b64url)"
	payload="$(printf '{"role":"%s","iss":"supabase","iat":%s,"exp":%s}' \
		"$1" "$now" "$((now + EXP_SECONDS))" | b64url)"
	data="${header}.${payload}"
	sig="$(printf '%s' "$data" | openssl dgst -sha256 -hmac "$JWT_SECRET" -binary | b64url)"
	printf '%s.%s' "$data" "$sig"
}

seal_raw() { # stdin = plaintext -> prints the strict-scoped sealed blob
	kubeseal --raw --scope strict --namespace "$NS" --name "$NAME" \
		--controller-name "$CONTROLLER_NAME" --controller-namespace "$CONTROLLER_NS"
}

ANON_SEALED="$(mint anon | seal_raw)"
SERVICE_SEALED="$(mint service_role | seal_raw)"

yq -i ".spec.encryptedData.\"anon-key\" = \"${ANON_SEALED}\"" "$MANIFEST"
yq -i ".spec.encryptedData.\"service-key\" = \"${SERVICE_SEALED}\"" "$MANIFEST"

echo "Re-sealed anon-key + service-key in:"
echo "  $MANIFEST"
echo "Review the diff, commit, and PR. Rebuild/redeploy frontends that embed the anon key."
