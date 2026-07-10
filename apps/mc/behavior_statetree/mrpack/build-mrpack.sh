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
  "summary": "Client-side modpack for KBVE MC server — Immersive Aircraft, AI integration, BYG biomes, and Fabric API.",
  "dependencies": {
    "minecraft": "${MC_VERSION}",
    "fabric-loader": "${LOADER_VERSION}"
  },
  "files": [
    {
      "path": "mods/fabric-api-0.141.4+1.21.11.jar",
      "hashes": {
        "sha1": "13d3885dfec40313e2b3bf9ee639353272b9b48a",
        "sha512": "c092d48c6453bec3264f80f6a35bb334aba3112b5cd6c0e0b2676ce4d81e702cb1e522337f3a732348e757cc2226da3c601a314ae8766334f16af71a13bcc98d"
      },
      "downloads": [
        "https://cdn.modrinth.com/data/P7dR8mSH/versions/5zJNhXV2/fabric-api-0.141.4%2B1.21.11.jar"
      ],
      "fileSize": 2413332,
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
    },
    {
      "path": "mods/configurable-3.5.1+1.21.11-fabric.jar",
      "hashes": {
        "sha1": "d344b1d4659eea87110d6cb31033ebe91fc92851",
        "sha512": "1efe4739d8edb4fe2cbecd99faab640ec76caca80bc448cce5538bc9e1457ed868676fe28ff3089ef21bf5ff73ad9635cde117c1c5bb6834cd1b4bdf42e535eb"
      },
      "downloads": [
        "https://cdn.modrinth.com/data/lGffrQ3O/versions/FK6nyY14/configurable-3.5.1%2B1.21.11-fabric.jar"
      ],
      "fileSize": 545295,
      "env": { "client": "optional", "server": "optional" }
    },
    {
      "path": "mods/neruina-3.3.2+1.21.11-fabric.jar",
      "hashes": {
        "sha1": "de6c68dc674074f2df1031fe6c3d245a0807adc8",
        "sha512": "dd9c0a0d8117d0b6968bb6530eb9877b9cf699f6fde43a76ce676ce55417e90dda60a789f5fe249404727d4ccd47a24855f2b3a89f294e80aed907967849c66f"
      },
      "downloads": [
        "https://cdn.modrinth.com/data/1s5x833P/versions/AkJjv6jb/neruina-3.3.2%2B1.21.11-fabric.jar"
      ],
      "fileSize": 1814135,
      "env": { "client": "optional", "server": "optional" }
    },
    {
      "path": "mods/blahaj-replushed-4.0.0+1.21.11.jar",
      "hashes": {
        "sha1": "e02c9d72077cb84d11f0de9d5127f53fc729ff8f",
        "sha512": "3f318a4d66407497035bdd6b1b3af891f1e61280115e89c87dc168c159be72db6a644b1142fe231ae434089b3660cab318800f033a5929c11951480b1cb01199"
      },
      "downloads": [
        "https://cdn.modrinth.com/data/5bb5rG4b/versions/enjEypbi/blahaj-replushed-4.0.0%2B1.21.11.jar"
      ],
      "fileSize": 176248,
      "env": { "client": "required", "server": "required" }
    },
    {
      "path": "mods/skyboxify-2.7+1.21.11-fabric.jar",
      "hashes": {
        "sha1": "a127d9ebdc3cbd67f52dc14315b5bec46737d3fd",
        "sha512": "3f6cec0b1f5d20f2eb6a7d7a66607430e6bd361f93130e6df3a322209a567291bcbfd1f954fff54f91d637690a545d7cabecf4968e28fbb097592334f01dc55e"
      },
      "downloads": [
        "https://cdn.modrinth.com/data/DWuwk8aA/versions/A78kPZ7I/skyboxify-2.7%2B1.21.11-fabric.jar"
      ],
      "fileSize": 424802,
      "env": { "client": "required", "server": "unsupported" }
    },
    {
      "path": "mods/midnightlib-fabric-1.9.2+1.21.11.jar",
      "hashes": {
        "sha1": "b9617fa5722a8cdc321781a2b6dd97217fcfdc2a",
        "sha512": "2a9a14bc6e41ec84f4eb017f3b41ba0b2bf9a4c98ba1b677775c051dcc755c1694cf55a0758f49e91c6792de84198142ba678d57ae0f7def54bdaad4a7e7a182"
      },
      "downloads": [
        "https://cdn.modrinth.com/data/codAaoxh/versions/OeTayxh3/midnightlib-fabric-1.9.2%2B1.21.11.jar"
      ],
      "fileSize": 58944,
      "env": { "client": "optional", "server": "optional" }
    },
    {
      "path": "mods/PuzzlesLib-v21.11.12-mc1.21.11-Fabric.jar",
      "hashes": {
        "sha1": "f502faff2063b34cfca40cfada13e4fecf69e7fc",
        "sha512": "dbf4c97191455fe8e3c6801ddacc17d5157b5922f15a40e490ee0e2b172fe4718f4e5ec93ed244224aa077c7f53dcf30657ca68ac2d7f5692066ea7020af1542"
      },
      "downloads": [
        "https://cdn.modrinth.com/data/QAGBst4M/versions/owXZpJai/PuzzlesLib-v21.11.12-mc1.21.11-Fabric.jar"
      ],
      "fileSize": 1124024,
      "env": { "client": "optional", "server": "optional" }
    },
    {
      "path": "mods/FarmersDelight-1.21.11-3.4.9+refabricated.jar",
      "hashes": {
        "sha1": "7c51a74bed32f4c55a22cc87690109c9379c682e",
        "sha512": "732255187fdb84f71a5e22cb331d068a1a513e51c90e5970f2d31c424973dda3c2c16da49b02df582e23f5af9b8080bef79ef8e627b8ede6ddfcaddccaf245da"
      },
      "downloads": [
        "https://cdn.modrinth.com/data/7vxePowz/versions/ZP4Uof9C/FarmersDelight-1.21.11-3.4.9%2Brefabricated.jar"
      ],
      "fileSize": 3223675,
      "env": { "client": "required", "server": "required" }
    },
    {
      "path": "mods/chefs-delight-1.0.5-fabric-1.21.11.jar",
      "hashes": {
        "sha1": "7848579a9cc8be4299de98010741e03edca7d4d8",
        "sha512": "cae5e68b53dde6cb9320d4ef33ca764fc69e52b64a3ce63c5f2aa75012430f3866e86401d0b0dea74b702a4ff9999e9bba5bdf28729ed68348afb3c75f6e758b"
      },
      "downloads": [
        "https://cdn.modrinth.com/data/pvcsfne4/versions/EXu0Q4KH/chefs-delight-1.0.5-fabric-1.21.11.jar"
      ],
      "fileSize": 110671,
      "env": { "client": "required", "server": "required" }
    },
    {
      "path": "mods/MagnumTorch-v21.11.0-mc1.21.11-Fabric.jar",
      "hashes": {
        "sha1": "cf3f0ae62a8c9122b81d54b0bc834183e4a0bc5a",
        "sha512": "22116a60f38f832a799bb9abe4174fc5261d8e551671420c562809f91dff07bb32d37552656a017662afa1d3aee1a8ca7a00be1e581ce61e8a87c72a03fe9710"
      },
      "downloads": [
        "https://cdn.modrinth.com/data/jorDmSKv/versions/ggEj5Dcf/MagnumTorch-v21.11.0-mc1.21.11-Fabric.jar"
      ],
      "fileSize": 94375,
      "env": { "client": "required", "server": "required" }
    },
    {
      "path": "mods/TslatEntityStatus-fabric-1.21.11-1.9.2.jar",
      "hashes": {
        "sha1": "ac77b9ae97686f601cbb4cba1c34b6c1587eaadc",
        "sha512": "ed12d8678b89781772fd50972a8bab4a781a91ff9e879f2d39a3212df46c135eff7f4283291d040ce3b812126ad9b2c53f9505ff0d945d5f473fb277aa66585a"
      },
      "downloads": [
        "https://cdn.modrinth.com/data/4A86JsDZ/versions/gC9DblyC/TslatEntityStatus-fabric-1.21.11-1.9.2.jar"
      ],
      "fileSize": 188145,
      "env": { "client": "required", "server": "required" }
    },
    {
      "path": "mods/jei-1.21.11-fabric-27.4.0.22.jar",
      "hashes": {
        "sha1": "dba6319ab4cad596d74f520ae608a5cae84ba245",
        "sha512": "4de9d355a9a7325590b2064d84e93e217051dc44e2b38f063ad347998af3f0f3a4d1655a020b23d955d78cc66b5443d4f4d5f63a82ac2c0b206b23d9dc1d30ce"
      },
      "downloads": [
        "https://cdn.modrinth.com/data/u6dRKJwZ/versions/oHe0elMI/jei-1.21.11-fabric-27.4.0.22.jar"
      ],
      "fileSize": 1530964,
      "env": { "client": "optional", "server": "optional" }
    },
    {
      "path": "mods/appleskin-fabric-mc1.21.11-3.0.8.jar",
      "hashes": {
        "sha1": "441fdbf4e9c34fb61517ceb8e15618950dc4d314",
        "sha512": "d32206cb8d6fac7f0b579f7269203135777283e1639ccb68f8605e9f5469b5b54305fd36ba82c64b48b89ae4f1a38501bfb5827284520c3ec622d95edcfa34de"
      },
      "downloads": [
        "https://cdn.modrinth.com/data/EsAfCjCV/versions/59ti1rvg/appleskin-fabric-mc1.21.11-3.0.8.jar"
      ],
      "fileSize": 180107,
      "env": { "client": "optional", "server": "optional" }
    },
    {
      "path": "mods/cloth-config-21.11.153-fabric.jar",
      "hashes": {
        "sha1": "4c224606a963bce223db5b27edb4959ecf40d4ee",
        "sha512": "8f455489d4b71069e998568cf4e1450116f4360a4eb481cd89117f629c6883164886cf63ca08ac4fc929dd13d1112152755a6216d4a1498ee6406ef102093e51"
      },
      "downloads": [
        "https://cdn.modrinth.com/data/9s6osm5g/versions/xuX40TN5/cloth-config-21.11.153-fabric.jar"
      ],
      "fileSize": 1148427,
      "env": { "client": "required", "server": "unsupported" }
    },
    {
      "path": "mods/travelersbackpack-fabric-1.21.11-10.11.9.jar",
      "hashes": {
        "sha1": "fb2d5a2fd919ee127d9a170e3e85f798edb852a5",
        "sha512": "308ae2d6b0118173fb17b18d1ada137d11de38190171962a4d763d948db30c54543f205a5d5d1c9c5415bab33b4e3a222bbab230be80eb0cf68c8b86593e3567"
      },
      "downloads": [
        "https://cdn.modrinth.com/data/rlloIFEV/versions/XbEGJQSG/travelersbackpack-fabric-1.21.11-10.11.9.jar"
      ],
      "fileSize": 1573637,
      "env": { "client": "required", "server": "required" }
    },
    {
      "path": "mods/mcw-paintings-1.1.0-mc1.21.11fabric.jar",
      "hashes": {
        "sha1": "580ba60f2811796b7906ebc7edea053849a0d1fd",
        "sha512": "e92b728a3852a585238189bd29a1c35f907b780a31a56b246246d1fdba499850d3bba434b0383461d328ceda0b2f8d193cd50d5eb4ef890b28163f17fdac9e48"
      },
      "downloads": [
        "https://cdn.modrinth.com/data/okE6QVAY/versions/VPvufXfe/mcw-paintings-1.1.0-mc1.21.11fabric.jar"
      ],
      "fileSize": 179390,
      "env": { "client": "required", "server": "required" }
    },
    {
      "path": "mods/fabric-language-kotlin-1.13.10+kotlin.2.3.20.jar",
      "hashes": {
        "sha1": "9873294abf498f509453d37b0a5ba019f4570ffb",
        "sha512": "e4eaf7594de08eb4f3ea8af2e939f3ee61d07597afb4d5f420c3fbadcb381c7bbad4b1afd5919b3087b73ed9636fb018b1c978858a112bd4f6acdcb42e9eedaa"
      },
      "downloads": [
        "https://cdn.modrinth.com/data/Ha28R6CL/versions/21TRTKmh/fabric-language-kotlin-1.13.10%2Bkotlin.2.3.20.jar"
      ],
      "fileSize": 7796348,
      "env": { "client": "required", "server": "unsupported" }
    },
    {
      "path": "mods/optigui-2.3.0-beta.10+1.21.9.jar",
      "hashes": {
        "sha1": "1e209418863e8fda53508e33a3251a59b1db7220",
        "sha512": "18e78345450df72a499f3788f88d7d740dd83e4106a3c6c1a40e1f3424ba2e11b24c072c46e6b21a69a9bff913ea82153c4d33fb731665b9a1aac824ab63192b"
      },
      "downloads": [
        "https://cdn.modrinth.com/data/JuksLGBQ/versions/QM4pzEcr/optigui-2.3.0-beta.10%2B1.21.9.jar"
      ],
      "fileSize": 611547,
      "env": { "client": "required", "server": "unsupported" }
    },
    {
      "path": "mods/open-parties-and-claims-fabric-1.21.11-0.27.5.jar",
      "hashes": {
        "sha1": "52156f795ce0751dfc89553f3e928bd4e635a4a0",
        "sha512": "758f15e4a4f538dfe0a8b33f2e06352f0511b80e5da08d2cddd65f0ae1bf1e943897daac3c80c2c1014bc3e9ac5d461971c13dc74b5fd6c750ce9f630146693d"
      },
      "downloads": [
        "https://cdn.modrinth.com/data/gF3BGWvG/versions/DEb4IjSQ/open-parties-and-claims-fabric-1.21.11-0.27.5.jar"
      ],
      "fileSize": 1733277,
      "env": { "client": "required", "server": "required" }
    },
    {
      "path": "mods/xaeroworldmap-fabric-1.21.11-1.42.0.jar",
      "hashes": {
        "sha1": "769de7224f438e4f2a68a916a12434df723ee53d",
        "sha512": "8954bab48226fb16d209adf644151d4bc95c7e5185f6139d08ff9a16196561598b76c197f693de1e1459d0903439092cb1911302754a7f4f85088dedfde207d1"
      },
      "downloads": [
        "https://cdn.modrinth.com/data/NcUtCpym/versions/xpNaeY2J/xaeroworldmap-fabric-1.21.11-1.42.0.jar"
      ],
      "fileSize": 1451677,
      "env": { "client": "required", "server": "optional" }
    },
    {
      "path": "mods/immersive_aircraft-1.4.7+1.21.11-fabric.jar",
      "hashes": {
        "sha1": "a3c652a1cbf6bcb8f2216de83f8fe9cc20f470f7",
        "sha512": "7fe80a4b63996e84b218f998df06d2cd759736acc10d59b4018bc284e40d0176f5b349a79adc0f197dc7447d11fb8a2bfd3c13bc34318c376ec01c853113e117"
      },
      "downloads": [
        "https://cdn.modrinth.com/data/x3HZvrj6/versions/NshGBorp/immersive_aircraft-1.4.7%2B1.21.11-fabric.jar"
      ],
      "fileSize": 2459574,
      "env": { "client": "required", "server": "required" }
    },
    {
      "path": "mods/xaerominimap-fabric-1.21.11-26.2.0.jar",
      "hashes": {
        "sha1": "7a3d174fd12c0406db8a8106b3d76c655e86b207",
        "sha512": "6b9e28081f300ede43c8cb3cbd410277a704ecdeb7a2b77fa7f1a746dbc4a09652a1a91a328e4e1d523a9edc94ae9817f29c9e0f0fefe6f78d2d8dd23ce8e3d7"
      },
      "downloads": [
        "https://cdn.modrinth.com/data/1bokaNcj/versions/z6442Xnl/xaerominimap-fabric-1.21.11-26.2.0.jar"
      ],
      "fileSize": 2190380,
      "env": { "client": "required", "server": "optional" }
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
