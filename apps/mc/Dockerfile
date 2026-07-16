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

# MODS_CACHE_IMAGE swaps in the pre-baked Modrinth jar set. Defaults to
# the published cache (ghcr.io/kbve/mc:mods); override with a local tag
# for offline / unauthenticated builds. Bump the cache image whenever
# apps/mc/Dockerfile.mods changes; ci-mc-mods-cache.yml rebuilds and
# pushes on edits to that file.
#
# Alias the cache as a named stage (mods-cache) so the runtime stage
# can `COPY --from=mods-cache` with a literal stage name. Using
# `COPY --from=${MODS_CACHE_IMAGE}` directly only works under BuildKit;
# nx-container's e2e path falls back to the classic builder, which
# treats the unsubstituted reference as a Docker Hub `library/...`
# repo and aborts.
ARG MODS_CACHE_IMAGE=ghcr.io/kbve/mc:mods
FROM ${MODS_CACHE_IMAGE} AS mods-cache

# ── Stage 1: Build Rust native libraries (.so) ────────────────────────
FROM rust:1.96-bookworm AS rust-builder
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
COPY packages/rust/bevy/bevy_pathfinder/ bevy_pathfinder/
COPY packages/rust/bevy/bevy_behavior/ bevy_behavior/
COPY packages/rust/bevy/bevy_chat/ bevy_chat/

# Rewrite package path refs for the flattened Docker context.
# Every bevy_* path dep in behavior_statetree/mc_auth must be rewritten
# from ../../../packages/rust/bevy/<crate> to ../<crate>.
RUN sed -i 's|path = "../../../packages/rust/bevy/bevy_npc"|path = "../bevy_npc"|' behavior_statetree/Cargo.toml
RUN sed -i 's|path = "../../../packages/rust/bevy/bevy_pathfinder"|path = "../bevy_pathfinder"|' behavior_statetree/Cargo.toml
RUN sed -i 's|path = "../../../packages/rust/bevy/bevy_behavior"|path = "../bevy_behavior"|' behavior_statetree/Cargo.toml
RUN sed -i 's|path = "../../../packages/rust/bevy/bevy_chat"|path = "../bevy_chat"|' behavior_statetree/Cargo.toml
RUN sed -i 's|path = "../../../packages/rust/bevy/bevy_supa"|path = "../bevy_supa"|' mc_auth/Cargo.toml
RUN printf '[workspace]\nresolver = "2"\nmembers = ["behavior_statetree", "mc_auth", "bevy_npc", "bevy_supa", "bevy_pathfinder", "bevy_behavior", "bevy_chat"]\n\n[workspace.package]\nrust-version = "1.96"\n' > Cargo.toml

RUN cargo build -p behavior_statetree -p mc_auth --release
# Outputs:
#   /build/target/release/libbehavior_statetree.so
#   /build/target/release/libmc_auth.so

# ── Stage 2: Build Fabric mod JARs (bundle .so via processResources) ──
# JAVA_BUILDER_IMAGE is declared at the top of this file (pre-FROM ARG).
FROM ${JAVA_BUILDER_IMAGE} AS java-builder
WORKDIR /build

# Copy Java source for the Fabric mods
COPY apps/mc/behavior_statetree/java/ behavior_statetree/java/
COPY apps/mc/mc_auth/java/ mc_auth/java/
COPY apps/mc/uplink/ uplink/

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

# Build kbve-mc-uplink JAR — Discord event forwarder, no Rust deps.
WORKDIR /build/uplink
RUN gradle build --no-daemon \
    || (echo "Retry 1: kbve-mc-uplink" && gradle build --no-daemon) \
    || (echo "Retry 2: kbve-mc-uplink" && gradle build --no-daemon)
# Output: /build/uplink/build/libs/kbve-mc-uplink-<version>.jar

# ── Stage 3: Runtime ──────────────────────────────────────────────────
FROM itzg/minecraft-server:java25

ENV TYPE=FABRIC
ENV VERSION=1.21.11
ENV FABRIC_LOADER_VERSION=0.18.6
ENV EULA=TRUE

# Wipe /data/mods on the PVC before re-copying the image's /mods on every
# boot. Without this, itzg leaves orphaned jars behind when a mod is bumped
# or renamed (e.g. a stale grimac-fabric build sitting next to the current
# one). Every mod on this server is image-sourced, so a clean re-copy is
# always correct.
ENV REMOVE_OLD_MODS=true

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

# ── Modrinth mods (pre-baked into the mods-cache stage) ───────────────
# All ~50 Fabric mods come from the standalone cache image built by
# apps/mc/Dockerfile.mods + ci-mc-mods-cache.yml. Pulling a single image
# layer beats running 50 sequential curls against Modrinth on every
# CI build — same payload, no CDN flakes, deterministic per-tag.
#
# Sourced via the mods-cache stage alias declared above (FROM
# ${MODS_CACHE_IMAGE} AS mods-cache) so the COPY works under both
# BuildKit and the classic Docker builder. To bump mods: edit
# Dockerfile.mods, push, let CI rebuild and publish ghcr.io/kbve/mc:mods.
COPY --from=mods-cache /mods/ /mods/

# behavior_statetree mod (built in stage 2)
COPY --from=java-builder /build/behavior_statetree/java/build/libs/*.jar /mods/

# mc_auth mod (built in stage 2) — Supabase auth bridge + Agones heartbeat
COPY --from=java-builder /build/mc_auth/java/build/libs/*.jar /mods/

# kbve-mc-uplink mod (built in stage 2) — Discord event forwarder.
# Forwards death + advancement events to the Velocity-side discord relay
# over the kbve:relay-events plugin-messaging channel. Backend stays
# Discord-blind (no JDA, no token, no webhook URL).
COPY --from=java-builder /build/uplink/build/libs/kbve-mc-uplink-*.jar /mods/

# Additional pre-built mods
COPY apps/mc/mods/ /mods/

# Server config overrides
COPY apps/mc/config/ /config/

# OPAC claim-access seed — wraps itzg's /start so Immersive Aircraft can be
# mounted/dismounted inside land claims (see script header). exec /start keeps
# itzg as PID1 for graceful RCON shutdown; the base image's CMD is inherited.
COPY apps/mc/scripts/opac-airship-claim-access.sh /usr/local/bin/opac-airship-claim-access.sh
RUN chmod +x /usr/local/bin/opac-airship-claim-access.sh
ENTRYPOINT ["/usr/local/bin/opac-airship-claim-access.sh"]
