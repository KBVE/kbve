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
    mkdir -p /opt/ue4ss /palworld/Pal/Binaries/Linux/Mods; \
    curl -fsSL "$UE4SS_URL" -o /tmp/ue4ss.tar.gz; \
    echo "$UE4SS_SHA256  /tmp/ue4ss.tar.gz" | sha256sum -c -; \
    tar xzf /tmp/ue4ss.tar.gz -C /opt/ue4ss --strip-components=1; \
    rm /tmp/ue4ss.tar.gz; \
    install -m 0755 /opt/ue4ss/libUE4SS.so /palworld/Pal/Binaries/Linux/libUE4SS.so; \
    install -m 0755 /opt/ue4ss/run_ue4ss.sh /palworld/Pal/Binaries/Linux/run_ue4ss.sh; \
    install -m 0644 /opt/ue4ss/UE4SS-settings.ini /palworld/Pal/Binaries/Linux/UE4SS-settings.ini; \
    cp -a /opt/ue4ss/Mods/. /palworld/Pal/Binaries/Linux/Mods/; \
    install -d -m 0755 /palworld/Pal/Binaries/Linux/UE4SS-crashes

COPY apps/agones/palworld/mods/PalChatRelay /palworld/Pal/Binaries/Linux/Mods/PalChatRelay
COPY apps/agones/palworld/entrypoint-ue4ss.sh /usr/local/bin/entrypoint-ue4ss
RUN chmod +x /usr/local/bin/entrypoint-ue4ss

COPY apps/agones/palworld/shim/agones-shim-prestop.sh /usr/local/bin/agones-shim-prestop
RUN chmod +x /usr/local/bin/agones-shim-prestop
