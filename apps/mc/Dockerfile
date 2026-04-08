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
FROM gradle:8-jdk21 AS java-builder
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
ENV VERSION=1.21.4
ENV FABRIC_LOADER_VERSION=0.16.14
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

ENV USE_AIKAR_FLAGS=true
ENV JVM_XX_OPTS="-XX:+UseZGC -XX:+ZGenerational"

# behavior_statetree mod (built in stage 2)
COPY --from=java-builder /build/behavior_statetree/java/build/libs/*.jar /mods/

# Additional pre-built mods (performance mods, etc.)
COPY apps/mc/mods/ /mods/

# Server config overrides
COPY apps/mc/config/ /config/
