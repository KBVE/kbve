# ============================================================================
# [STAGE A] - Build Astro Static Site
# ============================================================================
FROM --platform=linux/amd64 node:24-alpine AS astro-builder

RUN corepack enable && corepack prepare pnpm@latest --activate

WORKDIR /app

# Copy root dependency and config files (layer-cached separately from source)
COPY package.json pnpm-lock.yaml .npmrc tsconfig.base.json ./

# Install all dependencies (hoisted mode - all go to root node_modules)
RUN pnpm install --frozen-lockfile

# Copy workspace package sources (TypeScript path aliases resolve to these)
COPY packages/npm/astro/ packages/npm/astro/
COPY packages/npm/droid/ packages/npm/droid/

# Copy astro-kbve source
COPY apps/kbve/astro-kbve/ apps/kbve/astro-kbve/

# Build astro site
WORKDIR /app/apps/kbve/astro-kbve
RUN rm -rf .astro && npx astro sync && \
    UV_THREADPOOL_SIZE=4 NODE_OPTIONS="--max-old-space-size=8192" npx astro build

# ============================================================================
# [STAGE B] - Precompress Static Assets
# ============================================================================
FROM --platform=linux/amd64 ubuntu:24.04 AS astro-precompressor

RUN apt-get update && \
    apt-get install -y --no-install-recommends gzip brotli && \
    rm -rf /var/lib/apt/lists/*

COPY --from=astro-builder /app/dist/apps/astro-kbve /static

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
# [STAGE C] - Rust Base Image
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
# [STAGE D] - Cargo Chef Planner
# ============================================================================
FROM rust-base AS planner

# Minimal workspace with only axum-kbve's actual dependencies
COPY apps/kbve/axum-kbve/Cargo.workspace.toml Cargo.toml
COPY Cargo.lock ./

# Copy only the 3 crates we need
COPY apps/kbve/axum-kbve/Cargo.toml apps/kbve/axum-kbve/Cargo.toml
COPY packages/rust/jedi/Cargo.toml packages/rust/jedi/Cargo.toml
COPY packages/rust/kbve/Cargo.toml packages/rust/kbve/Cargo.toml

# Create stubs for cargo chef
RUN mkdir -p apps/kbve/axum-kbve/src && echo "fn main() {}" > apps/kbve/axum-kbve/src/main.rs && \
    mkdir -p packages/rust/jedi/src && echo "" > packages/rust/jedi/src/lib.rs && \
    mkdir -p packages/rust/kbve/src && echo "" > packages/rust/kbve/src/lib.rs

# Copy proto files (needed for axum-kbve build.rs and jedi build.rs)
COPY packages/data/proto packages/data/proto

RUN cargo chef prepare --recipe-path recipe.json

# ============================================================================
# [STAGE E] - Cargo Chef Builder (Cache Dependencies)
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
    cargo chef cook --release --recipe-path recipe.json -p axum-kbve

# ============================================================================
# [STAGE F] - Build Application
# ============================================================================
FROM rust-base AS builder

# Copy cached dependencies
COPY --from=builder-deps /app/target target
COPY --from=builder-deps /usr/local/cargo /usr/local/cargo

# Copy Astro build output (precompressed)
COPY --from=astro-precompressor /static /app/apps/kbve/axum-kbve/templates/dist

# Use the same minimal workspace
COPY --from=planner /app/Cargo.toml ./
COPY Cargo.lock ./

# Copy only the 3 crates (full source)
COPY packages/rust/jedi packages/rust/jedi
COPY packages/rust/kbve packages/rust/kbve
COPY apps/kbve/axum-kbve apps/kbve/axum-kbve
COPY packages/data/proto packages/data/proto

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
        openssl_config

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

COPY --from=builder /app/target/release/axum-kbve /app/axum-kbve

COPY --from=builder /app/apps/kbve/axum-kbve/templates/dist /app/templates/dist
COPY --from=builder /app/apps/kbve/axum-kbve/templates/askama /app/templates/askama

ENV LD_PRELOAD=/usr/lib/x86_64-linux-gnu/libjemalloc.so.2
ENV MALLOC_CONF="background_thread:true,dirty_decay_ms:10000,muzzy_decay_ms:10000,lg_tcache_max:32,oversize_threshold:4194304"
ENV HTTP_HOST=0.0.0.0
ENV HTTP_PORT=4321
ENV RUST_LOG=info

EXPOSE 4321

ENTRYPOINT ["/app/axum-kbve"]
