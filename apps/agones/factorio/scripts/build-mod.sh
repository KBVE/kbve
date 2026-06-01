#!/usr/bin/env bash
# Packages mods-local/kbve into a Factorio mod-portal-ready zip.
#
# Output: apps/agones/factorio/mods-local/dist/kbve_<version>.zip
# The inner directory is renamed to "kbve_<version>" to satisfy the
# portal's "zip root must match <name>_<version>" rule.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MOD_ROOT="$(cd "$SCRIPT_DIR/../mods-local/kbve" && pwd)"
DIST_DIR="$(cd "$SCRIPT_DIR/../mods-local" && pwd)/dist"

if [ ! -f "$MOD_ROOT/info.json" ]; then
    echo "info.json not found at $MOD_ROOT" >&2
    exit 1
fi

NAME=$(jq -r .name "$MOD_ROOT/info.json")
VERSION=$(jq -r .version "$MOD_ROOT/info.json")
ZIP_NAME="${NAME}_${VERSION}.zip"
INNER_DIR="${NAME}_${VERSION}"

mkdir -p "$DIST_DIR"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

cp -R "$MOD_ROOT" "$WORK/$INNER_DIR"

# Strip dev cruft.
find "$WORK/$INNER_DIR" -name '.DS_Store' -delete

(cd "$WORK" && zip -qr "$DIST_DIR/$ZIP_NAME" "$INNER_DIR")
echo "Built: $DIST_DIR/$ZIP_NAME"
ls -l "$DIST_DIR/$ZIP_NAME"
