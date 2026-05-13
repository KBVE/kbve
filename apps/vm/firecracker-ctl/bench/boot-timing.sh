#!/usr/bin/env bash
# ============================================================================
# boot-timing.sh — cold-start benchmark for firecracker-ctl persistent VMs.
#
# Fires one /fc/deploy per rootfs flavour, polls the resulting endpoint
# until /health returns 200, then tears down. Prints a markdown table:
#
#   rootfs                       packages  deploy_ms  ready_ms  total_ms
#   firecracker-python-web       —         180        2310      2490
#   alpine-python                fastapi   210        9450      9660
#   firecracker-node-web         —         190        1820      2010
#   alpine-node                  fastify   200        7110      7310
#
# Requires curl + jq + a staff JWT against axum-kbve.
#
# Usage:
#   KBVE_API=https://kbve.com KBVE_TOKEN=<jwt> ./boot-timing.sh
#   KBVE_API=http://127.0.0.1:4321 KBVE_TOKEN=<jwt> ./boot-timing.sh
# ============================================================================
set -euo pipefail

API=${KBVE_API:-https://kbve.com}
TOKEN=${KBVE_TOKEN:?KBVE_TOKEN env var is required (staff JWT)}
ROUNDS=${ROUNDS:-1}
PORT=${PORT:-8080}
READY_TIMEOUT_S=${READY_TIMEOUT_S:-30}
POLL_INTERVAL_MS=${POLL_INTERVAL_MS:-100}

now_ms() { python3 -c 'import time; print(int(time.time()*1000))'; }

PYTHON_CODE=$(cat <<'PY'
from fastapi import FastAPI
import uvicorn
app = FastAPI()
@app.get("/health")
def h(): return {"ok": True}
if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8080)
PY
)

NODE_CODE=$(cat <<'JS'
const Fastify = require('fastify');
const app = Fastify();
app.get('/health', async () => ({ ok: true }));
app.listen({ host: '0.0.0.0', port: 8080 });
JS
)

# rootfs | code | packages (space-separated, "-" for none)
SCENARIOS=(
    "firecracker-python-web|${PYTHON_CODE}|-"
    "alpine-python|${PYTHON_CODE}|fastapi uvicorn"
    "firecracker-node-web|${NODE_CODE}|-"
    "alpine-node|${NODE_CODE}|fastify"
)

deploy_one() {
    local rootfs="$1" code="$2" packages="$3"
    local name="bench-$(date +%s)-$$"
    local entrypoint
    case "$rootfs" in
        *python*) entrypoint="python3 /tmp/code" ;;
        *node*)   entrypoint="node /tmp/code" ;;
        *)        echo "Unknown rootfs: $rootfs" >&2; return 1 ;;
    esac

    local payload
    if [ "$packages" = "-" ]; then
        payload=$(jq -n --arg n "$name" --arg r "$rootfs" --arg e "$entrypoint" \
            --arg code "$code" --argjson port "$PORT" \
            '{name:$n,rootfs:$r,entrypoint:$e,code:$code,http_port:$port,vcpu_count:1,mem_size_mib:256}')
    else
        local pkgs_json
        pkgs_json=$(echo "$packages" | jq -R 'split(" ")')
        payload=$(jq -n --arg n "$name" --arg r "$rootfs" --arg e "$entrypoint" \
            --arg code "$code" --argjson port "$PORT" --argjson pkgs "$pkgs_json" \
            '{name:$n,rootfs:$r,entrypoint:$e,code:$code,http_port:$port,vcpu_count:1,mem_size_mib:256,packages:$pkgs}')
    fi

    local t0 t1 t2
    t0=$(now_ms)
    curl -sSf -X POST "${API}/api/v1/fc/deploy" \
        -H "Authorization: Bearer ${TOKEN}" \
        -H "Content-Type: application/json" \
        -d "$payload" >/dev/null
    t1=$(now_ms)

    local deadline=$((t1 + READY_TIMEOUT_S * 1000))
    while :; do
        if curl -sSf -o /dev/null -m 2 \
            -H "Authorization: Bearer ${TOKEN}" \
            "${API}/api/v1/fc/${name}/health" >/dev/null 2>&1; then
            t2=$(now_ms)
            break
        fi
        if [ "$(now_ms)" -gt "$deadline" ]; then
            t2=$(now_ms)
            echo "  TIMEOUT after $((t2 - t1))ms" >&2
            break
        fi
        sleep "$(awk "BEGIN{print ${POLL_INTERVAL_MS}/1000}")"
    done

    curl -sS -X DELETE "${API}/api/v1/fc/${name}" \
        -H "Authorization: Bearer ${TOKEN}" >/dev/null || true

    local deploy_ms=$((t1 - t0))
    local ready_ms=$((t2 - t1))
    local total_ms=$((t2 - t0))
    printf '%-30s %-12s %10d %10d %10d\n' \
        "$rootfs" "$packages" "$deploy_ms" "$ready_ms" "$total_ms"
}

printf '%-30s %-12s %10s %10s %10s\n' \
    rootfs packages deploy_ms ready_ms total_ms

for round in $(seq 1 "$ROUNDS"); do
    for scenario in "${SCENARIOS[@]}"; do
        IFS='|' read -r rootfs code packages <<<"$scenario"
        deploy_one "$rootfs" "$code" "$packages"
    done
done
