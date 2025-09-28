#!/bin/bash

EMSDK_DIR="$HOME/emsdk"

set -e

## Format

info() {
  echo -e "\033[1;32m[INFO]\033[0m $1"
}

error() {
  echo -e "\033[1;31m[ERROR]\033[0m $1" >&2
  exit 1
}

## Pre Reqs.

if ! command -v git &> /dev/null; then
  error "Git is not installed. Please install Git and try again."
fi

if ! command -v python3 &> /dev/null; then
  error "Python 3 is not installed. Please install Python 3 and try again."
fi

## Clone

if [ -d "$EMSDK_DIR" ]; then
  info "Emsdk directory already exists. Pulling the latest changes."
  cd "$EMSDK_DIR"
  git pull
else
  info "Cloning the Emscripten SDK repository."
  git clone https://github.com/emscripten-core/emsdk.git "$EMSDK_DIR"
  cd "$EMSDK_DIR"
fi

info "Installing the latest Emscripten SDK."
./emsdk install latest

info "Activating the latest Emscripten SDK."
./emsdk activate latest

info "Setting up environment variables."
echo "source $EMSDK_DIR/emsdk_env.sh" >> ~/.bashrc
source "$EMSDK_DIR/emsdk_env.sh"

info "Verifying Emscripten installation."
if command -v emcc &> /dev/null; then
  EMCC_VERSION=$(emcc --version | head -n 1)
  info "Emscripten installed successfully: $EMCC_VERSION"
else
  error "Emscripten installation failed. Please check the logs."
fi


# git clone https://github.com/emscripten-core/emsdk.git
# cd emsdk
#./emsdk install latest
#./emsdk activate latest
# source ./emsdk_env.sh
