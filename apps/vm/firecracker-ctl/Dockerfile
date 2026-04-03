# ============================================================================
# firecracker-ctl — Multi-stage Docker build
#
# Builder uses the shared chisel base image:
#   ghcr.io/kbve/chisel-ubuntu-axum:24.04-builder  (Rust 1.94 + cargo-chef)
# Runtime includes the Firecracker binary + jailer for microVM management.
# ============================================================================

# ============================================================================
# [STAGE A] - Cargo Chef Planner
# ============================================================================
FROM --platform=linux/amd64 ghcr.io/kbve/chisel-ubuntu-axum:24.04-builder AS planner

COPY apps/vm/firecracker-ctl/Cargo.workspace.toml Cargo.toml
COPY apps/vm/firecracker-ctl/Cargo.toml apps/vm/firecracker-ctl/Cargo.toml

RUN mkdir -p apps/vm/firecracker-ctl/src && \
    echo "fn main() {}" > apps/vm/firecracker-ctl/src/main.rs

RUN --mount=type=cache,target=/usr/local/sccache,id=sccache \
    cargo chef prepare --recipe-path recipe.json

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
    cargo chef cook --release --recipe-path recipe.json -p firecracker-ctl

# ============================================================================
# [STAGE C] - Build Application
# ============================================================================
FROM --platform=linux/amd64 ghcr.io/kbve/chisel-ubuntu-axum:24.04-builder AS builder
ENV CARGO_INCREMENTAL=0

COPY --from=builder-deps /app/target target
COPY --from=builder-deps /usr/local/cargo /usr/local/cargo

COPY --from=planner /app/Cargo.toml ./

COPY apps/vm/firecracker-ctl apps/vm/firecracker-ctl

RUN --mount=type=cache,target=/usr/local/cargo/registry \
    --mount=type=cache,target=/usr/local/cargo/git \
    --mount=type=cache,target=/usr/local/sccache,id=sccache \
    cargo build --release -p firecracker-ctl && \
    strip target/release/firecracker-ctl

# ============================================================================
# [STAGE D] - Download Firecracker Binary
# ============================================================================
FROM --platform=linux/amd64 ubuntu:24.04 AS firecracker-dl

RUN apt-get update && \
    apt-get install -y --no-install-recommends curl ca-certificates && \
    rm -rf /var/lib/apt/lists/*

ARG FC_VERSION=1.10.1
RUN curl -fSL "https://github.com/firecracker-microvm/firecracker/releases/download/v${FC_VERSION}/firecracker-v${FC_VERSION}-x86_64.tgz" \
    -o /tmp/fc.tgz && \
    tar -xzf /tmp/fc.tgz -C /tmp && \
    mv "/tmp/release-v${FC_VERSION}-x86_64/firecracker-v${FC_VERSION}-x86_64" /usr/local/bin/firecracker && \
    mv "/tmp/release-v${FC_VERSION}-x86_64/jailer-v${FC_VERSION}-x86_64" /usr/local/bin/jailer && \
    chmod +x /usr/local/bin/firecracker /usr/local/bin/jailer && \
    rm -rf /tmp/fc.tgz /tmp/release-*

# ============================================================================
# [STAGE Z] - Runtime
# ============================================================================
FROM --platform=linux/amd64 ubuntu:24.04 AS runtime

RUN apt-get update && \
    apt-get install -y --no-install-recommends \
        ca-certificates \
        iproute2 \
        iptables && \
    rm -rf /var/lib/apt/lists/* && \
    groupadd -g 10001 appgroup && \
    useradd -u 10001 -g appgroup -s /bin/false appuser && \
    mkdir -p /var/lib/firecracker/rootfs /var/lib/firecracker/scratch && \
    chown -R 10001:10001 /var/lib/firecracker

COPY --from=builder /app/target/release/firecracker-ctl /usr/local/bin/firecracker-ctl
COPY --from=firecracker-dl /usr/local/bin/firecracker /usr/local/bin/firecracker
COPY --from=firecracker-dl /usr/local/bin/jailer /usr/local/bin/jailer

ENV FC_PORT=9001
ENV FC_ROOTFS_DIR=/var/lib/firecracker/rootfs
ENV RUST_LOG=firecracker_ctl=info,tower_http=info

EXPOSE 9001

# Note: runs as root because Firecracker needs /dev/kvm access.
# The jailer handles per-VM sandboxing (cgroup + seccomp + chroot).
ENTRYPOINT ["firecracker-ctl"]
