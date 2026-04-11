# Custom Velocity proxy image for the KBVE MC stack.
#
# This is itzg/bungeecord (TYPE=VELOCITY runtime) with a pre-baked
# Kotlin plugin JAR that provides:
#   - Teleport command aliases: /lobby /hub /mc /survival
#   - Cross-server chat bridge with /chat local|global per-player mode
#   - Last-server persistence (reconnect lands on previous backend)
#
# The plugin source lives at apps/mc/velocity/plugin/ and is built
# with Gradle shadowJar in stage 1. Stage 2 drops the resulting JAR
# into /plugins/ where itzg/bungeecord scans for plugins at startup.
#
# All other Velocity runtime wiring (PLUGINS env var for LuckPerms
# download, LUCKPERMS_MESSAGING_SERVICE=pluginmsg, etc) still happens
# at container start time via env vars — this image just pre-bakes
# the one plugin we own the source for.

# ── Stage 1 — Build the Kotlin plugin with Gradle ─────────────────────
FROM gradle:jdk21 AS plugin-builder
WORKDIR /build

COPY apps/mc/velocity/plugin/ .

# shadowJar produces build/libs/kbve-velocity-commands-<version>.jar
RUN gradle shadowJar --no-daemon --stacktrace

# ── Stage 2 — Runtime (itzg/bungeecord with TYPE=VELOCITY) ────────────
FROM itzg/bungeecord:latest

# Drop the plugin JAR into the plugins folder. itzg/bungeecord copies
# everything in /plugins/ to /server/plugins/ on first boot and loads
# them automatically when Velocity starts.
COPY --from=plugin-builder /build/build/libs/kbve-velocity-commands-*.jar \
    /plugins/kbve-velocity-commands.jar
