ARG PALWORLD_IMAGE=thijsvanloef/palworld-server-docker
ARG PALWORLD_TAG=latest
FROM ${PALWORLD_IMAGE}:${PALWORLD_TAG}

USER root
RUN apt-get update && \
    apt-get install -y --no-install-recommends curl jq ca-certificates && \
    rm -rf /var/lib/apt/lists/*

ARG UE4SS_SO_URL=https://github.com/XarminaEu/ue4ss-linux/releases/download/v3.0.1-linux/libUE4SS-linux-x64.so
ARG UE4SS_SO_SHA256=93f4c6e8aad5fc92792091fe4da983a2ea7d4f3a8de4f570180e13a51cdb6cab

RUN set -eux; \
    mkdir -p /opt/ue4ss/Mods; \
    curl -fsSL "$UE4SS_SO_URL" -o /tmp/libUE4SS.so; \
    echo "$UE4SS_SO_SHA256  /tmp/libUE4SS.so" | sha256sum -c -; \
    install -m 0644 /tmp/libUE4SS.so /opt/ue4ss/libUE4SS.so; \
    rm /tmp/libUE4SS.so

COPY apps/agones/palworld/ue4ss/UE4SS-settings.ini /opt/ue4ss/UE4SS-settings.ini
COPY apps/agones/palworld/mods/mods.txt /opt/ue4ss/Mods/mods.txt
COPY apps/agones/palworld/mods/PalChatRelay /opt/ue4ss/Mods/PalChatRelay
COPY apps/agones/palworld/ue4ss-launch.sh /usr/local/bin/ue4ss-launch
RUN set -eux; \
    chmod +x /usr/local/bin/ue4ss-launch; \
    sed -i 's|^"\${STARTCOMMAND\[@\]}"|/usr/local/bin/ue4ss-launch "${STARTCOMMAND[@]}"|' /home/steam/server/start.sh; \
    grep -q 'ue4ss-launch "\${STARTCOMMAND\[@\]}"' /home/steam/server/start.sh

COPY apps/agones/palworld/shim/agones-shim-prestop.sh /usr/local/bin/agones-shim-prestop
RUN chmod +x /usr/local/bin/agones-shim-prestop
