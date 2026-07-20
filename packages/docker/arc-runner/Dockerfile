ARG ACTIONS_RUNNER_VERSION=2.335.1
ARG KUBECTL_VERSION=1.31.0
ARG DBMATE_VERSION=2.28.0
ARG NODE_VERSION=24.16.0
ARG PNPM_VERSION=11.15.0
ARG PLAYWRIGHT_VERSION=1.59.1

FROM --platform=linux/amd64 mcr.microsoft.com/playwright:v${PLAYWRIGHT_VERSION}-jammy AS playwright-src

FROM --platform=linux/amd64 ghcr.io/actions/actions-runner:${ACTIONS_RUNNER_VERSION} AS runtime

LABEL org.opencontainers.image.source="https://github.com/kbve/kbve"
LABEL org.opencontainers.image.description="KBVE arc-runner-set image — actions-runner + git-lfs/unzip/zip/jq/xz/gh + kubectl/dbmate/envsubst/postgresql-client + node/pnpm/playwright."
LABEL org.opencontainers.image.licenses="MIT"

USER root

ARG KUBECTL_VERSION
ARG DBMATE_VERSION
RUN set -eux; \
    apt-get update; \
    apt-get install -y --no-install-recommends \
        git-lfs \
        unzip \
        zip \
        jq \
        xz-utils \
        ca-certificates \
        curl \
        gnupg \
        rsync \
        build-essential \
        pkg-config \
        protobuf-compiler \
        libprotobuf-dev \
        gettext-base \
        postgresql-client; \
    install -m 0755 -d /etc/apt/keyrings; \
    curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg \
        | gpg --dearmor -o /etc/apt/keyrings/githubcli-archive-keyring.gpg; \
    chmod 0644 /etc/apt/keyrings/githubcli-archive-keyring.gpg; \
    echo "deb [arch=amd64 signed-by=/etc/apt/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" \
        > /etc/apt/sources.list.d/github-cli.list; \
    apt-get update; \
    apt-get install -y --no-install-recommends gh; \
    KUBECTL_SHA=$(curl -fsSL "https://dl.k8s.io/release/v${KUBECTL_VERSION}/bin/linux/amd64/kubectl.sha256"); \
    curl -fsSL -o /tmp/kubectl "https://dl.k8s.io/release/v${KUBECTL_VERSION}/bin/linux/amd64/kubectl"; \
    echo "${KUBECTL_SHA}  /tmp/kubectl" | sha256sum -c -; \
    install -m 0755 /tmp/kubectl /usr/local/bin/kubectl; \
    rm /tmp/kubectl; \
    curl -fsSL -o /tmp/dbmate \
        "https://github.com/amacneil/dbmate/releases/download/v${DBMATE_VERSION}/dbmate-linux-amd64"; \
    install -m 0755 /tmp/dbmate /usr/local/bin/dbmate; \
    rm /tmp/dbmate; \
    apt-get purge -y --auto-remove gnupg; \
    rm -rf /var/lib/apt/lists/*; \
    git-lfs install --system; \
    echo 'root ALL=(ALL) NOPASSWD:ALL' >> /etc/sudoers; \
    kubectl version --client=true >/dev/null; \
    dbmate --version >/dev/null; \
    psql --version >/dev/null; \
    envsubst --version >/dev/null; \
    protoc --version >/dev/null

ARG NODE_VERSION
ARG PNPM_VERSION
ENV PLAYWRIGHT_BROWSERS_PATH=/opt/ms-playwright
ENV PATH=/opt/node-current/bin:$PATH
RUN set -eux; \
    cd /tmp; \
    curl -fsSL -O "https://nodejs.org/dist/v${NODE_VERSION}/node-v${NODE_VERSION}-linux-x64.tar.xz"; \
    curl -fsSL -O "https://nodejs.org/dist/v${NODE_VERSION}/SHASUMS256.txt"; \
    grep "node-v${NODE_VERSION}-linux-x64.tar.xz" SHASUMS256.txt | sha256sum -c -; \
    tar -xJf "node-v${NODE_VERSION}-linux-x64.tar.xz" -C /opt; \
    ln -s "/opt/node-v${NODE_VERSION}-linux-x64" /opt/node-current; \
    rm "node-v${NODE_VERSION}-linux-x64.tar.xz" SHASUMS256.txt; \
    npm install -g "pnpm@${PNPM_VERSION}"; \
    node --version >/dev/null; \
    npm --version >/dev/null; \
    npx --version >/dev/null; \
    pnpm --version >/dev/null

ARG PLAYWRIGHT_VERSION
COPY --from=playwright-src /ms-playwright /opt/ms-playwright
RUN set -eux; \
    chmod -R a+rX /opt/ms-playwright; \
    apt-get update; \
    npx --yes "playwright@${PLAYWRIGHT_VERSION}" install-deps chromium webkit firefox; \
    rm -rf /var/lib/apt/lists/*; \
    test -d /opt/ms-playwright/chromium-*/chrome-linux*; \
    test -d /opt/ms-playwright/webkit-*; \
    test -d /opt/ms-playwright/firefox-*

USER runner
