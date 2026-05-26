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
    AGONES_HEALTH_INTERVAL=5 \
    AGONES_READY_DELAY=30

EXPOSE 34197/udp

ENTRYPOINT ["/usr/local/bin/agones-shim"]
