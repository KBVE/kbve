#!/usr/bin/env bash
# Build a Modrinth .mrpack modpack containing the behavior_statetree client mod.
#
# Usage:
#   cd apps/mc/behavior_statetree
#   ./mrpack/build-mrpack.sh
#
# Prerequisites:
#   - Java mod built: java/build/libs/behavior_statetree-<version>.jar
#   - sha1sum / shasum available
#
# Output:
#   mrpack/dist/kbve-mc-client-<version>.mrpack

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
DIST_DIR="$SCRIPT_DIR/dist"
WORK_DIR="$DIST_DIR/work"

# ── Version — reads from version.toml (single source of truth) ───────
VERSION_FILE="$SCRIPT_DIR/../../version.toml"
if [ -f "$VERSION_FILE" ]; then
    PACK_VERSION=$(grep -E '^version' "$VERSION_FILE" | head -1 | sed 's/.*"\(.*\)"/\1/')
else
    echo "ERROR: version.toml not found at $VERSION_FILE"
    exit 1
fi

MOD_JAR="$SCRIPT_DIR/../java/build/libs/behavior_statetree-${PACK_VERSION}.jar"
PACK_NAME="KBVE MC Client"
MC_VERSION="1.21.11"
LOADER_VERSION="0.18.6"

echo "=== Building mrpack v${PACK_VERSION} ==="

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

