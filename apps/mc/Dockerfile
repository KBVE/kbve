# JAVA_BUILDER_IMAGE swaps in the pre-warmed Fabric Loom cache on production
# builds (ghcr.io/kbve/mc:gradle — Minecraft 1.21.11, Yarn, Loader, Fabric
# API already resolved into ~/.gradle/caches). Defaults to the vanilla
# gradle:jdk21 image so local/test builds don't depend on the cache existing
# in the registry — rebuild via `nx run mc:container-gradle:production`
# whenever the Loom/MC version pins in behavior_statetree/java/build.gradle
# change. CI's e2e test path stays on the default to avoid a cross-workflow
# race against ci-mc-gradle-cache.yml.
#
# Must be declared before the first FROM — Docker scopes a post-FROM ARG to
# the preceding stage, so a FROM later in the file would see it as blank.
ARG JAVA_BUILDER_IMAGE=gradle:jdk21

# ── Stage 1: Build Rust native libraries (.so) ────────────────────────
FROM rust:1.94-bookworm AS rust-builder
WORKDIR /build

# protoc + well-known types — required by the agones crate's build.rs.
# protobuf-compiler ships protoc; libprotobuf-dev ships google/protobuf/*.proto
# (descriptor.proto, struct.proto) which the agones SDK protos import.
RUN apt-get update && apt-get install -y --no-install-recommends \
    protobuf-compiler \
    libprotobuf-dev \
    && rm -rf /var/lib/apt/lists/*

# Standalone workspace with behavior_statetree + mc_auth + shared bevy crates.
# Uses the repo Cargo.lock for reproducible dependency resolution.
COPY Cargo.lock .
COPY apps/mc/behavior_statetree/ behavior_statetree/
COPY apps/mc/mc_auth/ mc_auth/
COPY packages/rust/bevy/bevy_npc/ bevy_npc/
COPY packages/rust/bevy/bevy_supa/ bevy_supa/
COPY packages/rust/bevy/bevy_pathfinding/ bevy_pathfinding/
COPY packages/rust/bevy/bevy_behavior/ bevy_behavior/

# Rewrite package path refs for the flattened Docker context.
# - behavior_statetree ← ../../../packages/rust/bevy/bevy_npc
# - behavior_statetree ← ../../../packages/rust/bevy/bevy_pathfinding
# - behavior_statetree ← ../../../packages/rust/bevy/bevy_behavior
# - mc_auth             ← ../../../packages/rust/bevy/bevy_supa
RUN sed -i 's|path = "../../../packages/rust/bevy/bevy_npc"|path = "../bevy_npc"|' behavior_statetree/Cargo.toml
RUN sed -i 's|path = "../../../packages/rust/bevy/bevy_pathfinding"|path = "../bevy_pathfinding"|' behavior_statetree/Cargo.toml
RUN sed -i 's|path = "../../../packages/rust/bevy/bevy_behavior"|path = "../bevy_behavior"|' behavior_statetree/Cargo.toml
RUN sed -i 's|path = "../../../packages/rust/bevy/bevy_supa"|path = "../bevy_supa"|' mc_auth/Cargo.toml
RUN printf '[workspace]\nresolver = "2"\nmembers = ["behavior_statetree", "mc_auth", "bevy_npc", "bevy_supa", "bevy_pathfinding", "bevy_behavior"]\n' > Cargo.toml

RUN cargo build -p behavior_statetree -p mc_auth --release
# Outputs:
#   /build/target/release/libbehavior_statetree.so
#   /build/target/release/libmc_auth.so

# ── Stage 2: Build Fabric mod JARs (bundle .so via processResources) ──
# JAVA_BUILDER_IMAGE is declared at the top of this file (pre-FROM ARG).
FROM ${JAVA_BUILDER_IMAGE} AS java-builder
WORKDIR /build

# Copy Java source for both Fabric mods
COPY apps/mc/behavior_statetree/java/ behavior_statetree/java/
COPY apps/mc/mc_auth/java/ mc_auth/java/

# version.toml — single source of truth for the MC stack version.
# build.gradle reads ../../version.toml relative to java/ so it
# needs to land at /build/version.toml. Without this, the JAR
# falls back to 0.0.0-dev and Modrinth publishes break.
COPY apps/mc/version.toml version.toml

# Place each .so where its Gradle processResources expects it.
# build.gradle: from("../../target/release") relative to java/
# behavior_statetree/java/ → ../../target/release = /build/target/release/
# mc_auth/java/             → ../../target/release = /build/target/release/
COPY --from=rust-builder /build/target/release/libbehavior_statetree.so target/release/libbehavior_statetree.so
COPY --from=rust-builder /build/target/release/libmc_auth.so target/release/libmc_auth.so

# Build behavior_statetree JAR — retry wrapper handles transient Mojang/Fabric
# CDN failures when using the vanilla gradle:jdk21 image (no pre-warmed cache).
# The pre-warmed JAVA_BUILDER_IMAGE (ghcr.io/kbve/mc:gradle) hits cache and
# never downloads, so the retry is a no-op in production builds.
WORKDIR /build/behavior_statetree/java
RUN gradle build --no-daemon \
    || (echo "Retry 1: behavior_statetree" && gradle build --no-daemon) \
    || (echo "Retry 2: behavior_statetree" && gradle build --no-daemon)
# Output: /build/behavior_statetree/java/build/libs/*.jar

# Build mc_auth JAR
WORKDIR /build/mc_auth/java
RUN gradle build --no-daemon \
    || (echo "Retry 1: mc_auth" && gradle build --no-daemon) \
    || (echo "Retry 2: mc_auth" && gradle build --no-daemon)
# Output: /build/mc_auth/java/build/libs/*.jar

# ── Stage 3: Runtime ──────────────────────────────────────────────────
FROM itzg/minecraft-server:java25

ENV TYPE=FABRIC
ENV VERSION=1.21.11
ENV FABRIC_LOADER_VERSION=0.18.6
ENV EULA=TRUE

ENV MEMORY=3G

ENV ENABLE_RCON=true
ENV RCON_PORT=25575

ENV MOTD="KBVE Minecraft Server"
ENV MAX_PLAYERS=50

# KBVE branded server-icon (64x64 PNG). Sourced from apps/mc/branding/.
# itzg/minecraft-server reads $ICON on first boot and copies it to
# /data/server-icon.png — set OVERRIDE_ICON=TRUE to reapply on every boot.
COPY apps/mc/branding/server-icon.png /usr/local/share/server-icon.png
ENV ICON=/usr/local/share/server-icon.png
ENV OVERRIDE_ICON=TRUE
ENV DIFFICULTY=normal
ENV VIEW_DISTANCE=12
ENV SIMULATION_DISTANCE=8
ENV SPAWN_PROTECTION=0
ENV ONLINE_MODE=true
ENV SERVER_PORT=25565
ENV PAUSE_WHEN_EMPTY_SECONDS=0

# Server operators — itzg/minecraft-server reads OPS at startup and writes
# matching entries into /data/ops.json (level 4). EXISTING_OPS_FILE=SYNCHRONIZE
# keeps the file in sync with this list on every boot, so removing a UUID here
# de-ops them on the next restart. UUIDs are preferred over names so renames
# don't break op state.
ENV OPS=b1897cef-8c27-45cb-b7fd-af139291ed6e,7e7b3993-e79a-41a9-9b26-fe90997cc273
ENV EXISTING_OPS_FILE=SYNCHRONIZE

# ZGC with generational mode — lower pause times than G1GC for MC servers.
# Aikar flags disabled to avoid GC conflict (Aikar sets G1GC).
ENV USE_AIKAR_FLAGS=false
ENV JVM_XX_OPTS="-XX:+UseZGC -XX:+ZGenerational -XX:+AlwaysPreTouch -XX:+DisableExplicitGC -XX:+ParallelRefProcEnabled"

# ── Modrinth mods (downloaded + sha1 verified in single layer) ────────
# Modrinth only provides sha1/sha512; Docker ADD --checksum requires sha256.
# Using curl + sha1sum for integrity verification.
SHELL ["/bin/bash", "-eo", "pipefail", "-c"]
RUN <<'MODS'
set -euo pipefail
mkdir -p /mods

declare -A MODS=(
  ["fabric-api-0.141.3+1.21.11.jar"]="50de67eb221f0b38216da8668b09ca311327040e https://cdn.modrinth.com/data/P7dR8mSH/versions/i5tSkVBH/fabric-api-0.141.3%2B1.21.11.jar"
  # fabric-language-kotlin: required by Ledger (Kotlin mod) and others.
  ["fabric-language-kotlin-1.13.10+kotlin.2.3.20.jar"]="9873294abf498f509453d37b0a5ba019f4570ffb https://cdn.modrinth.com/data/Ha28R6CL/versions/21TRTKmh/fabric-language-kotlin-1.13.10%2Bkotlin.2.3.20.jar"
  # ViaFabric — Fabric loader shim for ViaVersion + ViaBackwards. The
  # actual protocol translators don't ship as Fabric mods themselves;
  # ViaFabric is what registers them with the Fabric loader.
  ["ViaFabric-0.4.21+156-1.14-1.21.jar"]="e8f54ee523ea0c6b8eab84c4d047f958908f1e95 https://cdn.modrinth.com/data/YlKdE5VK/versions/fX5DMuoH/ViaFabric-0.4.21%2B156-1.14-1.21.jar"
  # ViaVersion — core protocol translator. Newer-than-the-server clients
  # connect through this. Pinned to 5.8.1 stable so it stays in sync
  # with the standalone ViaBackwards 5.8.1 below (same release line =
  # same internal API; SNAPSHOT builds drift apart).
  ["ViaVersion-5.8.1.jar"]="8203fe1e2995c3d019caafeb54466a31e81e3b46 https://cdn.modrinth.com/data/P1OZGk5p/versions/Sh5z5ETl/ViaVersion-5.8.1.jar"
  # ViaBackwards — companion addon supplying newer-server → older-client
  # packet rewrites. Skipping ViaRewind (1.8/1.12 support) because Old
  # Combat Mod already provides 1.8-style PvP for modern clients.
  ["ViaBackwards-5.8.1.jar"]="30ca8d606d0d834c4ee75ef1359aaf954fc91bf4 https://cdn.modrinth.com/data/NpvuJQoq/versions/6GSQXY2l/ViaBackwards-5.8.1.jar"
  # C2ME 0.3.7+alpha.0.9 — concurrent chunk management. Requires Java 22+
  # which is why the runtime base image was bumped to itzg/minecraft-server:java25.
  # Recommended companions are Lithium + ScalableLux (both bundled below).
  ["c2me-fabric-mc1.21.11-0.3.7+alpha.0.9.jar"]="8ba48c81c03c5287b7dd1e39e66603c64a1bf3a0 https://cdn.modrinth.com/data/VSNURh3q/versions/vsiqVtu6/c2me-fabric-mc1.21.11-0.3.7%2Balpha.0.9.jar"
  # ScalableLux — multithreaded lighting engine, recommended companion
  # to C2ME for chunk-loading performance.
  ["ScalableLux-0.1.6+fabric.c25518a-all.jar"]="9df93ab6442fa374c17fab6b5181fe2c215d9d5b https://cdn.modrinth.com/data/Ps1zyz6x/versions/PV9KcrYQ/ScalableLux-0.1.6%2Bfabric.c25518a-all.jar"
  ["vmp-fabric-mc1.21.11-0.2.0+beta.7.227-all.jar"]="6d665e488ea4f301d639cdf9fd4abf3ffdb44e0d https://cdn.modrinth.com/data/wnEe9KBa/versions/7Cxc2cAR/vmp-fabric-mc1.21.11-0.2.0%2Bbeta.7.227-all.jar"
  ["lithium-fabric-0.21.4+mc1.21.11.jar"]="203bdcb26e97b3217b045e1182651a7d7b6462ec https://cdn.modrinth.com/data/gvQqBUqZ/versions/Ow7wA0kG/lithium-fabric-0.21.4%2Bmc1.21.11.jar"
  ["ferritecore-8.2.0-fabric.jar"]="c2e2f5e008f5bc9f401dfad8ca94909917006b65 https://cdn.modrinth.com/data/uXXizFIs/versions/Ii0gP3D8/ferritecore-8.2.0-fabric.jar"
  ["servercore-fabric-1.5.15+1.21.11.jar"]="c3c6ec10b0ceddaa8f1ef53ffe57db57b4e8638f https://cdn.modrinth.com/data/4WWQxlQP/versions/zg8VIycZ/servercore-fabric-1.5.15%2B1.21.11.jar"
  ["Chunky-Fabric-1.4.55.jar"]="19c34a23a5c1b2f6c73117b8eb4524b521e1926b https://cdn.modrinth.com/data/fALzjamp/versions/1CpEkmcD/Chunky-Fabric-1.4.55.jar"
  ["old_combat_mod-fabric-1.21.11-1.2.jar"]="5908493d5f019497864b6a8834fcfd4b2aa95213 https://cdn.modrinth.com/data/dZ1APLkO/versions/TzHDocwD/old_combat_mod-fabric-1.21.11-1.2.jar"
  ["FabricProxy-Lite-2.11.0.jar"]="2c6674b1561b9b263b332607ef25b7db469133ec https://cdn.modrinth.com/data/8dI2tmqs/versions/nR8AIdvx/FabricProxy-Lite-2.11.0.jar"
  ["essential_commands-0.38.6-mc1.21.11.jar"]="c10c608f7adfd566fa2908deb16fd761fe399e8b https://cdn.modrinth.com/data/6VdDUivB/versions/3s9XXmZa/essential_commands-0.38.6-mc1.21.11.jar"
  # LuckPerms-Fabric 5.5.21 — the only LuckPerms Fabric build that
  # supports MC 1.21.11 (5.5.17 tops out at 1.21.10, 5.5.42 dropped
  # 1.21). Paired with LuckPerms-Velocity 5.5.17 on the proxy via
  # plugin messaging; see fleet.yaml and velocity-deployment.yaml for
  # the LUCKPERMS_MESSAGING_SERVICE=pluginmsg env vars that wire the
  # two instances together and bypass the FabricProxy-Lite pre-login
  # UUID mismatch.
  ["LuckPerms-Fabric-5.5.21.jar"]="2b899a61f216e8fd5ff9bfae98b62fcb1201e91b https://cdn.modrinth.com/data/Vebnzrzj/versions/CzCJJMuo/LuckPerms-Fabric-5.5.21.jar"
  ["ledger-1.3.19.jar"]="b53db7b817e968603adf33f8d31903a0bf5c0ea2 https://cdn.modrinth.com/data/LVN9ygNV/versions/c1d39lju/ledger-1.3.19.jar"
  # Spark — lightweight performance profiler. Provides /spark tps,
  # /spark health, /spark profiler. Paper bundles it by default but
  # Fabric needs the standalone mod.
  ["spark-1.10.170-fabric.jar"]="2a3745baa44e11672c4befe3beeccef758581f80 https://cdn.modrinth.com/data/l6YH9Als/versions/gonLOAU1/spark-1.10.170-fabric.jar"
  # Grim Anticheat — packet-level anticheat. Lives on the Fabric backend
  # (not Velocity) because Grim works at the packet layer and needs the
  # actual client movement packets after ViaVersion translation. Grim's
  # default punishments.yml ships with ONLY [alert]/[log]/[webhook]/[proxy]
  # tokens — no auto-kick or ban out of the box, which is exactly the
  # "warning-only" rollout mode we want. Tune the generated
  # /data/plugins/Grim/punishments.yml in-place on the PVC once we
  # collect real violation data.
  ["grimac-fabric-2.3.73.jar"]="7a6fcb37c8a2845268f8072166b929d4b963863a https://cdn.modrinth.com/data/LJNGWSvH/versions/SNnHVoFr/grimac-fabric-2.3.73.jar"
  # WorldEdit 7.4.2 — in-game world editor. Fabric build supports 1.21.11.
  # Permissions are gated through LuckPerms (worldedit.* nodes).
  ["worldedit-mod-7.4.2.jar"]="2f5c35ab2d0dffa1be99ed6016132596949e59b3 https://cdn.modrinth.com/data/1u6JkXh5/versions/oY3E2pzA/worldedit-mod-7.4.2.jar"
  # Lithostitched 1.6.1 — worldgen library required by Tectonic for
  # data-driven biome/structure registration. Server-side only.
  ["lithostitched-1.6.1-fabric-1.21.11.jar"]="0b7a54cad929d4b831a9ca77b21240bdf2789679 https://cdn.modrinth.com/data/XaDC71GB/versions/s47RpVwc/lithostitched-1.6.1-fabric-1.21.11.jar"
  # Tectonic 3.0.19 — worldgen overhaul (Fabric mod variant of the
  # datapack). Generates dramatic mountains, deep valleys, and expanded
  # cave systems. Only affects newly generated chunks — existing terrain
  # is untouched. Pair with map-rotation.sh to regenerate outer regions
  # with Tectonic terrain while preserving the starter zone.
  ["tectonic-3.0.19-fabric-1.21.11.jar"]="ab0ad94c096070d36a050ec2ad56f0525d280d8c https://cdn.modrinth.com/data/lWDHr9jE/versions/7olSYFxL/tectonic-3.0.19-fabric-1.21.11.jar"
  # Incendium 5.4.12 — Nether worldgen overhaul. Adds dramatic Nether
  # biomes, structures, and terrain using vanilla blocks. Server-side
  # only — no client mod required.
  ["Incendium_26.1_v5.4.12.jar"]="74f78445b6da346eb08a9f730e86dc77925eed46 https://cdn.modrinth.com/data/ZVzW5oNS/versions/dmD183NM/Incendium_26.1_v5.4.12.jar"
  # ── Oh The Biomes We've Gone (BYG) + dependencies ──────────────────
  # BYG replaces vanilla biome distribution with 80+ custom biomes,
  # new trees, blocks, and terrain features. Unlike Tectonic/Incendium,
  # BYG adds custom assets — clients MUST install BYG + deps via the
  # KBVE Modrinth modpack.
  #
  # TerraBlender — biome injection API. Required by BYG to register
  # custom biomes into the vanilla biome source without conflicts.
  ["TerraBlender-fabric-1.21.11-21.11.0.0.jar"]="e4bd1aee6bc8c56ae77647a06f31a3bd981962a6 https://cdn.modrinth.com/data/kkmrDlKT/versions/chxo508B/TerraBlender-fabric-1.21.11-21.11.0.0.jar"
  # CorgiLib — shared config/codec utilities. Required by BYG and
  # Oh The Trees You'll Grow.
  ["Corgilib-Fabric-1.21.11-9.0.0.0.jar"]="687e58061bed7d5e37776fe414076debb5292625 https://cdn.modrinth.com/data/ziOp6EO8/versions/y5NhX0ok/Corgilib-Fabric-1.21.11-9.0.0.0.jar"
  # GeckoLib — animation/rendering engine. Required by BYG for
  # animated entity models and block renders.
  ["geckolib-fabric-1.21.11-5.4.5.jar"]="41cd2e142e48a8b6604d85764a6466fe5edb70c3 https://cdn.modrinth.com/data/8BmcQJ2H/versions/G1BvHQDL/geckolib-fabric-1.21.11-5.4.5.jar"
  # Oh The Trees You'll Grow — tree generation library. Required by
  # BYG for its custom tree structures via structure template files.
  ["Oh-The-Trees-Youll-Grow-fabric-1.21.11-9.0.0.jar"]="abdcfd53514cce7110638866ec1716faa50e8cb1 https://cdn.modrinth.com/data/g8NOG5OR/versions/RttF1Lcs/Oh-The-Trees-Youll-Grow-fabric-1.21.11-9.0.0.jar"
  # Oh The Biomes We've Gone (BYG) 4.3.3 — the main biome mod.
  ["Oh-The-Biomes-Weve-Gone-Fabric-4.3.3.jar"]="d6fa332917da0d8e7cd401b4537923c62cc79a07 https://cdn.modrinth.com/data/NTi7d3Xc/versions/zfKCnGWj/Oh-The-Biomes-Weve-Gone-Fabric-4.3.3.jar"
  # ── Decorative worldgen mods ────────────��───────────────────────────
  # Forge Config API Port — config library required by Sooty Chimneys.
  ["ForgeConfigAPIPort-v21.11.1-mc1.21.11-Fabric.jar"]="61aa1b5fafd75afc44552d0213cac39bc938bc2d https://cdn.modrinth.com/data/ohNO6lps/versions/uXrWPsCu/ForgeConfigAPIPort-v21.11.1-mc1.21.11-Fabric.jar"
  # Sooty Chimneys 1.3.4 — adds smoking chimney blocks to village
  # buildings and player-built structures. Client + server required.
  ["sootychimneys-fabric-1.3.4.jar"]="581f752d94dc8cf160bbd01fba4b5934ba2e9420 https://cdn.modrinth.com/data/b3w1XM9H/versions/KZ9rHjKU/sootychimneys-fabric-1.3.4.jar"
  # Wilder Flowers 1.0.4 — scatters additional wildflower variants
  # across biomes. Client + server required.
  ["wilderflowers-1.0.4+1.21.11-fabric.jar"]="6094531a6bd1fe14b3a5c34f3dce846984798f4e https://cdn.modrinth.com/data/8lUQapTY/versions/pzZ7fqlk/wilderflowers-1.0.4%2B1.21.11-fabric.jar"
  # FallingTree 1.21.11.3 — chop entire trees by breaking a single log.
  # Server-required, client-optional. No hard dependencies.
  ["FallingTree-1.21.11-1.21.11.3.jar"]="9daded812605231a5e1e9461a6e04258d0424761 https://cdn.modrinth.com/data/Fb4jn8m6/versions/Hnj3s9Ez/FallingTree-1.21.11-1.21.11.3.jar"
  # Configurable — config library required by Neruina.
  ["configurable-3.3.2+1.21.11-fabric.jar"]="59e3c7c8457673516a82ab36f5ee352f759f0e3e https://cdn.modrinth.com/data/lGffrQ3O/versions/jIjsSVfP/configurable-3.3.2%2B1.21.11-fabric.jar"
  # Neruina 3.2.2 — ticking entity crash prevention. Suspends
  # problematic entities/block-entities instead of crashing the server.
  # Client-optional, server-optional (most useful server-side).
  ["neruina-3.2.2+1.21.11-fabric.jar"]="189f0f41dbbdc0a80ed6471c66e184d3bf9f40f2 https://cdn.modrinth.com/data/1s5x833P/versions/o8Ej08oB/neruina-3.2.2%2B1.21.11-fabric.jar"
  # Blahaj Replushed 4.0.0 — IKEA-inspired plushie items (Blåhaj shark
  # and friends). Craftable, placeable, personalizable. Client + server.
  ["blahaj-replushed-4.0.0+1.21.11.jar"]="e02c9d72077cb84d11f0de9d5127f53fc729ff8f https://cdn.modrinth.com/data/5bb5rG4b/versions/enjEypbi/blahaj-replushed-4.0.0%2B1.21.11.jar"
  # ── Libraries for mods below ───────────────────────────────────────
  # MidnightLib — config/utility library. Required by Repurposed
  # Structures and TslatEntityStatus.
  ["midnightlib-fabric-1.9.2+1.21.11.jar"]="b9617fa5722a8cdc321781a2b6dd97217fcfdc2a https://cdn.modrinth.com/data/codAaoxh/versions/OeTayxh3/midnightlib-fabric-1.9.2%2B1.21.11.jar"
  # Puzzles Lib — multi-loader abstraction library. Required by
  # Magnum Torch.
  ["PuzzlesLib-v21.11.12-mc1.21.11-Fabric.jar"]="f502faff2063b34cfca40cfada13e4fecf69e7fc https://cdn.modrinth.com/data/QAGBst4M/versions/owXZpJai/PuzzlesLib-v21.11.12-mc1.21.11-Fabric.jar"
  # ── Food & cooking ─────────────────────────────────────────────────
  # Farmer's Delight Refabricated 3.4.9 — farming + cooking expansion
  # with new crops, meals, and kitchen blocks. Client + server.
  ["FarmersDelight-1.21.11-3.4.9+refabricated.jar"]="7c51a74bed32f4c55a22cc87690109c9379c682e https://cdn.modrinth.com/data/7vxePowz/versions/ZP4Uof9C/FarmersDelight-1.21.11-3.4.9%2Brefabricated.jar"
  # Chef's Delight 1.0.5 — Farmer's Delight addon adding chef villager
  # trades. Client + server.
  ["chefs-delight-1.0.5-fabric-1.21.11.jar"]="7848579a9cc8be4299de98010741e03edca7d4d8 https://cdn.modrinth.com/data/pvcsfne4/versions/EXu0Q4KH/chefs-delight-1.0.5-fabric-1.21.11.jar"
  # ── Structure & worldgen ───────────────────────────────────────────
  # Repurposed Structures 7.6.2 — adds biome-themed variants of vanilla
  # structures (villages, temples, strongholds, etc). Server-only.
  ["repurposed_structures-7.6.2+1.21.11-fabric.jar"]="dc88e4bea42a5e007eb5c2d0107271a43f1db363 https://cdn.modrinth.com/data/muf0XoRe/versions/LgshXq1u/repurposed_structures-7.6.2%2B1.21.11-fabric.jar"
  # ChoiceTheorem's Overhauled Village 3.6.2a — replaces vanilla village
  # generation with larger, more detailed layouts. Server-only.
  ["[fabric]ctov-1.21.11-3.6.2a.jar"]="6aad41978d561c9e766ae38013b916164473a60a https://cdn.modrinth.com/data/fgmhI8kH/versions/K2dNRnIZ/%5Bfabric%5Dctov-1.21.11-3.6.2a.jar"
  # ── Utility ────────────────────────────────────────────────────────
  # Magnum Torch 21.11.0 — mega torch that prevents mob spawning in a
  # large radius. Client + server.
  ["MagnumTorch-v21.11.0-mc1.21.11-Fabric.jar"]="cf3f0ae62a8c9122b81d54b0bc834183e4a0bc5a https://cdn.modrinth.com/data/jorDmSKv/versions/ggEj5Dcf/MagnumTorch-v21.11.0-mc1.21.11-Fabric.jar"
  # TslatEntityStatus 1.9.2 — shows entity health/status on HUD.
  # Client + server.
  ["TslatEntityStatus-fabric-1.21.11-1.9.2.jar"]="ac77b9ae97686f601cbb4cba1c34b6c1587eaadc https://cdn.modrinth.com/data/4A86JsDZ/versions/gC9DblyC/TslatEntityStatus-fabric-1.21.11-1.9.2.jar"
  # JEI 27.4.0.22 — recipe viewer. Shows crafting recipes, usages,
  # and ingredient lookups. Enhances Farmer's Delight recipe discovery.
  ["jei-1.21.11-fabric-27.4.0.22.jar"]="dba6319ab4cad596d74f520ae608a5cae84ba245 https://cdn.modrinth.com/data/u6dRKJwZ/versions/oHe0elMI/jei-1.21.11-fabric-27.4.0.22.jar"
  # AppleSkin 3.0.8 — food/hunger HUD overlay showing saturation and
  # exhaustion. Server install provides accurate values to clients.
  ["appleskin-fabric-mc1.21.11-3.0.8.jar"]="441fdbf4e9c34fb61517ceb8e15618950dc4d314 https://cdn.modrinth.com/data/EsAfCjCV/versions/59ti1rvg/appleskin-fabric-mc1.21.11-3.0.8.jar"
  # Traveler's Backpack 10.11.9 — unique upgradeable backpacks with
  # crafting, fluid tanks, and tool slots. Client + server.
  ["travelersbackpack-fabric-1.21.11-10.11.9.jar"]="fb2d5a2fd919ee127d9a170e3e85f798edb852a5 https://cdn.modrinth.com/data/rlloIFEV/versions/XbEGJQSG/travelersbackpack-fabric-1.21.11-10.11.9.jar"
  # Macaw's Paintings 1.1.0 — adds 40+ new painting variants in
  # multiple sizes. Client + server.
  ["mcw-paintings-1.1.0-mc1.21.11fabric.jar"]="580ba60f2811796b7906ebc7edea053849a0d1fd https://cdn.modrinth.com/data/okE6QVAY/versions/VPvufXfe/mcw-paintings-1.1.0-mc1.21.11fabric.jar"
)

for name in "${!MODS[@]}"; do
  read -r sha1 url <<< "${MODS[$name]}"
  curl -fsSL -o "/mods/$name" "$url"
  echo "$sha1  /mods/$name" | sha1sum -c -
done
MODS

# behavior_statetree mod (built in stage 2)
COPY --from=java-builder /build/behavior_statetree/java/build/libs/*.jar /mods/

# mc_auth mod (built in stage 2) — Supabase auth bridge + Agones heartbeat
COPY --from=java-builder /build/mc_auth/java/build/libs/*.jar /mods/

# Additional pre-built mods
COPY apps/mc/mods/ /mods/

# Server config overrides
COPY apps/mc/config/ /config/
