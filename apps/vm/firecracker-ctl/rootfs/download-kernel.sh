#!/bin/sh
# Download a pre-built Firecracker-compatible Linux kernel from the CI bucket.
#
# Firecracker publishes minimal vmlinux binaries (no modules/initrd) under
# s3.amazonaws.com/spec.ccfc.min/firecracker-ci/<ci>/<arch>/vmlinux-<kernel>.
# Release-asset kernels were removed; only firecracker/jailer tgz ship there.
#
# Usage:
#   ./download-kernel.sh [output_dir]
#
# The vmlinux binary is placed in the output directory (default: current dir).
# Upload it to the firecracker-rootfs PVC alongside the ext4 rootfs images.

set -eu

FC_CI_VERSION="${FC_CI_VERSION:-v1.15}"
FC_KERNEL_VERSION="${FC_KERNEL_VERSION:-6.1.155}"
OUTPUT_DIR="${1:-.}"
ARCH="x86_64"

KERNEL_URL="https://s3.amazonaws.com/spec.ccfc.min/firecracker-ci/${FC_CI_VERSION}/${ARCH}/vmlinux-${FC_KERNEL_VERSION}"
OUTPUT_FILE="${OUTPUT_DIR}/vmlinux"

echo "Downloading Firecracker kernel ${FC_KERNEL_VERSION} (CI ${FC_CI_VERSION}, ${ARCH})..."
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
