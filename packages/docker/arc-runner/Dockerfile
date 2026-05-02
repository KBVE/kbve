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

FROM --platform=linux/amd64 ghcr.io/actions/actions-runner:${ACTIONS_RUNNER_VERSION} AS runtime

LABEL org.opencontainers.image.source="https://github.com/kbve/kbve"
LABEL org.opencontainers.image.description="KBVE arc-runner-set image — actions-runner + git-lfs/unzip/jq/xz/gh."
LABEL org.opencontainers.image.licenses="MIT"

USER root

# git-lfs    — Forgejo LFS pulls (rareicon Unity, future chuck UE5).
# unzip      — butler installer + generic archive tooling.
# jq         — manifest dispatch + workflow shell glue.
# xz-utils   — Unity / butler / SDK installers ship `.tar.xz`.
# ca-certs   — explicit pin so HTTPS clients always validate cert chains.
# curl       — already present in upstream, included defensively.
# gh         — GitHub CLI; several workflows shell out to it.
#
# Install order:
#   1. apt repos refresh + base bundle.
#   2. GitHub CLI from gh-cli.github.com (own keyring, own list file).
#   3. `git-lfs install --system` so every shell sees the smudge filter.
#   4. Sudoers tweak so `runAsUser: 0` runner can `sudo` without prompts;
#      mirrors the inline `command:` patch in values.yaml so the pod spec
#      can drop the override.
RUN set -eux; \
    apt-get update; \
    apt-get install -y --no-install-recommends \
        git-lfs \
        unzip \
        jq \
        xz-utils \
        ca-certificates \
        curl \
        gnupg; \
    install -m 0755 -d /etc/apt/keyrings; \
    curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg \
        | gpg --dearmor -o /etc/apt/keyrings/githubcli-archive-keyring.gpg; \
    chmod 0644 /etc/apt/keyrings/githubcli-archive-keyring.gpg; \
    echo "deb [arch=amd64 signed-by=/etc/apt/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" \
        > /etc/apt/sources.list.d/github-cli.list; \
    apt-get update; \
    apt-get install -y --no-install-recommends gh; \
    apt-get purge -y --auto-remove gnupg; \
    rm -rf /var/lib/apt/lists/*; \
    git-lfs install --system; \
    echo 'root ALL=(ALL) NOPASSWD:ALL' >> /etc/sudoers

USER runner
