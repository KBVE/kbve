# ============================================================================
# [STAGE A] - Build Astro and Precompress Static Assets
# ============================================================================
FROM --platform=linux/amd64 node:24-alpine AS astro-builder

RUN corepack enable && corepack prepare pnpm@latest --activate

WORKDIR /app

# Copy root package config for workspace resolution
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./

# Copy herbmail astro app
COPY apps/herbmail/astro-herbmail ./apps/herbmail/astro-herbmail

# Install dependencies
RUN pnpm install --frozen-lockfile --filter astro-herbmail...

# Build Astro site
WORKDIR /app/apps/herbmail/astro-herbmail
ENV NODE_OPTIONS="--max-old-space-size=4096"
RUN pnpm exec astro build

# Precompress static assets with brotli-11 + gzip-9 (keep originals)
WORKDIR /app/dist/apps/astro-herbmail
RUN apk add --no-cache gzip brotli && \
    find . -type f \( \
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

# Copy workspace root Cargo.toml
COPY Cargo.toml Cargo.lock ./

# Copy workspace members needed for dependency resolution
COPY apps/herbmail/axum-herbmail/Cargo.toml apps/herbmail/axum-herbmail/Cargo.toml
COPY packages/rust/jedi/Cargo.toml packages/rust/jedi/Cargo.toml
COPY packages/rust/kbve/Cargo.toml packages/rust/kbve/Cargo.toml

# Stub out other workspace members so cargo can resolve
COPY packages/rust/erust/Cargo.toml packages/rust/erust/Cargo.toml
COPY packages/rust/holy/Cargo.toml packages/rust/holy/Cargo.toml
COPY packages/rust/q/Cargo.toml packages/rust/q/Cargo.toml
COPY packages/rust/soul/Cargo.toml packages/rust/soul/Cargo.toml
COPY apps/kbve/kilobase/Cargo.toml apps/kbve/kilobase/Cargo.toml
COPY apps/kbve/kbve-hyperlane/Cargo.toml apps/kbve/kbve-hyperlane/Cargo.toml
COPY apps/kbve/rust_kanban/Cargo.toml apps/kbve/rust_kanban/Cargo.toml
COPY apps/kbve/rust_api_profile/Cargo.toml apps/kbve/rust_api_profile/Cargo.toml
COPY apps/rareicon/rust_rareicon_gameserver/Cargo.toml apps/rareicon/rust_rareicon_gameserver/Cargo.toml
COPY apps/rentearth/rust_godot_towerdefense/Cargo.toml apps/rentearth/rust_godot_towerdefense/Cargo.toml
COPY apps/discord/disoxide/Cargo.toml apps/discord/disoxide/Cargo.toml

# Create stub lib.rs/main.rs for each member so cargo chef can plan
RUN mkdir -p apps/herbmail/axum-herbmail/src && echo "fn main() {}" > apps/herbmail/axum-herbmail/src/main.rs && \
    mkdir -p packages/rust/jedi/src && echo "" > packages/rust/jedi/src/lib.rs && \
    mkdir -p packages/rust/kbve/src && echo "" > packages/rust/kbve/src/lib.rs && \
    mkdir -p packages/rust/erust/src && echo "" > packages/rust/erust/src/lib.rs && \
    mkdir -p packages/rust/holy/src && echo "" > packages/rust/holy/src/lib.rs && \
    mkdir -p packages/rust/q/src && echo "" > packages/rust/q/src/lib.rs && \
    mkdir -p packages/rust/soul/src && echo "" > packages/rust/soul/src/lib.rs && \
    mkdir -p apps/kbve/kilobase/src && echo "fn main() {}" > apps/kbve/kilobase/src/main.rs && \
    mkdir -p apps/kbve/kbve-hyperlane/src && echo "fn main() {}" > apps/kbve/kbve-hyperlane/src/main.rs && \
    mkdir -p apps/kbve/rust_kanban/src && echo "fn main() {}" > apps/kbve/rust_kanban/src/main.rs && \
    mkdir -p apps/kbve/rust_api_profile/src && echo "fn main() {}" > apps/kbve/rust_api_profile/src/main.rs && \
    mkdir -p apps/rareicon/rust_rareicon_gameserver/src && echo "fn main() {}" > apps/rareicon/rust_rareicon_gameserver/src/main.rs && \
    mkdir -p apps/rentearth/rust_godot_towerdefense/src && echo "fn main() {}" > apps/rentearth/rust_godot_towerdefense/src/main.rs && \
    mkdir -p apps/discord/disoxide/src && echo "fn main() {}" > apps/discord/disoxide/src/main.rs

# Copy proto files (needed for jedi build.rs)
COPY packages/data/proto packages/data/proto

RUN cargo chef prepare --recipe-path recipe.json

# ============================================================================
# [STAGE D] - Cargo Chef Builder (Cache Dependencies)
# ============================================================================
FROM rust-base AS builder-deps

COPY --from=planner /app/recipe.json recipe.json

# Copy workspace structure for dependency resolution
COPY --from=planner /app/Cargo.toml /app/Cargo.lock ./
COPY --from=planner /app/apps apps
COPY --from=planner /app/packages packages

# Copy proto files
COPY packages/data/proto packages/data/proto

RUN --mount=type=cache,target=/usr/local/cargo/registry \
    --mount=type=cache,target=/usr/local/cargo/git \
    cargo chef cook --release --recipe-path recipe.json -p axum-herbmail

# ============================================================================
# [STAGE E] - Build Application
# ============================================================================
FROM rust-base AS builder

# Copy cached dependencies
COPY --from=builder-deps /app/target target
COPY --from=builder-deps /usr/local/cargo /usr/local/cargo

# Copy Astro build output (precompressed)
COPY --from=astro-builder /app/dist/apps/astro-herbmail /app/apps/herbmail/axum-herbmail/templates/dist

# Copy full workspace source
COPY Cargo.toml Cargo.lock ./
COPY packages/rust/jedi packages/rust/jedi
COPY packages/rust/kbve packages/rust/kbve
COPY packages/rust/erust/Cargo.toml packages/rust/erust/Cargo.toml
COPY packages/rust/holy/Cargo.toml packages/rust/holy/Cargo.toml
COPY packages/rust/q/Cargo.toml packages/rust/q/Cargo.toml
COPY packages/rust/soul/Cargo.toml packages/rust/soul/Cargo.toml
COPY apps/herbmail/axum-herbmail apps/herbmail/axum-herbmail
COPY apps/kbve/kilobase/Cargo.toml apps/kbve/kilobase/Cargo.toml
COPY apps/kbve/kbve-hyperlane/Cargo.toml apps/kbve/kbve-hyperlane/Cargo.toml
COPY apps/kbve/rust_kanban/Cargo.toml apps/kbve/rust_kanban/Cargo.toml
COPY apps/kbve/rust_api_profile/Cargo.toml apps/kbve/rust_api_profile/Cargo.toml
COPY apps/rareicon/rust_rareicon_gameserver/Cargo.toml apps/rareicon/rust_rareicon_gameserver/Cargo.toml
COPY apps/rentearth/rust_godot_towerdefense/Cargo.toml apps/rentearth/rust_godot_towerdefense/Cargo.toml
COPY apps/discord/disoxide/Cargo.toml apps/discord/disoxide/Cargo.toml
COPY packages/data/proto packages/data/proto

# Stub out workspace members we don't need source for
RUN mkdir -p packages/rust/erust/src && echo "" > packages/rust/erust/src/lib.rs && \
    mkdir -p packages/rust/holy/src && echo "" > packages/rust/holy/src/lib.rs && \
    mkdir -p packages/rust/q/src && echo "" > packages/rust/q/src/lib.rs && \
    mkdir -p packages/rust/soul/src && echo "" > packages/rust/soul/src/lib.rs && \
    mkdir -p apps/kbve/kilobase/src && echo "fn main() {}" > apps/kbve/kilobase/src/main.rs && \
    mkdir -p apps/kbve/kbve-hyperlane/src && echo "fn main() {}" > apps/kbve/kbve-hyperlane/src/main.rs && \
    mkdir -p apps/kbve/rust_kanban/src && echo "fn main() {}" > apps/kbve/rust_kanban/src/main.rs && \
    mkdir -p apps/kbve/rust_api_profile/src && echo "fn main() {}" > apps/kbve/rust_api_profile/src/main.rs && \
    mkdir -p apps/rareicon/rust_rareicon_gameserver/src && echo "fn main() {}" > apps/rareicon/rust_rareicon_gameserver/src/main.rs && \
    mkdir -p apps/rentearth/rust_godot_towerdefense/src && echo "fn main() {}" > apps/rentearth/rust_godot_towerdefense/src/main.rs && \
    mkdir -p apps/discord/disoxide/src && echo "fn main() {}" > apps/discord/disoxide/src/main.rs

# Copy Askama templates
COPY apps/herbmail/axum-herbmail/templates/askama /app/apps/herbmail/axum-herbmail/templates/askama

RUN --mount=type=cache,target=/usr/local/cargo/registry \
    --mount=type=cache,target=/usr/local/cargo/git \
    cargo build --release -p axum-herbmail && \
    strip target/release/axum-herbmail

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

COPY --from=builder /app/target/release/axum-herbmail /app/axum-herbmail

COPY --from=builder /app/apps/herbmail/axum-herbmail/templates/dist /app/templates/dist
COPY --from=builder /app/apps/herbmail/axum-herbmail/templates/askama /app/templates/askama

ENV LD_PRELOAD=/usr/lib/x86_64-linux-gnu/libjemalloc.so.2
ENV MALLOC_CONF="background_thread:true,dirty_decay_ms:10000,muzzy_decay_ms:10000,lg_tcache_max:32,oversize_threshold:4194304"
ENV HTTP_HOST=0.0.0.0
ENV HTTP_PORT=4321
ENV RUST_LOG=info

EXPOSE 4321

ENTRYPOINT ["/app/axum-herbmail"]
