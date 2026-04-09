# ── Stage 1: Build Rust native library (.so) ──────────────────────────
FROM rust:1.85-bookworm AS rust-builder
WORKDIR /build

# Standalone workspace with only the behavior_statetree crate.
# Uses the repo Cargo.lock for reproducible dependency resolution.
COPY Cargo.lock .
COPY apps/mc/behavior_statetree/ behavior_statetree/
RUN printf '[workspace]\nresolver = "2"\nmembers = ["behavior_statetree"]\n' > Cargo.toml

RUN cargo build -p behavior_statetree --release
# Output: /build/target/release/libbehavior_statetree.so

# ── Stage 2: Build Fabric mod JAR (bundles .so via processResources) ──
FROM gradle:jdk21 AS java-builder
WORKDIR /build

# Copy Java source
COPY apps/mc/behavior_statetree/java/ behavior_statetree/java/

# Place .so where Gradle processResources expects it.
# build.gradle: from("../../target/release") relative to java/
# java/ is at /build/behavior_statetree/java/, so ../../target/release = /build/target/release/
COPY --from=rust-builder /build/target/release/libbehavior_statetree.so target/release/libbehavior_statetree.so

WORKDIR /build/behavior_statetree/java
RUN gradle build --no-daemon
# Output: /build/behavior_statetree/java/build/libs/*.jar (contains natives/libbehavior_statetree.so)

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
  ["c2me-fabric-mc1.21.11-0.3.7+alpha.0.9.jar"]="8ba48c81c03c5287b7dd1e39e66603c64a1bf3a0 https://cdn.modrinth.com/data/VSNURh3q/versions/vsiqVtu6/c2me-fabric-mc1.21.11-0.3.7%2Balpha.0.9.jar"
  ["vmp-fabric-mc1.21.11-0.2.0+beta.7.227-all.jar"]="6d665e488ea4f301d639cdf9fd4abf3ffdb44e0d https://cdn.modrinth.com/data/wnEe9KBa/versions/7Cxc2cAR/vmp-fabric-mc1.21.11-0.2.0%2Bbeta.7.227-all.jar"
  ["lithium-fabric-0.21.4+mc1.21.11.jar"]="203bdcb26e97b3217b045e1182651a7d7b6462ec https://cdn.modrinth.com/data/gvQqBUqZ/versions/Ow7wA0kG/lithium-fabric-0.21.4%2Bmc1.21.11.jar"
  ["ferritecore-8.2.0-fabric.jar"]="c2e2f5e008f5bc9f401dfad8ca94909917006b65 https://cdn.modrinth.com/data/uXXizFIs/versions/Ii0gP3D8/ferritecore-8.2.0-fabric.jar"
  ["servercore-fabric-1.5.15+1.21.11.jar"]="c3c6ec10b0ceddaa8f1ef53ffe57db57b4e8638f https://cdn.modrinth.com/data/4WWQxlQP/versions/zg8VIycZ/servercore-fabric-1.5.15%2B1.21.11.jar"
  ["Chunky-Fabric-1.4.55.jar"]="19c34a23a5c1b2f6c73117b8eb4524b521e1926b https://cdn.modrinth.com/data/fALzjamp/versions/1CpEkmcD/Chunky-Fabric-1.4.55.jar"
  ["old_combat_mod-fabric-1.21.11-1.2.jar"]="5908493d5f019497864b6a8834fcfd4b2aa95213 https://cdn.modrinth.com/data/dZ1APLkO/versions/TzHDocwD/old_combat_mod-fabric-1.21.11-1.2.jar"
)

for name in "${!MODS[@]}"; do
  read -r sha1 url <<< "${MODS[$name]}"
  curl -fsSL -o "/mods/$name" "$url"
  echo "$sha1  /mods/$name" | sha1sum -c -
done
MODS

# behavior_statetree mod (built in stage 2)
COPY --from=java-builder /build/behavior_statetree/java/build/libs/*.jar /mods/

# Additional pre-built mods
COPY apps/mc/mods/ /mods/

# Server config overrides
COPY apps/mc/config/ /config/
