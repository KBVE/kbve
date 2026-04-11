# PaperMC lobby server — Velocity's default landing target and fallback when
# the Fabric backend goes offline. Intentionally minimal: superflat peaceful
# world, LuckPerms for cross-server permission sync via pluginmsg, and no
# other plugins. Commands that teleport players between servers (/lobby,
# /hub, /mc, /survival) live on the Velocity proxy plugin, not here.

FROM itzg/minecraft-server:java25

ENV TYPE=PAPER
ENV VERSION=1.21.11
ENV EULA=TRUE

ENV MEMORY=1G

ENV ENABLE_RCON=true
ENV RCON_PORT=25575

ENV MOTD="KBVE Lobby"
ENV MAX_PLAYERS=50
ENV DIFFICULTY=peaceful
ENV VIEW_DISTANCE=8
ENV SIMULATION_DISTANCE=4
ENV SPAWN_PROTECTION=16
# Velocity handles Mojang auth; backend must be offline-mode to accept
# forwarded sessions (same pattern as apps/mc Fabric backend).
ENV ONLINE_MODE=false
ENV SERVER_PORT=25565

# ── Superflat peaceful world ──────────────────────────────────────────
# Vanilla flat preset: bedrock + 2 dirt + grass, plains biome, no
# structures, no mob spawning, no damage (peaceful).
ENV LEVEL_TYPE=minecraft:flat
ENV GENERATE_STRUCTURES=false
ENV SPAWN_ANIMALS=false
ENV SPAWN_MONSTERS=false
ENV SPAWN_NPCS=false

# ── Velocity modern forwarding ────────────────────────────────────────
# itzg patches paper-global.yml with these CFG_VELOCITY_* env vars on
# boot. Secret must match apps/kube/agones/mc/velocity-configmap.yaml
# and apps/mc/config/FabricProxy-Lite.toml.
ENV CFG_VELOCITY_ENABLED=true
ENV CFG_VELOCITY_ONLINE_MODE=true
ENV CFG_VELOCITY_SECRET="kbve-velocity-forwarding-secret-change-me"

# ── Plugins ────────────────────────────────────────────────────────────
# All plugins the lobby needs. itzg's MODRINTH_PROJECTS pulls the latest
# Paper-compatible release of each slug at container start.
#
#   luckperms          — permission backbone; syncs cross-server via
#                        the pluginmsg channel with the Velocity proxy
#                        and the Fabric backend.
#   essentialsx        — /spawn, /tpa, /sethome, /back, kit system,
#                        and the dependency for every EssentialsX addon.
#   essentialsxantibuild — blocks build/break/interact for non-permissioned
#                        players. Grief-proof the lobby by default.
#   worldedit          — admin building tool, same version line as the
#                        Fabric backend so commands are consistent.
#   advancedportals    — physical portal regions that fire proxy commands
#                        (e.g. /server mc) on player entry. Lets us put
#                        decorative portals in the lobby that teleport
#                        players to other backends. Requires one-time
#                        in-game `/portal create` setup after first boot.
ENV MODRINTH_PROJECTS=luckperms,essentialsx,essentialsxantibuild,worldedit,advancedportals
ENV LUCKPERMS_MESSAGING_SERVICE=pluginmsg
ENV LUCKPERMS_STORAGE_METHOD=h2

# ── Ops list (same UUIDs as apps/mc) ───────────────────────────────────
# EXISTING_OPS_FILE=SYNCHRONIZE keeps ops.json in sync with this env on
# every boot — source of truth lives here, not in the PVC.
ENV OPS=b1897cef-8c27-45cb-b7fd-af139291ed6e,7e7b3993-e79a-41a9-9b26-fe90997cc273
ENV EXISTING_OPS_FILE=SYNCHRONIZE

# ── JVM tuning ─────────────────────────────────────────────────────────
# ZGC with generational mode — same choice as the Fabric backend. Paper's
# default GC flags don't matter much for an always-idle superflat lobby,
# but keeping them consistent avoids surprises.
ENV USE_AIKAR_FLAGS=false
ENV JVM_XX_OPTS="-XX:+UseZGC -XX:+ZGenerational -XX:+AlwaysPreTouch -XX:+DisableExplicitGC"

# Bundled config fallback — paper-global.yml is also shipped so that if
# itzg's CFG_VELOCITY_* patch path changes in the future, the forwarding
# section is still present at /config/paper-global.yml on first boot.
COPY apps/mc/lobby/config/ /config/
