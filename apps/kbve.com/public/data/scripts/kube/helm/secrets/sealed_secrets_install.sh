#!/bin/bash

function checks_required_commands {
    function check_command {
        if ! command -v $1 &> /dev/null
        then
            echo "$1 is not installed. Please install it before running this script."
            exit 1
        fi
    }

    # Check if helm and kubectl are installed
    check_command helm
    check_command kubectl
}

function sealed_secrets_installer {
    NAMESPACE=sealed-secrets
    kubectl create namespace $NAMESPACE || echo "Namespace '$NAMESPACE' already exists"

    helm repo add sealed-secrets https://bitnami-labs.github.io/sealed-secrets
    helm repo update
    helm install sealed-secrets sealed-secrets/sealed-secrets --namespace $NAMESPACE

    echo "Sealed Secrets installed successfully!"
}


function main {
    checks_required_commands
    sealed_secrets_installer
}

main
