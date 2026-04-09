# ============================================================================
# kbve/kubectl — Alpine-based kubectl + Rust CLI for VM lifecycle management.
#
# Multi-stage build:
#   [A] cargo-chef planner
#   [B] cargo-chef cook (cache deps)
#   [C] Build kbve-kubectl binary
#   [Z] Alpine runtime with kubectl + kbve-kubectl + shell tools
#
# Features:
#   - /bin/sh (busybox), curl, wget, jq, sed, grep
#   - kbve-kubectl CLI: guest-exec, run, info subcommands
#   - kubectl 1.33.2 for direct Kubernetes API access
#   - Non-root user (uid 65534 / nobody)
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
# [STAGE Z] - Runtime
# ============================================================================
FROM alpine:3.21 AS runtime

ARG KUBECTL_VERSION=1.33.2

RUN apk add --no-cache \
        curl \
        wget \
        jq \
        ca-certificates && \
    curl -fSL "https://dl.k8s.io/release/v${KUBECTL_VERSION}/bin/linux/amd64/kubectl" \
        -o /usr/local/bin/kubectl && \
    chmod +x /usr/local/bin/kubectl && \
    kubectl version --client

COPY --from=builder /app/target/release/kbve-kubectl /usr/local/bin/kbve-kubectl

USER 65534:65534

ENTRYPOINT ["kbve-kubectl"]
