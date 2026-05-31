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
COPY packages/npm/devops/ packages/npm/devops/
COPY packages/npm/droid/ packages/npm/droid/
COPY packages/npm/laser/ packages/npm/laser/

# Copy generated schemas used by astro-kbve content collections
COPY packages/data/codegen/generated/ packages/data/codegen/generated/

# Copy on-disk OpenAPI spec consumed by astro-kbve at build time.
# src/pages/llms.txt.ts imports packages/data/openapi/openapi.json so
# /llms.txt is generated from the same utoipa-emitted spec the live
# API serves at /api/openapi.json.
COPY packages/data/openapi/ packages/data/openapi/

# Crate READMEs imported by astro-kbve project pages (e.g.
# /project/holy-crate uses `import { Content } from '...README.md'`
# so the crate doc and the kbve.com page stay in sync from one file).
# Add new entries here when more crate READMEs are imported.
COPY packages/rust/holy/README.md packages/rust/holy/README.md

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
    \) ! -path "*/askama/*" -print0 | \
    xargs -0 -P "$(nproc)" -n 1 sh -c ' \
        gzip -9 -f -k "$1" && \
        brotli -q 9 -f --keep "$1" \
    ' _ && \
    echo "Precompression complete (brotli-9 + gzip-9, parallel x $(nproc))"

# ============================================================================
# Rust build stages — cargo-chef separates dependency compilation from source.
# BuildKit layer cache handles incremental rebuilds across runs.
# ============================================================================

# [STAGE C] - Cargo Chef Planner
FROM --platform=linux/amd64 ghcr.io/kbve/chisel-ubuntu-axum:24.04-builder AS planner

# sccache 0.14.0 refuses to wrap rustc unless CARGO_INCREMENTAL is explicitly 0.
# Cargo-chef's first probe is `sccache rustc -vV`, which trips this guard.
ENV CARGO_INCREMENTAL=0

COPY apps/kbve/axum-kbve/Cargo.workspace.toml Cargo.toml
COPY Cargo.lock ./

COPY apps/kbve/axum-kbve/Cargo.toml apps/kbve/axum-kbve/Cargo.toml
COPY packages/rust/jedi/Cargo.toml packages/rust/jedi/Cargo.toml
COPY packages/rust/kbve/Cargo.toml packages/rust/kbve/Cargo.toml
COPY packages/rust/holy/Cargo.toml packages/rust/holy/Cargo.toml
COPY packages/rust/bevy/bevy_kbve_net/Cargo.toml packages/rust/bevy/bevy_kbve_net/Cargo.toml
COPY packages/rust/bevy/bevy_npc/Cargo.toml packages/rust/bevy/bevy_npc/Cargo.toml
COPY packages/rust/bevy/bevy_tasker/Cargo.toml packages/rust/bevy/bevy_tasker/Cargo.toml
COPY packages/rust/bevy/bevy_inventory/Cargo.toml packages/rust/bevy/bevy_inventory/Cargo.toml
COPY packages/rust/bevy/bevy_items/Cargo.toml packages/rust/bevy/bevy_items/Cargo.toml
COPY packages/rust/bevy/bevy_skills/Cargo.toml packages/rust/bevy/bevy_skills/Cargo.toml

COPY packages/data/proto packages/data/proto

RUN mkdir -p apps/kbve/axum-kbve/src && echo "fn main() {}" > apps/kbve/axum-kbve/src/main.rs && \
    mkdir -p packages/rust/jedi/src && echo "" > packages/rust/jedi/src/lib.rs && \
    mkdir -p packages/rust/kbve/src && echo "" > packages/rust/kbve/src/lib.rs && \
    mkdir -p packages/rust/holy/src && echo "" > packages/rust/holy/src/lib.rs && \
    mkdir -p packages/rust/bevy/bevy_kbve_net/src && echo "" > packages/rust/bevy/bevy_kbve_net/src/lib.rs && \
    mkdir -p packages/rust/bevy/bevy_npc/src && echo "" > packages/rust/bevy/bevy_npc/src/lib.rs && \
    mkdir -p packages/rust/bevy/bevy_tasker/src && echo "" > packages/rust/bevy/bevy_tasker/src/lib.rs && \
    mkdir -p packages/rust/bevy/bevy_inventory/src && echo "" > packages/rust/bevy/bevy_inventory/src/lib.rs && \
    mkdir -p packages/rust/bevy/bevy_items/src && echo "" > packages/rust/bevy/bevy_items/src/lib.rs && \
    mkdir -p packages/rust/bevy/bevy_skills/src && echo "" > packages/rust/bevy/bevy_skills/src/lib.rs

