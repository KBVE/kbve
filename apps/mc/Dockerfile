# Fabric Minecraft Server — performance-tuned with baked-in mods
# Base image handles Fabric download/install, JVM tuning (Aikar flags),
# EULA acceptance, RCON, and graceful shutdown automatically.
FROM itzg/minecraft-server:java21

# Fabric mod loader + pinned MC version
ENV TYPE=FABRIC
ENV VERSION=1.21.4
ENV FABRIC_LOADER_VERSION=0.16.14
ENV EULA=TRUE

# JVM memory — leave headroom for off-heap (Aikar flags auto-applied)
ENV MEMORY=3G

# RCON for health checks and management
ENV ENABLE_RCON=true
ENV RCON_PORT=25575

# Server properties (overridden by env vars in itzg/minecraft-server)
ENV MOTD="KBVE Minecraft Server"
ENV MAX_PLAYERS=50
ENV DIFFICULTY=normal
ENV VIEW_DISTANCE=12
ENV SIMULATION_DISTANCE=8
ENV SPAWN_PROTECTION=0
ENV ONLINE_MODE=true
ENV SERVER_PORT=25565

# Performance: let c2me and vmp handle threading
ENV USE_AIKAR_FLAGS=true
ENV JVM_XX_OPTS="-XX:+UseZGC -XX:+ZGenerational"

# Copy Fabric mods into the image
# Performance mods are downloaded at build time for reproducibility.
# To add mods: place .jar files in mods/ or add ADD directives below.
COPY mods/ /mods/

# Copy custom config overrides (server.properties, etc.)
COPY config/ /config/

# The itzg/minecraft-server entrypoint handles everything:
# - Downloads and installs Fabric
# - Applies Aikar JVM flags
# - Accepts EULA
# - Starts server with graceful shutdown support
