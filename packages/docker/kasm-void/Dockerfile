ARG BASE_TAG=1.18.0-rolling-daily
FROM kasmweb/discord:${BASE_TAG}

ARG CLOAK_VERSION=chromium-v146.0.7680.177.4
ARG CLOAK_SHA256=
ENV CLOAK_HOME=/opt/cloakbrowser \
    CLOAK_BIN=/opt/cloakbrowser/cloakbrowser

USER root

RUN set -eux; \
    apt-get update; \
    DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends \
        ca-certificates curl tar xz-utils procps \
        python3 python3-pip \
        libnss3 libnspr4 libatk1.0-0 libatk-bridge2.0-0 libdrm2 libxkbcommon0 \
        libxcomposite1 libxdamage1 libxfixes3 libxrandr2 libgbm1 libgtk-3-0 \
        libasound2 libpango-1.0-0 libcairo2 libcups2 libdbus-1-3 fonts-liberation; \
    pip3 install --no-cache-dir --break-system-packages websocket-client==1.8.0; \
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
    if [ -f /dockerstartup/custom_startup.sh ]; then \
      mv /dockerstartup/custom_startup.sh /dockerstartup/discord_startup.sh; \
    fi

COPY custom_startup.sh /dockerstartup/custom_startup.sh
COPY nav_shim.py /dockerstartup/nav_shim.py
COPY cloakbrowser.desktop /home/kasm-user/Desktop/cloakbrowser.desktop

RUN set -eux; \
    chmod +x /dockerstartup/custom_startup.sh /dockerstartup/nav_shim.py; \
    [ -f /dockerstartup/discord_startup.sh ] && chmod +x /dockerstartup/discord_startup.sh || true; \
    chown -R 1000:1000 /home/kasm-user /dockerstartup/custom_startup.sh /dockerstartup/nav_shim.py /dockerstartup/discord_startup.sh 2>/dev/null || true

USER 1000
ENV HOME=/home/kasm-user \
    START_URL=https://kbve.com \
    LAUNCH_DISCORD=1 \
    LAUNCH_CLOAK=1 \
    LAUNCH_NAV_SHIM=1 \
    NAV_SHIM_PORT=9998 \
    CDP_PORT=9222
WORKDIR /home/kasm-user
