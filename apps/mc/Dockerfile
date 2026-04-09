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

ENV USE_AIKAR_FLAGS=true
ENV JVM_XX_OPTS="-XX:+UseZGC -XX:+ZGenerational"

# ── Modrinth mods (pinned by sha512 checksum) ────────────────────────

# Fabric API 0.141.3+1.21.11
ADD --checksum=sha512:c20c017e23d6d2774690d0dd774cec84c16bfac5461da2d9345a1cd95eee495b1954333c421e3d1c66186284d24a433f6b0cced8021f62e0bfa617d2384d0471 \
    https://cdn.modrinth.com/data/P7dR8mSH/versions/i5tSkVBH/fabric-api-0.141.3%2B1.21.11.jar \
    /mods/fabric-api-0.141.3+1.21.11.jar

# C2ME 0.3.7+alpha.0.9+1.21.11 — concurrent chunk management
ADD --checksum=sha512:b2f92ef8a6dc7473305211c43dd54d509cb8a0dc2bbbd89e9267efb35b0a9871d0bb1a9b3c3e5c349bafa1a60567915e19f50d2b58bb90608556f93b290d72f6 \
    https://cdn.modrinth.com/data/VSNURh3q/versions/vsiqVtu6/c2me-fabric-mc1.21.11-0.3.7%2Balpha.0.9.jar \
    /mods/c2me-fabric-mc1.21.11-0.3.7+alpha.0.9.jar

# VMP 0.2.0+beta.7.227+1.21.11 — very many players optimization
ADD --checksum=sha512:5534a5b0ec88b58f1a395753e4810dde9a8f0f97a88898f4b61e960bd219ec28ea60c6676d7ee24d5b465939a4ff9470520d9015bb9cdb10d9357ff82c36fdab \
    https://cdn.modrinth.com/data/wnEe9KBa/versions/7Cxc2cAR/vmp-fabric-mc1.21.11-0.2.0%2Bbeta.7.227-all.jar \
    /mods/vmp-fabric-mc1.21.11-0.2.0+beta.7.227-all.jar

# Lithium 0.21.4 — general server optimization
ADD --checksum=sha512:f14a5c3d2fad786347ca25083f902139694f618b7c103947f2fd067a7c5ee88a63e1ef8926f7d693ea79ed7d00f57317bae77ef9c2d630bf5ed01ac97a752b94 \
    https://cdn.modrinth.com/data/gvQqBUqZ/versions/Ow7wA0kG/lithium-fabric-0.21.4%2Bmc1.21.11.jar \
    /mods/lithium-fabric-0.21.4+mc1.21.11.jar

# FerriteCore 8.2.0 — memory usage optimization
ADD --checksum=sha512:3210926a82eb32efd9bcebabe2f6c053daf5c4337eebc6d5bacba96d283510afbde646e7e195751de795ec70a2ea44fef77cb54bf22c8e57bb832d6217418869 \
    https://cdn.modrinth.com/data/uXXizFIs/versions/Ii0gP3D8/ferritecore-8.2.0-fabric.jar \
    /mods/ferritecore-8.2.0-fabric.jar

# ServerCore 1.5.15+1.21.11 — server-side performance tweaks
ADD --checksum=sha512:964392769e53f9764466e26044552f60e91137f487b49d98a85bd4dc03ab8e965f0c69bc1a43e96ef5737cd8f1a9bb75cc0a0c09dd30bab6786d8ab4bbea6e01 \
    https://cdn.modrinth.com/data/4WWQxlQP/versions/zg8VIycZ/servercore-fabric-1.5.15%2B1.21.11.jar \
    /mods/servercore-fabric-1.5.15+1.21.11.jar

# Chunky 1.4.55 — chunk pre-generation
ADD --checksum=sha512:3be0e049e3dea6256b395ccb1f7dccc9c6b23cb7b1f6a717a7cd1ca55f9dbda489679df32868c72664ebb28ca05f2c366590d1e1a11f0dc5f69f947903bad833 \
    https://cdn.modrinth.com/data/fALzjamp/versions/1CpEkmcD/Chunky-Fabric-1.4.55.jar \
    /mods/Chunky-Fabric-1.4.55.jar

# Old Combat Mod 1.2 — 1.8-style combat
ADD --checksum=sha512:94e0b688503ca2333ccf0c5bbadf3cbf544ade9f3b44abb37ee221486fb5b6c8cc6039daaa7ac1d47d3fb69519dacc816780095c01cea67158545cd1db22f7af \
    https://cdn.modrinth.com/data/dZ1APLkO/versions/TzHDocwD/old_combat_mod-fabric-1.21.11-1.2.jar \
    /mods/old_combat_mod-fabric-1.21.11-1.2.jar

# behavior_statetree mod (built in stage 2)
COPY --from=java-builder /build/behavior_statetree/java/build/libs/*.jar /mods/

# Additional pre-built mods
COPY apps/mc/mods/ /mods/

# Server config overrides
COPY apps/mc/config/ /config/
