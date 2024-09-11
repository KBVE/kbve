#!/bin/bash

# Function to check if Ubuntu version is 20.04, 22.04, or 24.04
check_ubuntu_version() {
    VERSION=$(lsb_release -rs)
    if [[ "$VERSION" =~ ^(20.04|22.04|24.04)$ ]]; then
        echo "Ubuntu $VERSION detected."
    else
        echo "Error: This script supports only Ubuntu 20.04, 22.04, or 24.04 LTS."
        exit 1
    fi
}

# Function to prepare the worker for RKE2 installation
prepare_worker() {
    echo "Preparing the worker for RKE2 installation..."
    
    # Stop and disable UFW (software firewall)
    if ! systemctl disable --now ufw; then
        echo "Error: Failed to disable UFW."
        exit 1
    fi

    # Update package lists, install NFS, and apply updates
    if ! apt update || ! apt install nfs-common -y || ! apt upgrade -y; then
        echo "Error: Failed to update packages or install NFS."
        exit 1
    fi

    # Clean up unnecessary packages
    if ! apt autoremove -y; then
        echo "Error: Failed to clean up unused packages."
        exit 1
    fi

    echo "Worker preparation complete."
}

# Main script execution
main() {
    check_ubuntu_version
    prepare_worker

}

# Run the main function
main
