# ============================================================================
# kbve/kubectl — Alpine kubectl + Rust CLI for VM lifecycle management.
#
# All-musl build:
#   [A] cargo-chef planner (rust:alpine)
#   [B] cargo-chef cook (cache musl deps)
#   [C] Build kbve-kubectl static musl binary
#   [D] Download kubectl static binary
#   [Z] Alpine runtime with shell, curl, jq, kubectl, kbve-kubectl
#
# Features:
#   - /bin/sh, sleep, sed, grep from Alpine base
#   - curl, jq via apk
#   - kubectl static binary
#   - kbve-kubectl: musl-static, no glibc dependency
#   - Non-root user (uid 10001 / appuser)
#
# Build:
#   docker build -t ghcr.io/kbve/kubectl:latest apps/vm/kubectl/
# ============================================================================

# ============================================================================
# [STAGE A] - Cargo Chef Planner
# ============================================================================
FROM --platform=linux/amd64 rust:1.83-alpine3.21 AS planner
ENV CARGO_INCREMENTAL=0
WORKDIR /app

RUN apk add --no-cache musl-dev && \
    cargo install cargo-chef --locked

COPY apps/vm/kubectl/Cargo.workspace.toml Cargo.toml
COPY apps/vm/kubectl/Cargo.toml apps/vm/kubectl/Cargo.toml

RUN mkdir -p apps/vm/kubectl/src && \
    echo "fn main() {}" > apps/vm/kubectl/src/main.rs

RUN cargo chef prepare --recipe-path recipe.json

# ============================================================================
# [STAGE B] - Cargo Chef Cook (cache deps)
# ============================================================================
FROM --platform=linux/amd64 rust:1.83-alpine3.21 AS builder-deps
ENV CARGO_INCREMENTAL=0
WORKDIR /app

RUN apk add --no-cache musl-dev && \
    cargo install cargo-chef --locked

COPY --from=planner /app/recipe.json recipe.json
COPY --from=planner /app/Cargo.toml ./
COPY --from=planner /app/apps apps

RUN --mount=type=cache,target=/usr/local/cargo/registry \
    --mount=type=cache,target=/usr/local/cargo/git \
    cargo chef cook --release --recipe-path recipe.json -p kbve-kubectl

# ============================================================================
# [STAGE C] - Build static musl binary
# ============================================================================
FROM --platform=linux/amd64 rust:1.83-alpine3.21 AS builder
ENV CARGO_INCREMENTAL=0
WORKDIR /app

RUN apk add --no-cache musl-dev

COPY --from=builder-deps /app/target target
COPY --from=builder-deps /usr/local/cargo /usr/local/cargo
COPY --from=planner /app/Cargo.toml ./
COPY apps/vm/kubectl apps/vm/kubectl

RUN --mount=type=cache,target=/usr/local/cargo/registry \
    --mount=type=cache,target=/usr/local/cargo/git \
    cargo build --release -p kbve-kubectl && \
    strip target/release/kbve-kubectl

# ============================================================================
# [STAGE D] - Download kubectl static binary
# ============================================================================
FROM --platform=linux/amd64 alpine:3.21 AS tools-dl

RUN apk add --no-cache curl ca-certificates

ARG KUBECTL_VERSION=1.33.2

RUN curl -fSL "https://dl.k8s.io/release/v${KUBECTL_VERSION}/bin/linux/amd64/kubectl" \
        -o /usr/local/bin/kubectl && \
    chmod +x /usr/local/bin/kubectl

# ============================================================================
# [STAGE Z] - Alpine runtime
# ============================================================================
FROM --platform=linux/amd64 alpine:3.21 AS runtime

RUN apk add --no-cache ca-certificates curl jq && \
    addgroup -g 10001 appgroup && \
    adduser -D -u 10001 -G appgroup -s /sbin/nologin appuser && \
    mkdir -p /app /scripts && \
    chown appuser:appgroup /app /scripts

COPY --from=tools-dl /usr/local/bin/kubectl /usr/local/bin/kubectl
COPY --from=builder /app/target/release/kbve-kubectl /usr/local/bin/kbve-kubectl

WORKDIR /app
USER appuser:appgroup

ENTRYPOINT ["kbve-kubectl"]
