#!/bin/bash

usage() {
  echo "Usage: $0 -n <namespace> -k <keyName> -s <secrets>"
  echo "  -n  The namespace for the secret (e.g., 'default' or 'my-namespace')"
  echo "  -k  The name of the secret (e.g., 'pgsodium-secret')"
  echo "  -s  The secrets in 'key=value&key2=value2' format (e.g., 'key1=value1&key2=value2')"
  exit 1
}

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

# Function to check if the 'armada' namespace exists
check_armada_namespace() {
  if ! kubectl get namespace "armada" &> /dev/null; then
    echo "Error: The namespace 'armada' does not exist. Please ensure the Sealed Secrets operator is running in the 'armada' namespace."
    exit 1
  else
    echo "Namespace 'armada' is present."
  fi
}

create_temp_secret() {
  # Generate the kubectl command to create the secret in dry-run mode and output as YAML
  SECRET_CMD="kubectl create secret generic $KEY_NAME --namespace $NAMESPACE"

  # Split SECRETS input by '&' and add each key-value pair to SECRET_CMD
  IFS='&' read -ra SECRETS_ARRAY <<< "$SECRETS"
  for secret in "${SECRETS_ARRAY[@]}"; do
    # Split key and value by the first '=' only
    KEY="${secret%%=*}"
    VALUE="${secret#*=}"
    # Validate that key is not empty
    if [[ -z "$KEY" || -z "$VALUE" ]]; then
      echo "Error: Invalid secret format '$secret'. Must be in 'key=value' format."
      exit 1
    fi
    # Append the key-value pair to the kubectl command
    SECRET_CMD="$SECRET_CMD --from-literal=${KEY}='${VALUE}'"
  done

  # Run the kubectl command in dry-run mode and capture the output in TEMP_SECRET_YAML variable
  TEMP_SECRET_YAML=$(eval "$SECRET_CMD --dry-run=client -o yaml")
}




seal_secret() {
  echo "$TEMP_SECRET_YAML" | kubeseal --controller-name=sealed-secrets --controller-namespace=armada --format=yaml
}

# Parse arguments using getopts
NAMESPACE=""
KEY_NAME=""
SECRETS=""

while [[ $# -gt 0 ]]; do
  case $1 in
    -n|--namespace)
      NAMESPACE="$2"
      shift 2
      ;;
    -k|--keyName)
      KEY_NAME="$2"
      shift 2
      ;;
    -s|--secrets)
      SECRETS="$2"
      shift 2
      ;;
    *)
      usage
      ;;
  esac
done

# Check inputs and dependencies
if [ -z "$NAMESPACE" ] || [ -z "$KEY_NAME" ] || [ -z "$SECRETS" ]; then
  usage
fi

check_dependencies
check_armada_namespace

# Create and seal the secret in memory and output the sealed YAML directly
create_temp_secret
seal_secret
