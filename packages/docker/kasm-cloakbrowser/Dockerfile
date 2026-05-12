ARG BASE_TAG=1.18.0
FROM kasmweb/core-ubuntu-jammy:${BASE_TAG}

ARG CLOAK_VERSION=chromium-v146.0.7680.177.4
ARG CLOAK_SHA256=
ARG CLOAKBROWSER_PIP_VERSION=
ENV CLOAK_HOME=/opt/cloakbrowser \
    CLOAK_BIN=/opt/cloakbrowser/cloakbrowser \
    CLOAKBROWSER_CACHE_DIR=/opt/cloakbrowser-cache \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

USER root

RUN set -eux; \
    apt-get update; \
    DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends \
        ca-certificates curl tar xz-utils \
        python3 python3-pip python3-venv \
        libnss3 libnspr4 libatk1.0-0 libatk-bridge2.0-0 libdrm2 libxkbcommon0 \
        libxcomposite1 libxdamage1 libxfixes3 libxrandr2 libgbm1 libgtk-3-0 \
        libasound2 libpango-1.0-0 libcairo2 libcups2 libdbus-1-3 fonts-liberation; \
    rm -rf /var/lib/apt/lists/*

RUN set -eux; \
    arch="$(dpkg --print-architecture)"; \
    case "$arch" in \
      amd64) asset="cloakbrowser-linux-x64.tar.gz" ;; \
      arm64) asset="cloakbrowser-linux-arm64.tar.gz" ;; \
      *) echo "unsupported arch: $arch" >&2; exit 1 ;; \
    esac; \
    url="https://github.com/CloakHQ/CloakBrowser/releases/download/${CLOAK_VERSION}/${asset}"; \
    curl -fL --retry 5 -o /tmp/cloak.tar.gz "$url"; \
    if [ -n "$CLOAK_SHA256" ]; then echo "$CLOAK_SHA256  /tmp/cloak.tar.gz" | sha256sum -c -; fi; \
    mkdir -p "$CLOAK_HOME"; \
    tar -C "$CLOAK_HOME" --strip-components=1 -xzf /tmp/cloak.tar.gz; \
    rm /tmp/cloak.tar.gz; \
    if [ ! -x "$CLOAK_BIN" ]; then \
      candidate="$(find "$CLOAK_HOME" -maxdepth 2 -type f \( -name cloakbrowser -o -name chrome -o -name chromium \) -perm -u+x | head -1)"; \
      [ -n "$candidate" ] && ln -sf "$candidate" "$CLOAK_BIN"; \
    fi; \
    [ -x "$CLOAK_BIN" ]; \
    chown -R 1000:1000 "$CLOAK_HOME"

RUN set -eux; \
    pip_spec="cloakbrowser${CLOAKBROWSER_PIP_VERSION:+==${CLOAKBROWSER_PIP_VERSION}}"; \
    pip3 install --no-cache-dir "$pip_spec"; \
    mkdir -p "$CLOAKBROWSER_CACHE_DIR"; \
    chown 1000:1000 "$CLOAKBROWSER_CACHE_DIR"; \
    CLOAKBROWSER_CACHE_DIR="$CLOAKBROWSER_CACHE_DIR" \
      python3 -m cloakbrowser ensure-binary || \
      echo "ensure-binary failed at build (will retry on first launch)"

COPY custom_startup.sh /dockerstartup/custom_startup.sh
COPY cloakbrowser.desktop /home/kasm-user/Desktop/cloakbrowser.desktop

RUN chmod +x /dockerstartup/custom_startup.sh \
 && chown 1000:1000 /dockerstartup/custom_startup.sh /home/kasm-user/Desktop/cloakbrowser.desktop

USER 1000
ENV HOME=/home/kasm-user \
    START_URL=https://discord.com/app
WORKDIR /home/kasm-user
