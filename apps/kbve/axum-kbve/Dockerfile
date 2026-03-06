# Pre-built Rust build base image (override with --build-arg BUILD_BASE=...)
#
# CI mode:   BUILD_BASE=ghcr.io/kbve/kbve-build-base:latest
#             -> skips inline Rust stages, pulls pre-built foundation from GHCR
# Local mode: BUILD_BASE=foundation (default)
#             -> builds everything inline (no external image needed)
ARG BUILD_BASE=foundation

# ============================================================================
# [STAGE A+B] - Precompress Pre-built Astro Static Assets
#
# Astro is built by the `container-prep` nx target BEFORE Docker runs.
# The pre-built output lives at apps/kbve/axum-kbve/dist/ in the build context.
# This eliminates the node:24-slim stage (~150s+ Astro build inside Docker).
# ============================================================================
FROM --platform=linux/amd64 ubuntu:24.04 AS astro-precompressor

RUN apt-get update && \
    apt-get install -y --no-install-recommends gzip brotli && \
    rm -rf /var/lib/apt/lists/*

COPY apps/kbve/axum-kbve/dist/ /static

WORKDIR /static
RUN find . -type f \( \
        -name "*.css" -o \
        -name "*.js" -o \
        -name "*.json" -o \
        -name "*.svg" -o \
        -name "*.xml" -o \
        -name "*.txt" -o \
        -name "*.html" \
    \) ! -path "*/askama/*" -exec sh -c ' \
        gzip -9 -k "$1" && \
        brotli --best --keep "$1" \
    ' _ {} \; && \
    echo "Precompression complete (brotli-11 + gzip-9)"

# ============================================================================
# Inline Rust build stages (used when BUILD_BASE=foundation, i.e. local mode)
# When BUILD_BASE points to an external image, these stages are skipped entirely.
# ============================================================================

# [STAGE C] - Rust Base Image
FROM --platform=linux/amd64 rust:1.90-slim AS rust-base

RUN apt-get update && \
    apt-get install -y --no-install-recommends \
        pkg-config \
        libssl-dev \
        protobuf-compiler \
        libprotobuf-dev \
        mold && \
    rm -rf /var/lib/apt/lists/*

RUN rustup target add x86_64-unknown-linux-gnu && \
    cargo install cargo-chef --locked

WORKDIR /app

# [STAGE D] - Cargo Chef Planner
FROM rust-base AS planner

COPY apps/kbve/axum-kbve/Cargo.workspace.toml Cargo.toml
COPY Cargo.lock ./

COPY apps/kbve/axum-kbve/Cargo.toml apps/kbve/axum-kbve/Cargo.toml
COPY packages/rust/jedi/Cargo.toml packages/rust/jedi/Cargo.toml
COPY packages/rust/kbve/Cargo.toml packages/rust/kbve/Cargo.toml

COPY packages/data/proto packages/data/proto

RUN mkdir -p apps/kbve/axum-kbve/src && echo "fn main() {}" > apps/kbve/axum-kbve/src/main.rs && \
    mkdir -p packages/rust/jedi/src && echo "" > packages/rust/jedi/src/lib.rs && \
    mkdir -p packages/rust/kbve/src && echo "" > packages/rust/kbve/src/lib.rs

RUN cargo chef prepare --recipe-path recipe.json

# [STAGE E] - Cargo Chef Cook (Cache External Dependencies)
FROM rust-base AS builder-deps

COPY --from=planner /app/recipe.json recipe.json
COPY --from=planner /app/Cargo.toml /app/Cargo.lock ./
COPY --from=planner /app/apps apps
COPY --from=planner /app/packages packages

RUN --mount=type=cache,target=/usr/local/cargo/registry \
    --mount=type=cache,target=/usr/local/cargo/git \
    cargo chef cook --release --recipe-path recipe.json -p axum-kbve

# [STAGE E2] - Foundation Layer (Compile kbve + jedi from real source)
FROM rust-base AS foundation

COPY --from=builder-deps /app/target target
COPY --from=builder-deps /usr/local/cargo /usr/local/cargo

COPY --from=planner /app/Cargo.toml ./
COPY Cargo.lock ./

COPY apps/kbve/axum-kbve/Cargo.toml apps/kbve/axum-kbve/Cargo.toml
RUN mkdir -p apps/kbve/axum-kbve/src && \
    echo "fn main() {}" > apps/kbve/axum-kbve/src/main.rs

COPY packages/data/proto packages/data/proto

COPY packages/rust/jedi packages/rust/jedi
COPY packages/rust/kbve packages/rust/kbve

RUN --mount=type=cache,target=/usr/local/cargo/registry \
    --mount=type=cache,target=/usr/local/cargo/git \
    cargo build --release -p kbve -p jedi

# ============================================================================
# [STAGE F] - Build Application
#
# Uses BUILD_BASE (default: "foundation" = inline stages above).
# In CI, set BUILD_BASE=ghcr.io/kbve/kbve-build-base:latest to skip
# all inline Rust stages and use the pre-built GHCR image instead.
# ============================================================================
FROM ${BUILD_BASE} AS builder

ENV RUSTFLAGS="-C link-arg=-fuse-ld=mold"

# Astro build output (precompressed) -> placed into templates/dist
COPY --from=astro-precompressor /static /app/apps/kbve/axum-kbve/templates/dist

# Foundation crate source (cargo needs source to verify fingerprints)
COPY packages/data/proto packages/data/proto
COPY packages/rust/jedi packages/rust/jedi
COPY packages/rust/kbve packages/rust/kbve

# Application source (most frequently changing — placed last for cache)
COPY apps/kbve/axum-kbve apps/kbve/axum-kbve

# Copy Askama templates
COPY apps/kbve/axum-kbve/templates/askama /app/apps/kbve/axum-kbve/templates/askama

RUN --mount=type=cache,target=/usr/local/cargo/registry \
    --mount=type=cache,target=/usr/local/cargo/git \
    cargo build --release -p axum-kbve && \
    strip target/release/axum-kbve

# ============================================================================
# [STAGE G] - Chisel Ubuntu Base (Minimal Runtime)
# ============================================================================
FROM --platform=linux/amd64 ubuntu:24.04 AS chisel-builder

RUN apt-get update && apt-get install -y wget ca-certificates

WORKDIR /tmp

RUN wget https://go.dev/dl/go1.23.4.linux-amd64.tar.gz && \
    tar -xvf go1.23.4.linux-amd64.tar.gz && \
    mv go /usr/local

RUN GOBIN=/usr/local/bin/ /usr/local/go/bin/go install github.com/canonical/chisel/cmd/chisel@latest

WORKDIR /rootfs
RUN chisel cut --release ubuntu-24.04 --root /rootfs \
        base-files_base \
        base-files_release-info \
        ca-certificates_data \
        libgcc-s1_libs \
        libc6_libs \
        libstdc++6_libs \
        openssl_config && \
    echo 'appuser:x:10001:10001::/nonexistent:/usr/sbin/nologin' >> /rootfs/etc/passwd && \
    echo 'appgroup:x:10001:' >> /rootfs/etc/group && \
    mkdir -p /rootfs/app && chown 10001:10001 /rootfs/app

# ============================================================================
# [STAGE H] - Jemalloc
# ============================================================================
FROM --platform=linux/amd64 ubuntu:24.04 AS jemalloc

RUN apt-get update && \
    apt-get install -y --no-install-recommends libjemalloc-dev && \
    apt-get autoremove -y && \
    apt-get purge -y --auto-remove && \
    rm -rf /var/lib/apt/lists/*

# ============================================================================
# [STAGE Z] - Runtime Image (Scratch + Chisel + Jemalloc)
# ============================================================================
FROM --platform=linux/amd64 scratch AS runtime

COPY --from=chisel-builder /rootfs /

COPY --from=jemalloc /usr/lib/x86_64-linux-gnu/libjemalloc.so.2 /usr/lib/x86_64-linux-gnu/libjemalloc.so.2

WORKDIR /app

COPY --from=builder --chown=10001:10001 /app/target/release/axum-kbve /app/axum-kbve

COPY --from=builder --chown=10001:10001 /app/apps/kbve/axum-kbve/templates/dist /app/templates/dist
COPY --from=builder --chown=10001:10001 /app/apps/kbve/axum-kbve/templates/askama /app/templates/askama

ENV LD_PRELOAD=/usr/lib/x86_64-linux-gnu/libjemalloc.so.2
ENV MALLOC_CONF="background_thread:true,dirty_decay_ms:10000,muzzy_decay_ms:10000,lg_tcache_max:32,oversize_threshold:4194304"
ENV HTTP_HOST=0.0.0.0
ENV HTTP_PORT=4321
ENV RUST_LOG=info

EXPOSE 4321

USER 10001:10001

ENTRYPOINT ["/app/axum-kbve"]
