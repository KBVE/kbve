# ============================================================================
# axum-kbve — Multi-stage Docker build
#
# Uses shared chisel base images:
#   ghcr.io/kbve/chisel-ubuntu-axum:24.04-builder  (Rust + Node + pnpm + cargo-chef)
#   ghcr.io/kbve/chisel-ubuntu-axum:24.04.3          (chiseled Ubuntu + jemalloc + libpq)
# ============================================================================

# ============================================================================
# [STAGE A] - Build Astro Static Site
# ============================================================================
FROM --platform=linux/amd64 ghcr.io/kbve/chisel-ubuntu-axum:24.04-builder AS astro-builder

WORKDIR /app

# Copy root dependency and config files (layer-cached separately from source)
COPY package.json pnpm-lock.yaml .npmrc tsconfig.base.json ./

# Install all dependencies (hoisted mode - all go to root node_modules)
# Cache pnpm content-addressable store across builds to skip re-downloading
RUN --mount=type=cache,target=/root/.local/share/pnpm/store/v3,id=pnpm-store \
    pnpm install --frozen-lockfile

# Copy workspace package sources (TypeScript path aliases resolve to these)
COPY packages/npm/astro/ packages/npm/astro/
COPY packages/npm/droid/ packages/npm/droid/
COPY packages/npm/laser/ packages/npm/laser/

# Copy generated schemas used by astro-kbve content collections
COPY packages/data/codegen/generated/ packages/data/codegen/generated/

# Copy astro-kbve source
COPY apps/kbve/astro-kbve/ apps/kbve/astro-kbve/

# Build astro site (cache .astro dir for incremental content collection builds)
# NOTE: Mount cache to a staging path, then copy in/out. Mounting directly on
# .astro/ causes EBUSY when Astro tries to rmdir the mount point after build.
WORKDIR /app/apps/kbve/astro-kbve
RUN --mount=type=cache,target=/tmp/astro-cache,id=astro-cache \
    cp -a /tmp/astro-cache/. .astro/ 2>/dev/null || true && \
    npx astro sync && \
    UV_THREADPOOL_SIZE=4 NODE_OPTIONS="--max-old-space-size=8192" npx astro build && \
    cp -a .astro/. /tmp/astro-cache/ 2>/dev/null || true

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
# Rust build stages — cargo-chef separates dependency compilation from source.
# BuildKit layer cache handles incremental rebuilds across runs.
# ============================================================================

# [STAGE C] - Cargo Chef Planner
FROM --platform=linux/amd64 ghcr.io/kbve/chisel-ubuntu-axum:24.04-builder AS planner

COPY apps/kbve/axum-kbve/Cargo.workspace.toml Cargo.toml
COPY Cargo.lock ./

COPY apps/kbve/axum-kbve/Cargo.toml apps/kbve/axum-kbve/Cargo.toml
COPY packages/rust/jedi/Cargo.toml packages/rust/jedi/Cargo.toml
COPY packages/rust/kbve/Cargo.toml packages/rust/kbve/Cargo.toml
COPY packages/rust/bevy/bevy_kbve_net/Cargo.toml packages/rust/bevy/bevy_kbve_net/Cargo.toml
COPY packages/rust/bevy/bevy_npc/Cargo.toml packages/rust/bevy/bevy_npc/Cargo.toml

COPY packages/data/proto packages/data/proto

RUN mkdir -p apps/kbve/axum-kbve/src && echo "fn main() {}" > apps/kbve/axum-kbve/src/main.rs && \
    mkdir -p packages/rust/jedi/src && echo "" > packages/rust/jedi/src/lib.rs && \
    mkdir -p packages/rust/kbve/src && echo "" > packages/rust/kbve/src/lib.rs && \
    mkdir -p packages/rust/bevy/bevy_kbve_net/src && echo "" > packages/rust/bevy/bevy_kbve_net/src/lib.rs && \
    mkdir -p packages/rust/bevy/bevy_npc/src && echo "" > packages/rust/bevy/bevy_npc/src/lib.rs

RUN cargo chef prepare --recipe-path recipe.json

# [STAGE D] - Cargo Chef Cook (Cache External Dependencies)
FROM --platform=linux/amd64 ghcr.io/kbve/chisel-ubuntu-axum:24.04-builder AS builder-deps

COPY --from=planner /app/recipe.json recipe.json
COPY --from=planner /app/Cargo.toml /app/Cargo.lock ./
COPY --from=planner /app/apps apps
COPY --from=planner /app/packages packages

RUN --mount=type=cache,target=/usr/local/cargo/registry \
    --mount=type=cache,target=/usr/local/cargo/git \
    --mount=type=cache,target=/usr/local/sccache,id=sccache \
    cargo chef cook --release --recipe-path recipe.json -p axum-kbve

# [STAGE E] - Foundation Layer (Compile kbve + jedi from real source)
FROM --platform=linux/amd64 ghcr.io/kbve/chisel-ubuntu-axum:24.04-builder AS foundation

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
COPY packages/rust/bevy/bevy_kbve_net packages/rust/bevy/bevy_kbve_net
COPY packages/rust/bevy/bevy_npc packages/rust/bevy/bevy_npc

RUN --mount=type=cache,target=/usr/local/cargo/registry \
    --mount=type=cache,target=/usr/local/cargo/git \
    --mount=type=cache,target=/usr/local/sccache,id=sccache \
    cargo build --release -p kbve -p jedi -p bevy_kbve_net -p bevy_npc

# ============================================================================
# [STAGE F] - Build Application
# ============================================================================
FROM foundation AS builder

# Astro build output (precompressed) -> placed into templates/dist
COPY --from=astro-precompressor /static /app/apps/kbve/axum-kbve/templates/dist

# Foundation crate source (cargo needs source to verify fingerprints)
COPY packages/data/proto packages/data/proto
COPY packages/rust/jedi packages/rust/jedi
COPY packages/rust/kbve packages/rust/kbve
COPY packages/rust/bevy/bevy_kbve_net packages/rust/bevy/bevy_kbve_net
COPY packages/rust/bevy/bevy_npc packages/rust/bevy/bevy_npc

# Application source (most frequently changing — placed last for cache)
COPY apps/kbve/axum-kbve apps/kbve/axum-kbve

# Copy Askama templates, then overwrite with Astro-generated Starlight versions
COPY apps/kbve/axum-kbve/templates/askama /app/apps/kbve/axum-kbve/templates/askama
RUN cp -a /app/apps/kbve/axum-kbve/templates/dist/askama/. /app/apps/kbve/axum-kbve/templates/askama/

RUN --mount=type=cache,target=/usr/local/cargo/registry \
    --mount=type=cache,target=/usr/local/cargo/git \
    --mount=type=cache,target=/usr/local/sccache,id=sccache \
    cargo build --release -p axum-kbve && \
    strip target/release/axum-kbve

# ============================================================================
# [STAGE Z] - Runtime Image (shared chisel base)
# ============================================================================
FROM --platform=linux/amd64 ghcr.io/kbve/chisel-ubuntu-axum:24.04.3 AS runtime

COPY --from=builder --chown=10001:10001 /app/target/release/axum-kbve /app/axum-kbve

COPY --from=builder --chown=10001:10001 /app/apps/kbve/axum-kbve/templates/dist /app/templates/dist
COPY --from=builder --chown=10001:10001 /app/apps/kbve/axum-kbve/templates/askama /app/templates/askama

ENV HTTP_HOST=0.0.0.0
ENV HTTP_PORT=4321
ENV RUST_LOG=info

EXPOSE 4321
EXPOSE 5000

ENTRYPOINT ["/app/axum-kbve"]