# Generate modrinth.index.json
cat > "$WORK_DIR/modrinth.index.json" << MANIFEST
{
  "formatVersion": 1,
  "game": "minecraft",
  "versionId": "${PACK_VERSION}",
  "name": "${PACK_NAME}",
  "summary": "Client-side modpack for KBVE MC server — ship rendering, AI integration, BYG biomes, and Fabric API.",
  "dependencies": {
    "minecraft": "${MC_VERSION}",
    "fabric-loader": "${LOADER_VERSION}"
  },
  "files": [
    {
      "path": "mods/fabric-api-0.141.3+1.21.11.jar",
      "hashes": {
        "sha1": "50de67eb221f0b38216da8668b09ca311327040e",
        "sha512": "c20c017e23d6d2774690d0dd774cec84c16bfac5461da2d9345a1cd95eee495b1954333c421e3d1c66186284d24a433f6b0cced8021f62e0bfa617d2384d0471"
      },
      "downloads": [
        "https://cdn.modrinth.com/data/P7dR8mSH/versions/i5tSkVBH/fabric-api-0.141.3%2B1.21.11.jar"
      ],
      "fileSize": 2412693,
      "env": { "client": "required", "server": "unsupported" }
    },
    {
      "path": "mods/TerraBlender-fabric-1.21.11-21.11.0.0.jar",
      "hashes": {
        "sha1": "e4bd1aee6bc8c56ae77647a06f31a3bd981962a6",
        "sha512": "05bed03e80351e7795cfbe1a9375e54a8a326552379737d8e5dcd400c4a36fefdf57f18468b95121556576d1ef549aa397a638114acd30eab69342d86b576814"
      },
      "downloads": [
        "https://cdn.modrinth.com/data/kkmrDlKT/versions/chxo508B/TerraBlender-fabric-1.21.11-21.11.0.0.jar"
      ],
      "fileSize": 341308,
      "env": { "client": "required", "server": "unsupported" }
    },
    {
      "path": "mods/Corgilib-Fabric-1.21.11-9.0.0.0.jar",
      "hashes": {
        "sha1": "687e58061bed7d5e37776fe414076debb5292625",
        "sha512": "bf124b2b15009335091f3b88d32bc7b01f3866ff604a518eb86d5e6f5d78da938d12d1ef12c8b2c33b98b2463d9c35b25b63d0fb88b8a4040f2876b9367d35aa"
      },
      "downloads": [
        "https://cdn.modrinth.com/data/ziOp6EO8/versions/y5NhX0ok/Corgilib-Fabric-1.21.11-9.0.0.0.jar"
      ],
      "fileSize": 685859,
      "env": { "client": "required", "server": "unsupported" }
    },
    {
      "path": "mods/geckolib-fabric-1.21.11-5.4.5.jar",
      "hashes": {
        "sha1": "41cd2e142e48a8b6604d85764a6466fe5edb70c3",
        "sha512": "e3fec3a07fd2a39af287cfa682f531913a6b82af5c23b60a231e8586ed1c5b1d2857f6714fa069315a1d7366c0d148d167178a9531b59629d488eb1cace6c97e"
      },
      "downloads": [
        "https://cdn.modrinth.com/data/8BmcQJ2H/versions/G1BvHQDL/geckolib-fabric-1.21.11-5.4.5.jar"
      ],
      "fileSize": 822664,
      "env": { "client": "required", "server": "unsupported" }
    },
    {
      "path": "mods/Oh-The-Trees-Youll-Grow-fabric-1.21.11-9.0.0.jar",
      "hashes": {
        "sha1": "abdcfd53514cce7110638866ec1716faa50e8cb1",
        "sha512": "baaba419736f67fe35b4699e720c9ed5a0b1dc3fb782711b741c0c6615c13ef24fbf53edd353ec6d6b8125894466d036b18b5d92213880eb5f3b468243b47c99"
      },
      "downloads": [
        "https://cdn.modrinth.com/data/g8NOG5OR/versions/RttF1Lcs/Oh-The-Trees-Youll-Grow-fabric-1.21.11-9.0.0.jar"
      ],
      "fileSize": 124378,
      "env": { "client": "required", "server": "unsupported" }
    },
    {
      "path": "mods/Oh-The-Biomes-Weve-Gone-Fabric-4.3.3.jar",
      "hashes": {
        "sha1": "d6fa332917da0d8e7cd401b4537923c62cc79a07",
        "sha512": "3999f436721d63e2c80fd35725d7449f1d3ccb999c5e71a46e7a2992f9594d2719c721dda0845f8795c54f458540d5f815217bdca0c6c29d8a8340189b45b484"
      },
      "downloads": [
        "https://cdn.modrinth.com/data/NTi7d3Xc/versions/zfKCnGWj/Oh-The-Biomes-Weve-Gone-Fabric-4.3.3.jar"
      ],
      "fileSize": 20866497,
      "env": { "client": "required", "server": "unsupported" }
    },
    {
      "path": "mods/ForgeConfigAPIPort-v21.11.1-mc1.21.11-Fabric.jar",
      "hashes": {
        "sha1": "61aa1b5fafd75afc44552d0213cac39bc938bc2d",
        "sha512": "28791c992d613da14b8685505d3ef632ed53b5f1e1d517f0b41677d10f8419f192dfbde991308df6cda5d0f113c0aa8fc18ecf4a0834029403b16d2f68dc52d6"
      },
      "downloads": [
        "https://cdn.modrinth.com/data/ohNO6lps/versions/uXrWPsCu/ForgeConfigAPIPort-v21.11.1-mc1.21.11-Fabric.jar"
      ],
      "fileSize": 598009,
      "env": { "client": "required", "server": "unsupported" }
    },
    {
      "path": "mods/sootychimneys-fabric-1.3.4.jar",
      "hashes": {
        "sha1": "581f752d94dc8cf160bbd01fba4b5934ba2e9420",
        "sha512": "15899697947d3733902d34f230a85e6b8ca4a51fe76570c0af42f52916bb49199cb88af5208cee706ae7c7a8f2aa04d5621c3d45439ef208b238c6de0f5f31ce"
      },
      "downloads": [
        "https://cdn.modrinth.com/data/b3w1XM9H/versions/KZ9rHjKU/sootychimneys-fabric-1.3.4.jar"
      ],
      "fileSize": 170257,
      "env": { "client": "required", "server": "unsupported" }
    },
    {
      "path": "mods/wilderflowers-1.0.4+1.21.11-fabric.jar",
      "hashes": {
        "sha1": "6094531a6bd1fe14b3a5c34f3dce846984798f4e",
        "sha512": "168d22fe62c25797b034339999b695761694c3d6369009da60034ed12c2a6e4fb79bc340c75dd53da31923cf002d98505b16ab43987f1361a9f1ded28a7e719b"
      },
      "downloads": [
        "https://cdn.modrinth.com/data/8lUQapTY/versions/pzZ7fqlk/wilderflowers-1.0.4%2B1.21.11-fabric.jar"
      ],
      "fileSize": 3091196,
      "env": { "client": "required", "server": "unsupported" }
    },
    {
      "path": "mods/modmenu-17.0.0.jar",
      "hashes": {
        "sha1": "544a8b340ac3918d85bcc7d02eaff5372814354b",
        "sha512": "146f8c356f86c32e5aab76598e021ac123779c89fc7a51a486fccd2871d2751b02046b4eea3194e52f2e7f38abbb5f78301c8f49bde6e60e1839677db9c84e33"
      },
      "downloads": [
        "https://cdn.modrinth.com/data/mOgUt4GM/versions/Tyk71iSw/modmenu-17.0.0.jar"
      ],
      "fileSize": 1115809,
      "env": { "client": "required", "server": "unsupported" }
    },
    {
      "path": "mods/FallingTree-1.21.11-1.21.11.3.jar",
      "hashes": {
        "sha1": "9daded812605231a5e1e9461a6e04258d0424761",
        "sha512": "56b8b86846e65f9e070ee08af1baf0b8871ea5eb233a43961d0f937a6147f039eed44794a6b3661b4748e4da037e40aa48b903936960585b626bc9f5e9e308d9"
      },
      "downloads": [
        "https://cdn.modrinth.com/data/Fb4jn8m6/versions/Hnj3s9Ez/FallingTree-1.21.11-1.21.11.3.jar"
      ],
      "fileSize": 488371,
      "env": { "client": "optional", "server": "required" }
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
echo "with behavior_statetree, BYG + deps, and Fabric API."
