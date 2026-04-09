# ============================================================================
# kbve/kubectl — Chiseled Ubuntu kubectl + Rust CLI for VM lifecycle management.
#
# Multi-stage build:
#   [A] cargo-chef planner
#   [B] cargo-chef cook (cache deps)
#   [C] Build kbve-kubectl binary
#   [D] Chisel Ubuntu rootfs with shell tools (busybox, curl, jq)
#   [E] Download kubectl + jq static binaries
#   [Z] Scratch runtime — chiseled Ubuntu + kubectl + kbve-kubectl
#
# Features:
#   - /bin/sh via busybox (ash), sed, grep, wget built-in
#   - curl (from Ubuntu chisel slice)
#   - jq (static binary)
#   - kubectl 1.33.2 (static binary)
#   - kbve-kubectl CLI: guest-exec, run, info subcommands
#   - Non-root user (uid 10001 / appuser)
#   - Read-only rootfs compatible
#   - seccompProfile / drop ALL capabilities safe
#
# Build:
#   docker build -t ghcr.io/kbve/kubectl:latest apps/vm/kubectl/
# ============================================================================

# ============================================================================
# [STAGE A] - Cargo Chef Planner
# ============================================================================
FROM --platform=linux/amd64 ghcr.io/kbve/chisel-ubuntu-axum:24.04-builder AS planner
ENV CARGO_INCREMENTAL=0

COPY apps/vm/kubectl/Cargo.workspace.toml Cargo.toml
COPY apps/vm/kubectl/Cargo.toml apps/vm/kubectl/Cargo.toml

RUN mkdir -p apps/vm/kubectl/src && \
    echo "fn main() {}" > apps/vm/kubectl/src/main.rs

RUN cargo chef prepare --recipe-path recipe.json

# ============================================================================
# [STAGE B] - Cargo Chef Cook (Cache Dependencies)
# ============================================================================
FROM --platform=linux/amd64 ghcr.io/kbve/chisel-ubuntu-axum:24.04-builder AS builder-deps
ENV CARGO_INCREMENTAL=0

COPY --from=planner /app/recipe.json recipe.json
COPY --from=planner /app/Cargo.toml ./
COPY --from=planner /app/apps apps

RUN --mount=type=cache,target=/usr/local/cargo/registry \
    --mount=type=cache,target=/usr/local/cargo/git \
    --mount=type=cache,target=/usr/local/sccache,id=sccache \
    cargo chef cook --release --recipe-path recipe.json -p kbve-kubectl

# ============================================================================
# [STAGE C] - Build Application
# ============================================================================
FROM --platform=linux/amd64 ghcr.io/kbve/chisel-ubuntu-axum:24.04-builder AS builder
ENV CARGO_INCREMENTAL=0

COPY --from=builder-deps /app/target target
COPY --from=builder-deps /usr/local/cargo /usr/local/cargo

COPY --from=planner /app/Cargo.toml ./

COPY apps/vm/kubectl apps/vm/kubectl

RUN --mount=type=cache,target=/usr/local/cargo/registry \
    --mount=type=cache,target=/usr/local/cargo/git \
    --mount=type=cache,target=/usr/local/sccache,id=sccache \
    cargo build --release -p kbve-kubectl && \
    strip target/release/kbve-kubectl

# ============================================================================
# [STAGE D] - Chisel Ubuntu rootfs with shell tools
# ============================================================================
FROM --platform=linux/amd64 ubuntu:24.04 AS chisel-stage

RUN apt-get update && apt-get install -y --no-install-recommends wget ca-certificates

ARG CHISEL_VERSION=1.4.0
RUN wget -q "https://github.com/canonical/chisel/releases/download/v${CHISEL_VERSION}/chisel_v${CHISEL_VERSION}_linux_amd64.tar.gz" \
        -O /tmp/chisel.tar.gz && \
    tar -xzf /tmp/chisel.tar.gz -C /usr/local/bin chisel && \
    rm /tmp/chisel.tar.gz

WORKDIR /rootfs
RUN chisel cut --release ubuntu-24.04 --root /rootfs \
        base-files_base \
        base-files_release-info \
        ca-certificates_data \
        libgcc-s1_libs \
        libc6_libs \
        libstdc++6_libs \
        openssl_config \
        busybox-static_bins \
        libcurl4t64_libs \
        curl_bins && \
    # Create busybox symlinks for shell utilities
    /rootfs/usr/bin/busybox --install -s /rootfs/usr/bin && \
    ln -sf /usr/bin/busybox /rootfs/bin/sh && \
    # Create non-root user
    echo 'appuser:x:10001:10001::/nonexistent:/usr/sbin/nologin' >> /rootfs/etc/passwd && \
    echo 'appgroup:x:10001:' >> /rootfs/etc/group && \
    # Create required directories
    mkdir -p /rootfs/app /rootfs/tmp /rootfs/scripts && \
    chown 10001:10001 /rootfs/app /rootfs/scripts && \
    chmod 1777 /rootfs/tmp

# ============================================================================
# [STAGE E] - Download static binaries (kubectl + jq)
# ============================================================================
FROM --platform=linux/amd64 ubuntu:24.04 AS tools-dl

RUN apt-get update && \
    apt-get install -y --no-install-recommends curl ca-certificates && \
    rm -rf /var/lib/apt/lists/*

ARG KUBECTL_VERSION=1.33.2
ARG JQ_VERSION=1.7.1

RUN curl -fSL "https://dl.k8s.io/release/v${KUBECTL_VERSION}/bin/linux/amd64/kubectl" \
        -o /usr/local/bin/kubectl && \
    chmod +x /usr/local/bin/kubectl && \
    curl -fSL "https://github.com/jqlang/jq/releases/download/jq-${JQ_VERSION}/jq-linux-amd64" \
        -o /usr/local/bin/jq && \
    chmod +x /usr/local/bin/jq

# ============================================================================
# [STAGE Z] - Runtime
# ============================================================================
FROM --platform=linux/amd64 scratch AS runtime

COPY --from=chisel-stage /rootfs /
COPY --from=tools-dl /usr/local/bin/kubectl /usr/local/bin/kubectl
COPY --from=tools-dl /usr/local/bin/jq /usr/local/bin/jq
COPY --from=builder /app/target/release/kbve-kubectl /usr/local/bin/kbve-kubectl

WORKDIR /app
USER 10001:10001

ENTRYPOINT ["kbve-kubectl"]