RUN cargo chef prepare --recipe-path recipe.json

# [STAGE D] - Cargo Chef Cook (Cache External Dependencies)
FROM --platform=linux/amd64 ghcr.io/kbve/chisel-ubuntu-axum:24.04-builder AS builder-deps
# sccache is incompatible with incremental compilation
ENV CARGO_INCREMENTAL=0
ENV RUSTFLAGS="-C link-arg=-fuse-ld=mold"

COPY --from=planner /app/recipe.json recipe.json
COPY --from=planner /app/Cargo.toml /app/Cargo.lock ./
COPY --from=planner /app/apps apps
COPY --from=planner /app/packages packages

RUN --mount=type=cache,target=/usr/local/cargo/registry \
    --mount=type=cache,target=/usr/local/cargo/git \
    --mount=type=cache,target=/usr/local/sccache,id=sccache \
    --mount=type=secret,id=valkey_password,env=SCCACHE_REDIS_PASSWORD,required=false \
    if [ -n "${SCCACHE_REDIS_PASSWORD:-}" ]; then \
        export SCCACHE_REDIS_ENDPOINT=tcp://valkey.valkey.svc.cluster.local:6379 \
            SCCACHE_REDIS_USERNAME=default \
            SCCACHE_REDIS_KEY_PREFIX=axum-kbve; \
        echo "sccache: Redis backend enabled"; \
    else \
        echo "sccache: Redis password not provided, falling back to local disk cache"; \
    fi && \
    cargo chef cook --release --recipe-path recipe.json -p axum-kbve && \
    (sccache --show-stats || true)

# [STAGE E] - Foundation Layer (Compile kbve + jedi from real source)
FROM --platform=linux/amd64 ghcr.io/kbve/chisel-ubuntu-axum:24.04-builder AS foundation
ENV CARGO_INCREMENTAL=0
ENV RUSTFLAGS="-C link-arg=-fuse-ld=mold"

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
COPY packages/rust/holy packages/rust/holy
COPY packages/rust/bevy/bevy_kbve_net packages/rust/bevy/bevy_kbve_net
COPY packages/rust/bevy/bevy_npc packages/rust/bevy/bevy_npc
COPY packages/rust/bevy/bevy_tasker packages/rust/bevy/bevy_tasker
COPY packages/rust/bevy/bevy_inventory packages/rust/bevy/bevy_inventory
COPY packages/rust/bevy/bevy_items packages/rust/bevy/bevy_items
COPY packages/rust/bevy/bevy_skills packages/rust/bevy/bevy_skills

RUN --mount=type=cache,target=/usr/local/cargo/registry \
    --mount=type=cache,target=/usr/local/cargo/git \
    --mount=type=cache,target=/usr/local/sccache,id=sccache \
    --mount=type=secret,id=valkey_password,env=SCCACHE_REDIS_PASSWORD,required=false \
    if [ -n "${SCCACHE_REDIS_PASSWORD:-}" ]; then \
        export SCCACHE_REDIS_ENDPOINT=tcp://valkey.valkey.svc.cluster.local:6379 \
            SCCACHE_REDIS_USERNAME=default \
            SCCACHE_REDIS_KEY_PREFIX=axum-kbve; \
    fi && \
    cargo build --release -p kbve -p jedi -p holy -p bevy_kbve_net -p bevy_npc -p bevy_tasker \
        -p bevy_inventory -p bevy_items -p bevy_skills && \
    (sccache --show-stats || true)

