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
    CUSTOM_SCRIPT_ENABLED=true \
    CUSTOM_SCRIPT_PATH=/opt/palchatrelay/overlay.sh \
    PALWORLD_CHAT_LOG=Z:/shared/chat/chat.log

COPY apps/agones/palworld/mods/PalChatRelay /opt/palchatrelay/PalChatRelay
COPY apps/agones/palworld/overlay.sh /opt/palchatrelay/overlay.sh
COPY apps/agones/palworld/shim/agones-shim-prestop.sh /usr/local/bin/agones-shim-prestop
RUN chmod +x /opt/palchatrelay/overlay.sh /usr/local/bin/agones-shim-prestop \
    && chmod -R a+rX /opt/palchatrelay \
    && chown -R 1000:1000 /opt/palchatrelay \
    && mkdir -p /shared/chat \
    && chown -R 1000:1000 /shared/chat
