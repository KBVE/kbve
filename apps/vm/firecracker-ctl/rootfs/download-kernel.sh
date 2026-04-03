#!/bin/sh
# Download a pre-built Firecracker-compatible Linux kernel.
#
# Firecracker maintains pre-built vmlinux binaries on their GitHub releases.
# These kernels are minimal (no modules, no initrd needed) and boot in ~125ms.
#
# Usage:
#   ./download-kernel.sh [output_dir]
#
# The vmlinux binary is placed in the output directory (default: current dir).
# Upload it to the firecracker-rootfs PVC alongside the ext4 rootfs images.

set -eu

FC_KERNEL_VERSION="${FC_KERNEL_VERSION:-5.10}"
FC_VERSION="${FC_VERSION:-1.10.1}"
OUTPUT_DIR="${1:-.}"
ARCH="x86_64"

KERNEL_URL="https://github.com/firecracker-microvm/firecracker/releases/download/v${FC_VERSION}/vmlinux-${FC_KERNEL_VERSION}.bin"
OUTPUT_FILE="${OUTPUT_DIR}/vmlinux"

echo "Downloading Firecracker kernel ${FC_KERNEL_VERSION} (Firecracker v${FC_VERSION})..."
echo "  URL: ${KERNEL_URL}"
echo "  Output: ${OUTPUT_FILE}"

if command -v curl >/dev/null 2>&1; then
    curl -fSL "${KERNEL_URL}" -o "${OUTPUT_FILE}"
elif command -v wget >/dev/null 2>&1; then
    wget -q "${KERNEL_URL}" -O "${OUTPUT_FILE}"
else
    echo "Error: curl or wget required" >&2
    exit 1
fi

chmod 644 "${OUTPUT_FILE}"
echo "Done. Kernel saved to ${OUTPUT_FILE} ($(wc -c < "${OUTPUT_FILE}") bytes)"
