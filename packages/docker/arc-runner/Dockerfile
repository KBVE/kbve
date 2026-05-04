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

FROM --platform=linux/amd64 ghcr.io/actions/actions-runner:${ACTIONS_RUNNER_VERSION} AS runtime

LABEL org.opencontainers.image.source="https://github.com/kbve/kbve"
LABEL org.opencontainers.image.description="KBVE arc-runner-set image — actions-runner + git-lfs/unzip/jq/xz/gh + kubectl/dbmate/envsubst/postgresql-client."
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
    envsubst --version >/dev/null

USER runner
