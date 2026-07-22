ARG PALWORLD_IMAGE=thijsvanloef/palworld-server-docker
ARG PALWORLD_TAG=latest
FROM ${PALWORLD_IMAGE}:${PALWORLD_TAG}

USER root
RUN apt-get update && \
    apt-get install -y --no-install-recommends curl jq ca-certificates && \
    rm -rf /var/lib/apt/lists/*

COPY apps/agones/palworld/shim/agones-shim-prestop.sh /usr/local/bin/agones-shim-prestop
RUN chmod +x /usr/local/bin/agones-shim-prestop
