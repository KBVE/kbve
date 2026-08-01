# Palworld WINDOWS dedicated server under Wine (x86_64, near-native CPU) for
# working UE4SS chat capture. The native-Linux server binary is export-stripped
# (.symtab=0, UE reflection internals absent from .dynsym) so UE4SS Linux cannot
# resolve addresses and never starts Lua mods. Windows UE4SS resolves via
# Windows-tuned patternsleuth AOB, so RegisterHook fires. See Dockerfile.linux
# for the retired native path.
#
# Base: proven ripps818 Wine image (WineHQ stable, winetricks vcrun2022, Xvfb,
# Windows SteamCMD, REST/RCON, Okaetsu UE4SS-Palworld via INSTALL_UE4SS_EXPERIMENTAL).
FROM ghcr.io/ripps818/docker-palworld-dedicated-server-wine@sha256:243508cd48c49208aca3edafb3369ea2b7b432c58a151cba33617c7a91676316

ENV INSTALL_UE4SS_EXPERIMENTAL=true \
    SERVER_SETTINGS_MODE=auto \
    CUSTOM_SCRIPT_ENABLED=true \
    CUSTOM_SCRIPT_PATH=/opt/palchatrelay/overlay.sh \
    PALWORLD_CHAT_LOG=Z:/shared/chat/chat.log

# PalSchema (Okaetsu) — JSON-driven data-table/blueprint framework, C++ UE4SS mod
# (main.dll). Same author as the base image's UE4SS-Palworld fork. Pinned by
# release + sha256 (verified against the GitHub API asset digest); bump both ARGs
# to update. Downloaded at build (once), staged into ue4ss/Mods by overlay.sh.
ARG PALSCHEMA_VERSION=0.6.1
ARG PALSCHEMA_SHA256=d30f0ff7bed94bc4695468ff5dd4f6070efd1f89ce8c983eb814bb2960f5262b
RUN set -eux \
    && apt-get update \
    && apt-get install -y --no-install-recommends unzip curl ca-certificates \
    && curl -fsSL -o /tmp/palschema.zip \
        "https://github.com/Okaetsu/PalSchema/releases/download/${PALSCHEMA_VERSION}/PalSchema_${PALSCHEMA_VERSION}.zip" \
    && echo "${PALSCHEMA_SHA256}  /tmp/palschema.zip" | sha256sum -c - \
    && unzip -q /tmp/palschema.zip -d /opt/palchatrelay/ \
    && rm -f /tmp/palschema.zip \
    && rm -rf /var/lib/apt/lists/*

COPY apps/agones/palworld/mods/PalChatRelay /opt/palchatrelay/PalChatRelay
COPY apps/agones/palworld/mods/PalEventRelay /opt/palchatrelay/PalEventRelay
COPY apps/agones/palworld/mods/PalForge /opt/palchatrelay/PalForge
COPY apps/agones/palworld/mods/PalSchema /opt/palchatrelay/PalSchema-overlay
COPY apps/agones/palworld/overlay.sh /opt/palchatrelay/overlay.sh
COPY apps/agones/palworld/shim/agones-shim-prestop.sh /usr/local/bin/agones-shim-prestop
RUN chmod +x /opt/palchatrelay/overlay.sh /usr/local/bin/agones-shim-prestop \
    && chmod -R a+rX /opt/palchatrelay \
    && chown -R 1000:1000 /opt/palchatrelay \
    && mkdir -p /shared/chat \
    && chown -R 1000:1000 /shared/chat
