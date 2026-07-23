ARG PALWORLD_IMAGE=thijsvanloef/palworld-server-docker
ARG PALWORLD_TAG=latest
FROM ${PALWORLD_IMAGE}:${PALWORLD_TAG}

USER root
RUN apt-get update && \
    apt-get install -y --no-install-recommends curl jq ca-certificates && \
    rm -rf /var/lib/apt/lists/*

ARG UE4SS_URL=https://github.com/NullPrism/RE-UE4SS-Linux/releases/download/linux-v0.1.0/RE-UE4SS-Linux-0.1.0-x86_64.tar.gz
ARG UE4SS_SHA256=15f9f368f51619918f29f5adbae6a0411056896c65b76b30980be4899b0f48da

RUN set -eux; \
    mkdir -p /opt/ue4ss; \
    curl -fsSL "$UE4SS_URL" -o /tmp/ue4ss.tar.gz; \
    echo "$UE4SS_SHA256  /tmp/ue4ss.tar.gz" | sha256sum -c -; \
    tar xzf /tmp/ue4ss.tar.gz -C /opt/ue4ss --strip-components=1; \
    rm /tmp/ue4ss.tar.gz; \
    test -f /opt/ue4ss/libUE4SS.so; \
    test -f /opt/ue4ss/run_ue4ss.sh; \
    sed -i \
        -e 's/^GuiConsoleEnabled = .*/GuiConsoleEnabled = 0/' \
        -e 's/^GuiConsoleVisible = .*/GuiConsoleVisible = 0/' \
        -e 's/^ConsoleEnabled = .*/ConsoleEnabled = 1/' \
        -e 's/^DumpOffsetsAndSizes = .*/DumpOffsetsAndSizes = 0/' \
        -e 's/^bUseUObjectArrayCache = .*/bUseUObjectArrayCache = false/' \
        /opt/ue4ss/UE4SS-settings.ini; \
    grep -q '^GuiConsoleEnabled = 0' /opt/ue4ss/UE4SS-settings.ini; \
    grep -q '^ConsoleEnabled = 1' /opt/ue4ss/UE4SS-settings.ini; \
    grep -q '^bUseUObjectArrayCache = false' /opt/ue4ss/UE4SS-settings.ini

COPY apps/agones/palworld/mods/PalChatRelay /opt/ue4ss/Mods/PalChatRelay
COPY apps/agones/palworld/ue4ss-launch.sh /usr/local/bin/ue4ss-launch
RUN set -eux; \
    chmod +x /usr/local/bin/ue4ss-launch; \
    sed -i 's|^"\${STARTCOMMAND\[@\]}"|/usr/local/bin/ue4ss-launch "${STARTCOMMAND[@]}"|' /home/steam/server/start.sh; \
    grep -q 'ue4ss-launch "\${STARTCOMMAND\[@\]}"' /home/steam/server/start.sh

COPY apps/agones/palworld/shim/agones-shim-prestop.sh /usr/local/bin/agones-shim-prestop
RUN chmod +x /usr/local/bin/agones-shim-prestop