# ============================================================================
# [STAGE F] - Build Application
# ============================================================================
FROM foundation AS builder

# Ensure make is available for tikv-jemalloc-sys compilation (build from source)
RUN dpkg -s make >/dev/null 2>&1 || \
    (apt-get update && apt-get install -y --no-install-recommends make && rm -rf /var/lib/apt/lists/*)

# Astro build output (precompressed) -> placed into templates/dist
COPY --from=astro-precompressor /static /app/apps/kbve/axum-kbve/templates/dist

# Foundation crate source (cargo needs source to verify fingerprints)
COPY packages/data/proto packages/data/proto
COPY packages/data/rcon packages/data/rcon
COPY packages/rust/jedi packages/rust/jedi
COPY packages/rust/kbve packages/rust/kbve
COPY packages/rust/holy packages/rust/holy
COPY packages/rust/bevy/bevy_kbve_net packages/rust/bevy/bevy_kbve_net
COPY packages/rust/bevy/bevy_npc packages/rust/bevy/bevy_npc
COPY packages/rust/bevy/bevy_tasker packages/rust/bevy/bevy_tasker
COPY packages/rust/bevy/bevy_inventory packages/rust/bevy/bevy_inventory
COPY packages/rust/bevy/bevy_items packages/rust/bevy/bevy_items
COPY packages/rust/bevy/bevy_skills packages/rust/bevy/bevy_skills

# Application source (most frequently changing — placed last for cache)
COPY apps/kbve/axum-kbve apps/kbve/axum-kbve

# Copy Askama templates, then overwrite with Astro-generated Starlight versions
COPY apps/kbve/axum-kbve/templates/askama /app/apps/kbve/axum-kbve/templates/askama
RUN cp -a /app/apps/kbve/axum-kbve/templates/dist/askama/. /app/apps/kbve/axum-kbve/templates/askama/

RUN --mount=type=cache,target=/usr/local/cargo/registry \
    --mount=type=cache,target=/usr/local/cargo/git \
    --mount=type=cache,target=/usr/local/sccache,id=sccache \
    --mount=type=secret,id=valkey_password,env=SCCACHE_REDIS_PASSWORD,required=false \
    if [ -n "${SCCACHE_REDIS_PASSWORD:-}" ]; then \
        export SCCACHE_REDIS_ENDPOINT=tcp://valkey.valkey.svc.cluster.local:6379 \
            SCCACHE_REDIS_USERNAME=default \
            SCCACHE_REDIS_KEY_PREFIX=axum-kbve; \
    fi && \
    cargo build --release -p axum-kbve --features jemalloc && \
    (sccache --show-stats || true) && \
    strip target/release/axum-kbve

# ============================================================================
# [STAGE Z] - Runtime Image (shared chisel base)
# ============================================================================
FROM --platform=linux/amd64 ghcr.io/kbve/chisel-ubuntu-axum:24.04.3 AS runtime

COPY --from=builder --chown=10001:10001 /app/target/release/axum-kbve /app/axum-kbve

# Ship Cargo.toml alongside the binary so `/health` reports the version
# that was current when *this image* was built. CI's pre-build sync step
# (utils-publish-docker-image.yml + docker-test-app.yml) writes the
# release version into apps/kbve/axum-kbve/Cargo.toml from api.mdx before
# the image build, so the file copied here is always the right version
# for this binary. Reading the file at runtime instead of using
# `env!("CARGO_PKG_VERSION")` lets the kube Deployment override it
# (mount/replace) without rebuilding when needed.
COPY --chown=10001:10001 apps/kbve/axum-kbve/Cargo.toml /app/Cargo.toml

COPY --from=builder --chown=10001:10001 /app/apps/kbve/axum-kbve/templates/dist /app/templates/dist
COPY --from=builder --chown=10001:10001 /app/apps/kbve/axum-kbve/templates/askama /app/templates/askama

ENV HTTP_HOST=0.0.0.0
ENV HTTP_PORT=4321
ENV RUST_LOG=info

EXPOSE 4321
EXPOSE 5000

ENTRYPOINT ["/app/axum-kbve"]
