# ============================================================================
# [STAGE A] - Build Astro Static Site
# ============================================================================
FROM --platform=linux/amd64 node:24-slim AS astro-builder

RUN corepack enable && corepack prepare pnpm@latest --activate

ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1

WORKDIR /app

COPY package.json pnpm-lock.yaml .npmrc tsconfig.base.json ./

RUN --mount=type=cache,target=/root/.local/share/pnpm/store/v3,id=pnpm-store \
    pnpm install --frozen-lockfile

COPY packages/npm/astro/ packages/npm/astro/
COPY packages/npm/droid/ packages/npm/droid/
COPY packages/npm/laser/ packages/npm/laser/

COPY packages/data/codegen/generated/ packages/data/codegen/generated/

COPY apps/chuckrpg/astro-chuckrpg/ apps/chuckrpg/astro-chuckrpg/

WORKDIR /app/apps/chuckrpg/astro-chuckrpg
RUN --mount=type=cache,target=/tmp/astro-cache,id=astro-chuckrpg-cache \
    cp -a /tmp/astro-cache/. .astro/ 2>/dev/null || true && \
    npx astro sync && \
    npx astro build && \
    cp -a .astro/. /tmp/astro-cache/ 2>/dev/null || true

# ============================================================================
# [STAGE B] - Precompress Static Assets
# ============================================================================
FROM --platform=linux/amd64 ubuntu:24.04 AS astro-precompressor

RUN apt-get update && \
    apt-get install -y --no-install-recommends gzip brotli && \
    rm -rf /var/lib/apt/lists/*

COPY --from=astro-builder /app/dist/apps/astro-chuckrpg /static

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
    ' _ {} \;

# ============================================================================
# [STAGE C] - Rust Base Image
# ============================================================================
FROM --platform=linux/amd64 rust:1.94-slim AS rust-base

RUN apt-get update && \
    apt-get install -y --no-install-recommends \
        pkg-config \
        libssl-dev \
        mold && \
    rm -rf /var/lib/apt/lists/*

RUN rustup target add x86_64-unknown-linux-gnu && \
    cargo install cargo-chef --locked

WORKDIR /app

# [STAGE D] - Cargo Chef Planner
FROM rust-base AS planner

COPY apps/chuckrpg/axum-chuckrpg/Cargo.toml apps/chuckrpg/axum-chuckrpg/Cargo.toml
RUN mkdir -p apps/chuckrpg/axum-chuckrpg/src && \
    echo "fn main() {}" > apps/chuckrpg/axum-chuckrpg/src/main.rs

# Create workspace Cargo.toml
RUN printf '[workspace]\nmembers = ["apps/chuckrpg/axum-chuckrpg"]\nresolver = "2"\n' > Cargo.toml

RUN cargo chef prepare --recipe-path recipe.json

# [STAGE E] - Cargo Chef Cook (Cache Dependencies)
FROM rust-base AS builder-deps

COPY --from=planner /app/recipe.json recipe.json
COPY --from=planner /app/Cargo.toml ./
COPY --from=planner /app/apps apps

RUN --mount=type=cache,target=/usr/local/cargo/registry \
    --mount=type=cache,target=/usr/local/cargo/git \
    cargo chef cook --release --recipe-path recipe.json -p axum-chuckrpg

# ============================================================================
# [STAGE F] - Build Application
# ============================================================================
FROM rust-base AS builder

COPY --from=builder-deps /app/target target
COPY --from=builder-deps /usr/local/cargo /usr/local/cargo

# Workspace Cargo.toml
RUN printf '[workspace]\nmembers = ["apps/chuckrpg/axum-chuckrpg"]\nresolver = "2"\n' > Cargo.toml

ENV RUSTFLAGS="-C link-arg=-fuse-ld=mold"

COPY --from=astro-precompressor /static /app/apps/chuckrpg/axum-chuckrpg/templates/dist

COPY apps/chuckrpg/axum-chuckrpg apps/chuckrpg/axum-chuckrpg

RUN --mount=type=cache,target=/usr/local/cargo/registry \
    --mount=type=cache,target=/usr/local/cargo/git \
    cargo build --release -p axum-chuckrpg && \
    strip target/release/axum-chuckrpg

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
# [STAGE Z] - Runtime Image
# ============================================================================
FROM --platform=linux/amd64 scratch AS runtime

COPY --from=chisel-builder /rootfs /

WORKDIR /app

COPY --from=builder --chown=10001:10001 /app/target/release/axum-chuckrpg /app/axum-chuckrpg
COPY --from=builder --chown=10001:10001 /app/apps/chuckrpg/axum-chuckrpg/templates/dist /app/templates/dist

ENV HTTP_HOST=0.0.0.0
ENV HTTP_PORT=4322
ENV RUST_LOG=info

EXPOSE 4322

USER 10001:10001

ENTRYPOINT ["/app/axum-chuckrpg"]
