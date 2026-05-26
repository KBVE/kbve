ARG FACTORIO_VERSION=2.0.76
FROM factoriotools/factorio:${FACTORIO_VERSION}-rootless

USER root

COPY --chown=factorio:factorio apps/agones/factorio/scenarios/kbve /factorio/scenarios/kbve
COPY --chown=factorio:factorio apps/agones/factorio/config /opt/factorio/config-defaults
COPY apps/agones/factorio/shim/agones-shim.sh /usr/local/bin/agones-shim

RUN chmod +x /usr/local/bin/agones-shim

USER factorio

ENV FACTORIO_BIN=/opt/factorio/bin/x64/factorio \
    FACTORIO_SCENARIO=kbve \
    FACTORIO_PORT=34197 \
    FACTORIO_CONFIG_DIR=/factorio/config \
    FACTORIO_DEFAULTS_DIR=/opt/factorio/config-defaults \
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
