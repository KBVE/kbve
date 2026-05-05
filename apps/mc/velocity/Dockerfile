# Custom Velocity proxy image for the KBVE MC stack.
#
# This is itzg/bungeecord (TYPE=VELOCITY runtime) with two pre-baked
# Kotlin plugins:
#   - kbve-velocity-commands: teleport aliases, cross-server chat bridge,
#     last-server persistence. Source: apps/mc/velocity/plugin/.
#   - kbve-discord-relay: Discord <-> MC chat relay with prefix routing,
#     reply context, and role-gated console commands.
#     Source: apps/mc/velocity/plugin-discord/.
#
# Each plugin builds in its own Gradle stage and the resulting JARs are
# copied into /plugins/, where itzg/bungeecord auto-loads them at boot.
#
# All other Velocity runtime wiring (PLUGINS env var for LuckPerms
# download, LUCKPERMS_MESSAGING_SERVICE=pluginmsg, DISCORD_BOT_TOKEN,
# etc) still happens at container start time via env vars.

# ── Stage 1 — Build kbve-velocity-commands ────────────────────────────
FROM gradle:jdk21 AS plugin-commands-builder
WORKDIR /build
COPY apps/mc/velocity/plugin/ .
RUN gradle shadowJar --no-daemon --stacktrace

# ── Stage 2 — Build kbve-discord-relay ────────────────────────────────
FROM gradle:jdk21 AS plugin-discord-builder
WORKDIR /build
COPY apps/mc/velocity/plugin-discord/ .
RUN gradle shadowJar --no-daemon --stacktrace

# ── Stage 3 — Runtime (itzg/bungeecord with TYPE=VELOCITY) ────────────
FROM itzg/bungeecord:latest

COPY --from=plugin-commands-builder /build/build/libs/kbve-velocity-commands-*.jar \
    /plugins/kbve-velocity-commands.jar
COPY --from=plugin-discord-builder /build/build/libs/kbve-discord-relay-*.jar \
    /plugins/kbve-discord-relay.jar
