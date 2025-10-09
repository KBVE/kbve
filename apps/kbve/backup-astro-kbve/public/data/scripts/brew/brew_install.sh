#!/bin/bash

# Function to install dependencies
install_dependencies() {
    echo "Installing required dependencies..."
    sudo apt-get update
    sudo apt-get install -y build-essential procps curl file git
}

# Function to install Homebrew
install_brew() {
    echo "Installing Homebrew..."
    /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
}

# Function to configure Homebrew environment
configure_brew() {
    echo "Configuring Homebrew..."
    echo 'eval "$(/home/linuxbrew/.linuxbrew/bin/brew shellenv)"' >> ~/.bashrc
    source ~/.bashrc
}

# Function to verify installation
verify_installation() {
    echo "Verifying Homebrew installation..."
    brew --version
}

# Main function to run all tasks
main() {
    install_dependencies
    install_brew
    configure_brew
    verify_installation
}

# Execute main function
main
