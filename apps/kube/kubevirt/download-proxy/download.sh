#!/usr/bin/env bash
set -euo pipefail

# Queue a download via the aria2c RPC API on the download-proxy pod.
# Usage:
#   ./download.sh <url> [filename]
#   ./download.sh https://aka.ms/vs/17/release/vs_buildtools.exe
#   ./download.sh https://example.com/file.zip custom-name.zip
#
# The file lands on the shared PVC at /downloads/<filename>
# The VM can access it at http://download-proxy.angelscript.svc:8080/<filename>

PROXY_RPC="http://download-proxy.angelscript.svc:6800/jsonrpc"
NAMESPACE="${NAMESPACE:-angelscript}"
URL="${1:?Usage: ./download.sh <url> [filename]}"
FILENAME="${2:-$(basename "$URL")}"

echo "Queuing download: ${URL}"
echo "  Filename: ${FILENAME}"
echo "  Proxy: ${PROXY_RPC}"

# Scale up the proxy if it's at 0
REPLICAS=$(kubectl get deploy download-proxy -n "${NAMESPACE}" -o jsonpath='{.spec.replicas}' 2>/dev/null || echo "0")
if [ "${REPLICAS}" = "0" ]; then
    echo "Scaling up download-proxy..."
    kubectl scale deploy download-proxy -n "${NAMESPACE}" --replicas=1
    kubectl wait --for=condition=Ready pod -l app=download-proxy -n "${NAMESPACE}" --timeout=60s
fi

# Queue the download via aria2c JSON-RPC
kubectl exec deploy/download-proxy -n "${NAMESPACE}" -c aria2 -- \
    curl -sf -d "{
        \"jsonrpc\": \"2.0\",
        \"id\": \"dl-${FILENAME}\",
        \"method\": \"aria2.addUri\",
        \"params\": [[\"${URL}\"], {
            \"dir\": \"/downloads\",
            \"out\": \"${FILENAME}\",
            \"max-connection-per-server\": \"16\",
            \"split\": \"16\",
            \"min-split-size\": \"10M\",
            \"max-tries\": \"10\",
            \"retry-wait\": \"5\",
            \"continue\": \"true\",
            \"auto-file-renaming\": \"false\",
            \"allow-overwrite\": \"true\"
        }]
    }" http://localhost:6800/jsonrpc

echo ""
echo "Download queued. Monitor with:"
echo "  kubectl exec deploy/download-proxy -n ${NAMESPACE} -c aria2 -- curl -sf -d '{\"jsonrpc\":\"2.0\",\"id\":\"1\",\"method\":\"aria2.tellActive\",\"params\":[]}' http://localhost:6800/jsonrpc | python3 -m json.tool"
echo ""
echo "VM access URL: http://download-proxy.angelscript.svc:8080/${FILENAME}"
