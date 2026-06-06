ARG ACTIONS_RUNNER_VERSION=2.334.0
ARG KUBECTL_VERSION=1.31.0
ARG DBMATE_VERSION=2.28.0
ARG NODE_VERSION=24.16.0
ARG PNPM_VERSION=10.33.0
ARG PLAYWRIGHT_VERSION=1.59.1

FROM --platform=linux/amd64 ghcr.io/actions/actions-runner:${ACTIONS_RUNNER_VERSION} AS runtime

LABEL org.opencontainers.image.source="https://github.com/kbve/kbve"
LABEL org.opencontainers.image.description="KBVE arc-runner-set image — actions-runner + git-lfs/unzip/jq/xz/gh + kubectl/dbmate/envsubst/postgresql-client + node/pnpm/playwright."
LABEL org.opencontainers.image.licenses="MIT"

USER root

ARG KUBECTL_VERSION
ARG DBMATE_VERSION
RUN set -eux; \
    apt-get update; \
    apt-get install -y --no-install-recommends \
        git-lfs \
        unzip \
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
ARG PLAYWRIGHT_VERSION
ENV PLAYWRIGHT_BROWSERS_PATH=/opt/ms-playwright
RUN set -eux; \
    cd /tmp; \
    curl -fsSL -O "https://nodejs.org/dist/v${NODE_VERSION}/node-v${NODE_VERSION}-linux-x64.tar.xz"; \
    curl -fsSL -O "https://nodejs.org/dist/v${NODE_VERSION}/SHASUMS256.txt"; \
    grep "node-v${NODE_VERSION}-linux-x64.tar.xz" SHASUMS256.txt | sha256sum -c -; \
    tar -xJf "node-v${NODE_VERSION}-linux-x64.tar.xz" -C /opt; \
    ln -s "/opt/node-v${NODE_VERSION}-linux-x64/bin/node" /usr/local/bin/node; \
    ln -s "/opt/node-v${NODE_VERSION}-linux-x64/bin/npm" /usr/local/bin/npm; \
    ln -s "/opt/node-v${NODE_VERSION}-linux-x64/bin/npx" /usr/local/bin/npx; \
    rm "node-v${NODE_VERSION}-linux-x64.tar.xz" SHASUMS256.txt; \
    npm install -g "pnpm@${PNPM_VERSION}"; \
    mkdir -p "${PLAYWRIGHT_BROWSERS_PATH}"; \
    npx --yes "playwright@${PLAYWRIGHT_VERSION}" install --with-deps chromium webkit firefox; \
    chmod -R a+rX "${PLAYWRIGHT_BROWSERS_PATH}"; \
    node --version >/dev/null; \
    pnpm --version >/dev/null; \
    test -d "${PLAYWRIGHT_BROWSERS_PATH}/chromium-"*/chrome-linux*; \
    test -d "${PLAYWRIGHT_BROWSERS_PATH}/webkit-"*; \
    test -d "${PLAYWRIGHT_BROWSERS_PATH}/firefox-"*

USER runner
