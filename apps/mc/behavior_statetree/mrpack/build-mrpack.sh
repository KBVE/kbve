#!/usr/bin/env bash
# Build a Modrinth .mrpack modpack containing the behavior_statetree client mod.
#
# Usage:
#   cd apps/mc/behavior_statetree
#   ./mrpack/build-mrpack.sh
#
# Prerequisites:
#   - Java mod built: java/build/libs/behavior_statetree-0.1.0.jar
#   - sha1sum / shasum available
#
# Output:
#   mrpack/dist/kbve-mc-client.mrpack

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
DIST_DIR="$SCRIPT_DIR/dist"
WORK_DIR="$DIST_DIR/work"

MOD_JAR="$SCRIPT_DIR/../java/build/libs/behavior_statetree-0.1.0.jar"
PACK_NAME="KBVE MC Client"
PACK_VERSION="0.1.0"
MC_VERSION="1.21.11"
LOADER_VERSION="0.18.6"

echo "=== Building mrpack ==="

# Check prerequisites
if [ ! -f "$MOD_JAR" ]; then
    echo "ERROR: Mod JAR not found at $MOD_JAR"
    echo "Build it first: cd java && gradle build --no-daemon"
    exit 1
fi

# Clean + create work directory
rm -rf "$WORK_DIR"
mkdir -p "$WORK_DIR/overrides/mods"

# Copy the mod JAR into overrides (bundled directly in the pack)
cp "$MOD_JAR" "$WORK_DIR/overrides/mods/behavior_statetree-${PACK_VERSION}.jar"

# Compute hashes
JAR_SIZE=$(wc -c < "$MOD_JAR" | tr -d ' ')
JAR_SHA1=$(shasum -a 1 "$MOD_JAR" | cut -d' ' -f1)
JAR_SHA512=$(shasum -a 512 "$MOD_JAR" | cut -d' ' -f1)

# Generate modrinth.index.json
cat > "$WORK_DIR/modrinth.index.json" << MANIFEST
{
  "formatVersion": 1,
  "game": "minecraft",
  "versionId": "${PACK_VERSION}",
  "name": "${PACK_NAME}",
  "summary": "Client-side mod for KBVE MC server — ship rendering, AI integration, and WASD helm controls.",
  "dependencies": {
    "minecraft": "${MC_VERSION}",
    "fabric-loader": "${LOADER_VERSION}"
  },
  "files": [
    {
      "path": "mods/fabric-api.jar",
      "hashes": {
        "sha1": "50de67eb221f0b38216da8668b09ca311327040e",
        "sha512": ""
      },
      "downloads": [
        "https://cdn.modrinth.com/data/P7dR8mSH/versions/i5tSkVBH/fabric-api-0.141.3%2B1.21.11.jar"
      ],
      "fileSize": 0,
      "env": {
        "client": "required",
        "server": "unsupported"
      }
    }
  ]
}
MANIFEST

# Build the mrpack (just a zip with .mrpack extension)
mkdir -p "$DIST_DIR"
MRPACK_FILE="$DIST_DIR/kbve-mc-client-${PACK_VERSION}.mrpack"
rm -f "$MRPACK_FILE"

cd "$WORK_DIR"
zip -r "$MRPACK_FILE" modrinth.index.json overrides/

echo ""
echo "=== mrpack built ==="
echo "  Output: $MRPACK_FILE"
echo "  Size: $(du -h "$MRPACK_FILE" | cut -f1)"
echo ""
echo "Players can import this in Prism Launcher / ATLauncher / MultiMC."
echo "It will install Fabric ${LOADER_VERSION} for MC ${MC_VERSION}"
echo "with the behavior_statetree client mod + Fabric API."
