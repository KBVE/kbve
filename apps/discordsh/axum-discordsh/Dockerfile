# Pre-built Rust build base image (override with --build-arg BUILD_BASE=...)
ARG BUILD_BASE=ghcr.io/kbve/discordsh-build-base:latest

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

# Copy astro-discordsh source
COPY apps/discordsh/astro-discordsh/ apps/discordsh/astro-discordsh/

# Build astro site
WORKDIR /app/apps/discordsh/astro-discordsh
RUN rm -rf .astro && npx astro sync && \
    UV_THREADPOOL_SIZE=4 NODE_OPTIONS="--max-old-space-size=4096" npx astro build

# ============================================================================
# [STAGE B] - Precompress Static Assets
# ============================================================================
FROM --platform=linux/amd64 ubuntu:24.04 AS astro-precompressor

RUN apt-get update && \
    apt-get install -y --no-install-recommends gzip brotli && \
    rm -rf /var/lib/apt/lists/*

COPY --from=astro-builder /app/dist/apps/astro-discordsh /static

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
# [STAGE C] - Build Application
#
# Uses pre-built base image with Rust toolchain + all external deps +
# foundation crates (kbve + jedi) already compiled in release mode.
# Only axum-discordsh needs recompilation here.
# ============================================================================
FROM ${BUILD_BASE} AS builder

# Astro build output (precompressed) → placed into templates/dist
COPY --from=astro-precompressor /static /app/apps/discordsh/axum-discordsh/templates/dist

# Foundation crate source (cargo needs source to verify fingerprints)
COPY packages/data/proto packages/data/proto
COPY packages/rust/jedi packages/rust/jedi
COPY packages/rust/kbve packages/rust/kbve

# Application source (most frequently changing — placed last for cache)
COPY apps/discordsh/axum-discordsh apps/discordsh/axum-discordsh

RUN --mount=type=cache,target=/usr/local/cargo/registry \
    --mount=type=cache,target=/usr/local/cargo/git \
    cargo build --release -p axum-discordsh && \
    strip target/release/axum-discordsh

# ============================================================================
# [STAGE D] - Chisel Ubuntu Base (Minimal Runtime)
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
# [STAGE E] - Jemalloc
# ============================================================================
FROM --platform=linux/amd64 ubuntu:24.04 AS jemalloc

RUN apt-get update && \
    apt-get install -y --no-install-recommends libjemalloc-dev && \
    apt-get autoremove -y && \
    apt-get purge -y --auto-remove && \
    rm -rf /var/lib/apt/lists/*

# ============================================================================
# [STAGE F] - libpq runtime (needed by diesel postgres)
# ============================================================================
FROM --platform=linux/amd64 ubuntu:24.04 AS libpq-runtime

RUN apt-get update && \
    apt-get install -y --no-install-recommends libpq5 && \
    rm -rf /var/lib/apt/lists/*

# ============================================================================
# [STAGE Z] - Runtime Image (Scratch + Chisel + Jemalloc)
# ============================================================================
FROM --platform=linux/amd64 scratch AS runtime

COPY --from=chisel-builder /rootfs /

COPY --from=jemalloc /usr/lib/x86_64-linux-gnu/libjemalloc.so.2 /usr/lib/x86_64-linux-gnu/libjemalloc.so.2

COPY --from=libpq-runtime /usr/lib/x86_64-linux-gnu/libpq.so.5* /usr/lib/x86_64-linux-gnu/

WORKDIR /app

COPY --from=builder /app/target/release/axum-discordsh /app/axum-discordsh

COPY --from=builder /app/apps/discordsh/axum-discordsh/templates/dist /app/templates/dist
COPY --from=builder /app/apps/discordsh/axum-discordsh/templates/askama /app/templates/askama

# Game card fonts (SVG → PNG rendering via resvg)
COPY apps/discordsh/axum-discordsh/alagard.ttf /app/alagard.ttf
COPY apps/discordsh/axum-discordsh/NotoSansSymbols-Regular.ttf /app/NotoSansSymbols-Regular.ttf

ENV LD_PRELOAD=/usr/lib/x86_64-linux-gnu/libjemalloc.so.2
ENV MALLOC_CONF="background_thread:true,dirty_decay_ms:10000,muzzy_decay_ms:10000,lg_tcache_max:32,oversize_threshold:4194304"
ENV HTTP_HOST=0.0.0.0
ENV HTTP_PORT=4321
ENV RUST_LOG=info
ENV FONT_PATH=/app/alagard.ttf
ENV SYMBOL_FONT_PATH=/app/NotoSansSymbols-Regular.ttf

EXPOSE 4321

ENTRYPOINT ["/app/axum-discordsh"]
