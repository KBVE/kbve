#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PACK_DIR="${SCRIPT_DIR}/../data/resource-pack"
OUT_DIR="${SCRIPT_DIR}/../data/resource-pack-dist"
ZIP_NAME="kbve-resource-pack.zip"
FEATURES_FILE="${SCRIPT_DIR}/../data/config/features.toml"

mkdir -p "${OUT_DIR}"

# Zip the resource pack (contents at root of zip, not nested)
cd "${PACK_DIR}"
zip -r "${OUT_DIR}/${ZIP_NAME}" . -x '.*' -x '__MACOSX/*'

# Compute SHA1
SHA1=$(sha1sum "${OUT_DIR}/${ZIP_NAME}" | awk '{print $1}')
echo "Resource pack SHA1: ${SHA1}"

# Write features.toml with resource_pack section
# The URL should be updated for production deployments
cat > "${FEATURES_FILE}" <<EOF
[resource_pack]
enabled = true
url = "http://host.docker.internal:8080/kbve-resource-pack.zip"
sha1 = "${SHA1}"
force = true
prompt_message = "KBVE Resource Pack - Custom items and textures"
EOF

echo "Resource pack built: ${OUT_DIR}/${ZIP_NAME}"
echo "Config written: ${FEATURES_FILE}"
