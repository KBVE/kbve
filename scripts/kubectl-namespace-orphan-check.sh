#!/usr/bin/env bash
# ns-audit.sh — Identify namespaces with no active workloads
# Safe: read-only, never deletes anything

set -euo pipefail

PROTECTED="default|kube-system|kube-public|kube-node-lease"

echo "=== Namespace Audit ==="
echo ""

for ns in $(kubectl get ns -o jsonpath='{.items[*].metadata.name}'); do
  # Skip protected system namespaces
  if echo "$ns" | grep -qE "^($PROTECTED)$"; then
    continue
  fi

  pods=$(kubectl get pods -n "$ns" --no-headers 2>/dev/null | wc -l | tr -d ' ')
  deploys=$(kubectl get deployments -n "$ns" --no-headers 2>/dev/null | wc -l | tr -d ' ')
  statefulsets=$(kubectl get statefulsets -n "$ns" --no-headers 2>/dev/null | wc -l | tr -d ' ')
  jobs=$(kubectl get jobs -n "$ns" --no-headers 2>/dev/null | wc -l | tr -d ' ')
  svcs=$(kubectl get svc -n "$ns" --no-headers 2>/dev/null | wc -l | tr -d ' ')
  secrets=$(kubectl get secrets -n "$ns" --no-headers 2>/dev/null | wc -l | tr -d ' ')
  ingresses=$(kubectl get ingress -n "$ns" --no-headers 2>/dev/null | wc -l | tr -d ' ')
  externalsecrets=$(kubectl get externalsecrets -n "$ns" --no-headers 2>/dev/null | wc -l | tr -d ' ')
  secretstores=$(kubectl get secretstores -n "$ns" --no-headers 2>/dev/null | wc -l | tr -d ' ')

  total=$((pods + deploys + statefulsets + jobs))

  if [ "$total" -eq 0 ]; then
    echo "EMPTY   $ns  (svcs=$svcs secrets=$secrets ingress=$ingresses extSecrets=$externalsecrets secretStores=$secretstores)"
  else
    echo "ACTIVE  $ns  (pods=$pods deploy=$deploys sts=$statefulsets jobs=$jobs)"
  fi
done
