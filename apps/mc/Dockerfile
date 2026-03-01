# ============================================================================
# [STAGE A] - Build Astro Static Site
# ============================================================================
FROM node:24-alpine AS astro-builder

RUN corepack enable && corepack prepare pnpm@latest --activate

WORKDIR /app

# Copy root dependency and config files (layer-cached separately from source)
COPY package.json pnpm-lock.yaml .npmrc tsconfig.base.json ./

# Install all dependencies (hoisted mode - all go to root node_modules)
RUN pnpm install --frozen-lockfile

# Copy workspace package sources (TypeScript path aliases resolve to these)
COPY packages/npm/astro/ packages/npm/astro/
COPY packages/npm/droid/ packages/npm/droid/

# Copy astro-mc source
COPY apps/mc/astro-mc/ apps/mc/astro-mc/

# Build astro site
WORKDIR /app/apps/mc/astro-mc
RUN rm -rf .astro && npx astro sync && \
    UV_THREADPOOL_SIZE=4 NODE_OPTIONS="--max-old-space-size=4096" npx astro build

# ============================================================================
# [STAGE B] - Precompress Static Assets
# ============================================================================
FROM ubuntu:24.04 AS astro-precompressor

RUN apt-get update && \
    apt-get install -y --no-install-recommends gzip brotli && \
    rm -rf /var/lib/apt/lists/*

COPY --from=astro-builder /app/dist/apps/astro-mc /static

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
# Rust build stages — use pre-built base image (foundation + core cached)
# ============================================================================
ARG BASE_IMAGE=ghcr.io/kbve/mc-rust-base:latest
FROM ${BASE_IMAGE} AS core

# --- Pumpkin: build server (parallel with plugin) ---
FROM core AS builder
COPY ./apps/mc/pumpkin/pumpkin /pumpkin/pumpkin
RUN --mount=type=cache,target=/usr/local/cargo/git/db \
    --mount=type=cache,target=/usr/local/cargo/registry/ \
    cargo build --release && cp target/release/pumpkin ./pumpkin.release

# --- Plugin: build (parallel with pumpkin, reuses all pre-compiled crates) ---
FROM core AS plugin-builder
COPY ./apps/mc/pumpkin/pumpkin /pumpkin/pumpkin
COPY ./apps/mc/plugins /plugins
# Inject Astro-built players page as Askama template (compiled into the .so)
COPY --from=astro-builder /app/dist/apps/astro-mc/players/index.html /plugins/kbve-mc-plugin/templates/askama/players.html
ENV CARGO_TARGET_DIR=/pumpkin/target
RUN --mount=type=cache,target=/usr/local/cargo/git/db \
    --mount=type=cache,target=/usr/local/cargo/registry/ \
    cargo build --release --manifest-path /plugins/kbve-mc-plugin/Cargo.toml \
    && mkdir -p /built-plugins \
    && cp /pumpkin/target/release/libkbve_mc_plugin.so /built-plugins/ 2>/dev/null \
    || cp /pumpkin/target/release/libkbve_mc_plugin.dylib /built-plugins/ 2>/dev/null \
    || true

# --- Resource pack ---
FROM alpine:3.23 AS pack-builder
RUN apk add --no-cache zip coreutils
COPY ./apps/mc/data/resource-pack /resource-pack
RUN cd /resource-pack && zip -r /kbve-resource-pack.zip . -x '.*' -x '__MACOSX/*'
RUN SHA1=$(sha1sum /kbve-resource-pack.zip | awk '{print $1}') && \
    printf '[resource_pack]\nenabled = true\nurl = "http://localhost:8080/kbve-resource-pack.zip"\nsha1 = "%s"\nforce = true\nprompt_message = "KBVE Resource Pack - Custom items and textures"\n\n[world]\nlighting = "default"\nautosave_ticks = 6000\n\n[world.chunk]\ntype = "anvil"\nwrite_in_place = false\n\n[world.chunk.compression]\nalgorithm = "LZ4"\nlevel = 6\n\n[networking.rcon]\nenabled = true\naddress = "0.0.0.0:25575"\npassword = "kbve-rcon"\nmax_connections = 5\n' "$SHA1" > /features.toml

# --- Final image ---
FROM alpine:3.23

COPY --from=builder /pumpkin/pumpkin.release /bin/pumpkin
COPY --from=plugin-builder /built-plugins/ /pumpkin/plugins/

WORKDIR /pumpkin

# Bake in custom server config and icon
COPY ./apps/mc/data/config/configuration.toml /pumpkin/config/configuration.toml
COPY ./apps/mc/data/server_icon.png /pumpkin/server_icon.png

# Resource pack: zip served by axum, config for Pumpkin
COPY --from=pack-builder /kbve-resource-pack.zip /pumpkin/resource-pack.zip
COPY --from=pack-builder /features.toml /pumpkin/config/features.toml

# Static Astro site: served by plugin's axum server
COPY --from=astro-precompressor /static /pumpkin/web

# Entrypoint: templates RESOURCE_PACK_URL env var into features.toml at startup
COPY ./apps/mc/entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

RUN apk add --no-cache libgcc && chown -R 2613:2613 .

ENV RUST_BACKTRACE=1
EXPOSE 25565 8080 25575
USER 2613:2613
ENTRYPOINT ["/entrypoint.sh"]
HEALTHCHECK CMD nc -z 127.0.0.1 25565 || exit 1
