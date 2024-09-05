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

# Function to prepare the server for RKE2 installation
prepare_server() {
    echo "Preparing the server for RKE2 installation..."
    
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

    echo "Server preparation complete."
}

# Function to install RKE2
install_rke2() {
    echo "Installing RKE2 server..."
    
    # Install RKE2
    if ! curl -sfL https://get.rke2.io | INSTALL_RKE2_TYPE=server sh -; then
        echo "Error: Failed to install RKE2 server."
        exit 1
    fi

    # Create config directory and set token
    mkdir -p /etc/rancher/rke2/
    echo "token: bootstrapAllTheThings" > /etc/rancher/rke2/config.yaml

    # Enable and start RKE2 service
    if ! systemctl enable --now rke2-server.service; then
        echo "Error: Failed to start and enable RKE2 server."
        exit 1
    fi

    echo "RKE2 installation complete."
}

# Main script execution
main() {
    check_ubuntu_version
    prepare_server
    install_rke2
}

# Run the main function
main
