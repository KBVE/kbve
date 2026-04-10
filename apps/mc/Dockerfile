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

# Standalone workspace with behavior_statetree + mc_auth + bevy_npc.
# Uses the repo Cargo.lock for reproducible dependency resolution.
COPY Cargo.lock .
COPY apps/mc/behavior_statetree/ behavior_statetree/
COPY apps/mc/mc_auth/ mc_auth/
COPY packages/rust/bevy/bevy_npc/ bevy_npc/

# Rewrite bevy_npc path in behavior_statetree Cargo.toml for Docker context
RUN sed -i 's|path = "../../../packages/rust/bevy/bevy_npc"|path = "../bevy_npc"|' behavior_statetree/Cargo.toml
RUN printf '[workspace]\nresolver = "2"\nmembers = ["behavior_statetree", "mc_auth", "bevy_npc"]\n' > Cargo.toml

RUN cargo build -p behavior_statetree -p mc_auth --release
# Outputs:
#   /build/target/release/libbehavior_statetree.so
#   /build/target/release/libmc_auth.so

# ── Stage 2: Build Fabric mod JARs (bundle .so via processResources) ──
FROM gradle:jdk21 AS java-builder
WORKDIR /build

# Copy Java source for both Fabric mods
COPY apps/mc/behavior_statetree/java/ behavior_statetree/java/
COPY apps/mc/mc_auth/java/ mc_auth/java/

# Place each .so where its Gradle processResources expects it.
# build.gradle: from("../../target/release") relative to java/
# behavior_statetree/java/ → ../../target/release = /build/target/release/
# mc_auth/java/             → ../../target/release = /build/target/release/
COPY --from=rust-builder /build/target/release/libbehavior_statetree.so target/release/libbehavior_statetree.so
COPY --from=rust-builder /build/target/release/libmc_auth.so target/release/libmc_auth.so

# Build behavior_statetree JAR
WORKDIR /build/behavior_statetree/java
RUN gradle build --no-daemon
# Output: /build/behavior_statetree/java/build/libs/*.jar

# Build mc_auth JAR
WORKDIR /build/mc_auth/java
RUN gradle build --no-daemon
# Output: /build/mc_auth/java/build/libs/*.jar

# ── Stage 3: Runtime ──────────────────────────────────────────────────
FROM itzg/minecraft-server:java21

ENV TYPE=FABRIC
ENV VERSION=1.21.11
ENV FABRIC_LOADER_VERSION=0.18.6
ENV EULA=TRUE

ENV MEMORY=3G

ENV ENABLE_RCON=true
ENV RCON_PORT=25575

ENV MOTD="KBVE Minecraft Server"
ENV MAX_PLAYERS=50
ENV DIFFICULTY=normal
ENV VIEW_DISTANCE=12
ENV SIMULATION_DISTANCE=8
ENV SPAWN_PROTECTION=0
ENV ONLINE_MODE=true
ENV SERVER_PORT=25565

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
  # C2ME 0.3.6.0.0 — last stable release that runs on Java 21. The 0.3.7
  # alpha line bumped its toolchain to Java 22 which the itzg/minecraft-server
  # base image doesn't ship.
  ["c2me-fabric-mc1.21.11-0.3.6.0.0.jar"]="587f9a3d9e4591e8e1a1c3eda61ed2f7bfa5dc46 https://cdn.modrinth.com/data/VSNURh3q/versions/olrVZpJd/c2me-fabric-mc1.21.11-0.3.6.0.0.jar"
  ["vmp-fabric-mc1.21.11-0.2.0+beta.7.227-all.jar"]="6d665e488ea4f301d639cdf9fd4abf3ffdb44e0d https://cdn.modrinth.com/data/wnEe9KBa/versions/7Cxc2cAR/vmp-fabric-mc1.21.11-0.2.0%2Bbeta.7.227-all.jar"
  ["lithium-fabric-0.21.4+mc1.21.11.jar"]="203bdcb26e97b3217b045e1182651a7d7b6462ec https://cdn.modrinth.com/data/gvQqBUqZ/versions/Ow7wA0kG/lithium-fabric-0.21.4%2Bmc1.21.11.jar"
  ["ferritecore-8.2.0-fabric.jar"]="c2e2f5e008f5bc9f401dfad8ca94909917006b65 https://cdn.modrinth.com/data/uXXizFIs/versions/Ii0gP3D8/ferritecore-8.2.0-fabric.jar"
  ["servercore-fabric-1.5.15+1.21.11.jar"]="c3c6ec10b0ceddaa8f1ef53ffe57db57b4e8638f https://cdn.modrinth.com/data/4WWQxlQP/versions/zg8VIycZ/servercore-fabric-1.5.15%2B1.21.11.jar"
  ["Chunky-Fabric-1.4.55.jar"]="19c34a23a5c1b2f6c73117b8eb4524b521e1926b https://cdn.modrinth.com/data/fALzjamp/versions/1CpEkmcD/Chunky-Fabric-1.4.55.jar"
  ["old_combat_mod-fabric-1.21.11-1.2.jar"]="5908493d5f019497864b6a8834fcfd4b2aa95213 https://cdn.modrinth.com/data/dZ1APLkO/versions/TzHDocwD/old_combat_mod-fabric-1.21.11-1.2.jar"
  ["FabricProxy-Lite-2.11.0.jar"]="2c6674b1561b9b263b332607ef25b7db469133ec https://cdn.modrinth.com/data/8dI2tmqs/versions/nR8AIdvx/FabricProxy-Lite-2.11.0.jar"
  ["essential_commands-0.38.6-mc1.21.11.jar"]="c10c608f7adfd566fa2908deb16fd761fe399e8b https://cdn.modrinth.com/data/6VdDUivB/versions/3s9XXmZa/essential_commands-0.38.6-mc1.21.11.jar"
  ["LuckPerms-Fabric-5.5.21.jar"]="2b899a61f216e8fd5ff9bfae98b62fcb1201e91b https://cdn.modrinth.com/data/Vebnzrzj/versions/CzCJJMuo/LuckPerms-Fabric-5.5.21.jar"
  ["ledger-1.3.19.jar"]="b53db7b817e968603adf33f8d31903a0bf5c0ea2 https://cdn.modrinth.com/data/LVN9ygNV/versions/c1d39lju/ledger-1.3.19.jar"
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
