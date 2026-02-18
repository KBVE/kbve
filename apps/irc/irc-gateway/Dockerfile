# ============================================================================
# [STAGE A] - Precompress Static Assets (built by container-prep on host)
# ============================================================================
FROM --platform=linux/amd64 ubuntu:24.04 AS astro-precompressor

RUN apt-get update && \
    apt-get install -y --no-install-recommends gzip brotli && \
    rm -rf /var/lib/apt/lists/*

COPY apps/irc/irc-gateway/dist /static

WORKDIR /static
RUN find . -type f \( \
        -name "*.css" -o \
        -name "*.js" -o \
        -name "*.json" -o \
        -name "*.svg" -o \
        -name "*.xml" -o \
        -name "*.txt" -o \
        -name "*.html" \
    \) -exec sh -c ' \
        gzip -9 -k "$1" && \
        brotli --best --keep "$1" \
    ' _ {} \; && \
    echo "Precompression complete (brotli-11 + gzip-9)"

# ============================================================================
# [STAGE B] - Rust Base Image
# ============================================================================
FROM --platform=linux/amd64 rust:1.90-slim AS rust-base

RUN apt-get update && \
    apt-get install -y --no-install-recommends \
        pkg-config \
        libssl-dev \
        protobuf-compiler \
        libprotobuf-dev && \
    rm -rf /var/lib/apt/lists/*

RUN rustup target add x86_64-unknown-linux-gnu && \
    cargo install cargo-chef --locked

WORKDIR /app

# ============================================================================
# [STAGE C] - Cargo Chef Planner
# ============================================================================
FROM rust-base AS planner

# Minimal workspace with only irc-gateway's actual dependencies
COPY apps/irc/irc-gateway/Cargo.workspace.toml Cargo.toml
COPY Cargo.lock ./

# Copy only the 3 crates we need
COPY apps/irc/irc-gateway/Cargo.toml apps/irc/irc-gateway/Cargo.toml
COPY packages/rust/jedi/Cargo.toml packages/rust/jedi/Cargo.toml
COPY packages/rust/kbve/Cargo.toml packages/rust/kbve/Cargo.toml

# Create stubs for cargo chef
RUN mkdir -p apps/irc/irc-gateway/src && echo "fn main() {}" > apps/irc/irc-gateway/src/main.rs && \
    mkdir -p packages/rust/jedi/src && echo "" > packages/rust/jedi/src/lib.rs && \
    mkdir -p packages/rust/kbve/src && echo "" > packages/rust/kbve/src/lib.rs

# Copy proto files (needed for jedi build.rs)
COPY packages/data/proto packages/data/proto

RUN cargo chef prepare --recipe-path recipe.json

# ============================================================================
# [STAGE D] - Cargo Chef Builder (Cache Dependencies)
# ============================================================================
FROM rust-base AS builder-deps

COPY --from=planner /app/recipe.json recipe.json
COPY --from=planner /app/Cargo.toml /app/Cargo.lock ./
COPY --from=planner /app/apps apps
COPY --from=planner /app/packages packages

# Copy proto files
COPY packages/data/proto packages/data/proto

RUN --mount=type=cache,target=/usr/local/cargo/registry \
    --mount=type=cache,target=/usr/local/cargo/git \
    cargo chef cook --release --recipe-path recipe.json -p irc-gateway

# ============================================================================
# [STAGE E] - Build Application
# ============================================================================
FROM rust-base AS builder

# Copy cached dependencies
COPY --from=builder-deps /app/target target
COPY --from=builder-deps /usr/local/cargo /usr/local/cargo

# Copy Astro build output (precompressed)
COPY --from=astro-precompressor /static /app/apps/irc/irc-gateway/templates/dist

# Use the same minimal workspace
COPY --from=planner /app/Cargo.toml ./
COPY Cargo.lock ./

# Copy only the 3 crates (full source)
COPY packages/rust/jedi packages/rust/jedi
COPY packages/rust/kbve packages/rust/kbve
COPY apps/irc/irc-gateway apps/irc/irc-gateway
COPY packages/data/proto packages/data/proto

RUN --mount=type=cache,target=/usr/local/cargo/registry \
    --mount=type=cache,target=/usr/local/cargo/git \
    cargo build --release -p irc-gateway && \
    strip target/release/irc-gateway

# ============================================================================
# [STAGE F] - Chisel Ubuntu Base (Minimal Runtime)
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
        openssl_config

# ============================================================================
# [STAGE G] - Jemalloc
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

COPY --from=builder /app/target/release/irc-gateway /app/irc-gateway

COPY --from=builder /app/apps/irc/irc-gateway/templates/dist /app/templates/dist

ENV LD_PRELOAD=/usr/lib/x86_64-linux-gnu/libjemalloc.so.2
ENV MALLOC_CONF="background_thread:true,dirty_decay_ms:10000,muzzy_decay_ms:10000,lg_tcache_max:32,oversize_threshold:4194304"
ENV HTTP_HOST=0.0.0.0
ENV HTTP_PORT=4321
ENV IRC_PROXY_PORT=6667
ENV ERGO_WS_URL=ws://ergo-irc-service.irc.svc.cluster.local:8080
ENV ERGO_IRC_HOST=ergo-irc-service.irc.svc.cluster.local
ENV ERGO_IRC_PORT=6667
ENV RUST_LOG=info

EXPOSE 4321
EXPOSE 6667

ENTRYPOINT ["/app/irc-gateway"]
