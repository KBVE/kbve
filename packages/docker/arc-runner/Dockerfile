# ============================================================================
# kbve/arc-runner — Custom GitHub Actions Runner image for arc-runner-set.
#
# Layered on top of `ghcr.io/actions/actions-runner` to bake in the tools
# our workflows install at job runtime today (git-lfs, unzip, jq, xz-utils,
# gh). Each tool we move into the image removes one apt-get round-trip
# from every job that pulls a runner — Unity matrix legs in particular
# install git-lfs three times per workflow run, once per build target.
#
# The image is consumed by both the `runner` container and the
# `init-dind-externals` init container in the arc-runner-set values.yaml.
# Externals (`/home/runner/externals/`) are inherited from the upstream
# base image, so the init container keeps working unchanged.
#
# Build:
#   docker build -t ghcr.io/kbve/arc-runner:latest packages/docker/arc-runner/
# ============================================================================

ARG ACTIONS_RUNNER_VERSION=2.334.0
ARG KUBECTL_VERSION=1.31.0
ARG DBMATE_VERSION=2.28.0
ARG NODE_VERSION=24.16.0
ARG PNPM_VERSION=10.33.0
ARG PLAYWRIGHT_VERSION=1.59.1

FROM --platform=linux/amd64 ghcr.io/actions/actions-runner:${ACTIONS_RUNNER_VERSION} AS runtime

LABEL org.opencontainers.image.source="https://github.com/kbve/kbve"
LABEL org.opencontainers.image.description="KBVE arc-runner-set image — actions-runner + git-lfs/unzip/jq/xz/gh + kubectl/dbmate/envsubst/postgresql-client + node/pnpm/playwright-chromium."
LABEL org.opencontainers.image.licenses="MIT"

USER root

# git-lfs               — Forgejo LFS pulls (rareicon Unity, future chuck UE5).
# unzip                 — butler installer + generic archive tooling.
# jq                    — manifest dispatch + workflow shell glue.
# xz-utils              — Unity / butler / SDK installers ship `.tar.xz`.
# ca-certs              — explicit pin so HTTPS clients always validate cert chains.
# curl                  — already present in upstream, included defensively.
# gh                    — GitHub CLI; several workflows shell out to it.
# gettext-base          — `envsubst` for k8s manifest rendering.
# postgresql-client     — `psql` for ci-dbmate-validate's seed-init step.
# kubectl               — pinned k8s client for ci-dbmate-deploy.
# dbmate                — pinned migrator. ci-dbmate-validate calls it
#                          directly; ci-dbmate-deploy uses it via the
#                          in-cluster Job (image bake = parity).
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
    # kubectl + dbmate from official release URLs. We pin via build-arg
    # and verify with sha256 fetched from the matching release manifest
    # — covers the supply-chain gap of bare `curl | install`.
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
    # Smoke-test every binary so a bad bake fails the build, not the runtime.
    kubectl version --client=true >/dev/null; \
    dbmate --version >/dev/null; \
    psql --version >/dev/null; \
    envsubst --version >/dev/null; \
    protoc --version >/dev/null

# node + pnpm + playwright chromium + webkit + firefox
#
# Baked at image-build time so per-job `pnpm exec playwright install` is a
# no-op cache hit at PLAYWRIGHT_BROWSERS_PATH. Avoids the libuv-threadpool
# deadlock observed on arc-runner-set when playwright extracts chromium's
# libwidevinecdm.so onto the pod's overlayfs at runtime, and the
# cdn.playwright.dev hangs that timed out astro-kbve-e2e at the 15-minute
# (then 25-minute) workflow timeout when a single chromium download
# stalled to ~280 KB/s — see #11849 / #11853 / #11854 / #11856.
#
# All three engines land here so astro-kbve-e2e's chromium + webkit +
# mobile-chrome + mobile-safari device list (and every other e2e using
# any subset of these) is cold-install-free.
#
# Keep NODE_VERSION/PNPM_VERSION/PLAYWRIGHT_VERSION in lockstep with
# package.json + .github/workflows/* (actions/setup-node, pnpm/action-setup,
# @playwright/test). Mismatch falls back to per-job install and re-opens
# both the deadlock and the CDN-stall failure mode.
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
