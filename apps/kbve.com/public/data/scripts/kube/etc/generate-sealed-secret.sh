#!/bin/bash

check_inputs() {
  if [ -z "$NAMESPACE" ] || [ -z "$KEY_NAME" ] || [ -z "$SECRETS" ]; then
    echo "Error: Missing required arguments."
    echo "Usage: $0 <namespace> <keyName> <secrets>"
    exit 1
  fi
}

check_dependencies() {
  if ! command -v kubectl &> /dev/null; then
    echo "Error: kubectl is not installed or not in PATH."
    exit 1
  fi
  if ! command -v kubeseal &> /dev/null; then
    echo "Error: kubeseal is not installed or not in PATH."
    exit 1
  fi
}

create_temp_secret() {
  SECRET_CMD="kubectl create secret generic $KEY_NAME --namespace $NAMESPACE"
  
  IFS='&' read -ra SECRETS_ARRAY <<< "$SECRETS"
  for secret in "${SECRETS_ARRAY[@]}"; do
    SECRET_CMD="$SECRET_CMD --from-literal=$secret"
  done
  
  TEMP_SECRET_YAML="temp-secret.yaml"
  $SECRET_CMD --dry-run=client -o yaml > $TEMP_SECRET_YAML

  echo "Temporary secret created: $TEMP_SECRET_YAML"
}

seal_secret() {
  SEALED_SECRET_YAML="sealed-temp-secret.yaml"
  kubeseal --controller-name=sealed-secrets --controller-namespace=armada < $TEMP_SECRET_YAML > $SEALED_SECRET_YAML

  echo "Sealed secret created: $SEALED_SECRET_YAML"
}

cleanup_temp_files() {
    cat $SEALED_SECRET_YAML
    rm -f $TEMP_SECRET_YAML
    rm -f $SEALED_SECRET_YAML
    echo "Temporary files cleaned up."
}

main() {
  check_inputs
  check_dependencies
  create_temp_secret
  seal_secret
  cleanup_temp_files
}

NAMESPACE=$1
KEY_NAME=$2
SECRETS=$3

main