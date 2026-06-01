ARG FACTORIO_VERSION=2.0.76
FROM factoriotools/factorio:${FACTORIO_VERSION}-rootless

USER root

RUN apt-get update && \
    apt-get install -y --no-install-recommends wget jq ca-certificates zip python3-minimal && \
    rm -rf /var/lib/apt/lists/*

COPY --chown=1000:1000 apps/agones/factorio/config /opt/factorio/config-defaults
COPY --chown=1000:1000 apps/agones/factorio/mods /opt/factorio/mods-defaults
COPY --chown=1000:1000 apps/agones/factorio/mods-local/kbve /opt/factorio/mods-defaults/kbve
COPY apps/agones/factorio/shim/agones-shim.sh /usr/local/bin/agones-shim
COPY apps/agones/factorio/shim/agones-shim-prestop.sh /usr/local/bin/agones-shim-prestop

RUN chmod +x /usr/local/bin/agones-shim /usr/local/bin/agones-shim-prestop && \
    mkdir -p /shared/log /factorio/config /factorio/mods /factorio/scenarios && \
    ln -sfn /opt/factorio/mods-defaults/kbve/scenarios/kbve /factorio/scenarios/kbve && \
    chown -R 1000:1000 /shared/log /factorio/config /factorio/mods /factorio/scenarios

USER 1000:1000

ENV FACTORIO_BIN=/opt/factorio/bin/x64/factorio \
    FACTORIO_SCENARIO=kbve \
    FACTORIO_PORT=34197 \
    FACTORIO_CONFIG_DIR=/factorio/config \
    FACTORIO_DEFAULTS_DIR=/opt/factorio/config-defaults \
    FACTORIO_MODS_DIR=/factorio/mods \
    FACTORIO_MODS_DEFAULTS_DIR=/opt/factorio/mods-defaults \
    FACTORIO_LOG_DIR=/shared/log \
    FACTORIO_CONSOLE_LOG=/shared/log/console.log \
    FACTORIO_RCON_PORT=27015 \
    FACTORIO_RCON_BIND=127.0.0.1 \
    AGONES_HEALTH_INTERVAL=5 \
    AGONES_READY_DELAY=30

EXPOSE 34197/udp
EXPOSE 27015/tcp

VOLUME ["/shared/log"]

ENTRYPOINT ["/usr/local/bin/agones-shim"]
