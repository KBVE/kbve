# ============================================================================
# axum-chuckrpg Dockerfile
# Uses ghcr.io/kbve/chisel-ubuntu-axum for pre-built builder + runtime
# ============================================================================

# ============================================================================
# [STAGE A] - Build Astro Static Site (uses builder's Node.js + pnpm)
# ============================================================================
FROM ghcr.io/kbve/chisel-ubuntu-axum:24.04-builder AS astro-builder

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
    UV_THREADPOOL_SIZE=4 NODE_OPTIONS="--max-old-space-size=8192" npx astro build && \
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
    ' _ {} \; && \
    echo "Precompression complete (brotli-11 + gzip-9)"

# ============================================================================
# [STAGE C] - Cargo Chef Planner
# ============================================================================
FROM ghcr.io/kbve/chisel-ubuntu-axum:24.04-builder AS planner

WORKDIR /app

COPY apps/chuckrpg/axum-chuckrpg/Cargo.workspace.toml Cargo.toml
COPY Cargo.lock ./

COPY apps/chuckrpg/axum-chuckrpg/Cargo.toml apps/chuckrpg/axum-chuckrpg/Cargo.toml
COPY packages/rust/jedi/Cargo.toml packages/rust/jedi/Cargo.toml
COPY packages/rust/kbve/Cargo.toml packages/rust/kbve/Cargo.toml
COPY packages/rust/bevy/bevy_kbve_net/Cargo.toml packages/rust/bevy/bevy_kbve_net/Cargo.toml
COPY packages/rust/bevy/bevy_npc/Cargo.toml packages/rust/bevy/bevy_npc/Cargo.toml

COPY packages/data/proto packages/data/proto

RUN mkdir -p apps/chuckrpg/axum-chuckrpg/src && echo "fn main() {}" > apps/chuckrpg/axum-chuckrpg/src/main.rs && \
    mkdir -p packages/rust/jedi/src && echo "" > packages/rust/jedi/src/lib.rs && \
    mkdir -p packages/rust/kbve/src && echo "" > packages/rust/kbve/src/lib.rs && \
    mkdir -p packages/rust/bevy/bevy_kbve_net/src && echo "" > packages/rust/bevy/bevy_kbve_net/src/lib.rs && \
    mkdir -p packages/rust/bevy/bevy_npc/src && echo "" > packages/rust/bevy/bevy_npc/src/lib.rs

RUN cargo chef prepare --recipe-path recipe.json

# ============================================================================
# [STAGE D] - Cargo Chef Cook (Cache External Dependencies)
# ============================================================================
FROM ghcr.io/kbve/chisel-ubuntu-axum:24.04-builder AS builder-deps

WORKDIR /app

COPY --from=planner /app/recipe.json recipe.json
COPY --from=planner /app/Cargo.toml /app/Cargo.lock ./
COPY --from=planner /app/apps apps
COPY --from=planner /app/packages packages

RUN --mount=type=cache,target=/usr/local/cargo/registry \
    --mount=type=cache,target=/usr/local/cargo/git \
    cargo chef cook --release --recipe-path recipe.json -p axum-chuckrpg

# ============================================================================
# [STAGE E] - Foundation Layer (Compile kbve + jedi from real source)
# ============================================================================
FROM ghcr.io/kbve/chisel-ubuntu-axum:24.04-builder AS foundation

WORKDIR /app

COPY --from=builder-deps /app/target target
COPY --from=builder-deps /usr/local/cargo /usr/local/cargo

COPY --from=planner /app/Cargo.toml ./
COPY Cargo.lock ./

COPY apps/chuckrpg/axum-chuckrpg/Cargo.toml apps/chuckrpg/axum-chuckrpg/Cargo.toml
RUN mkdir -p apps/chuckrpg/axum-chuckrpg/src && \
    echo "fn main() {}" > apps/chuckrpg/axum-chuckrpg/src/main.rs

COPY packages/data/proto packages/data/proto

COPY packages/rust/jedi packages/rust/jedi
COPY packages/rust/kbve packages/rust/kbve
COPY packages/rust/bevy/bevy_kbve_net packages/rust/bevy/bevy_kbve_net
COPY packages/rust/bevy/bevy_npc packages/rust/bevy/bevy_npc

RUN --mount=type=cache,target=/usr/local/cargo/registry \
    --mount=type=cache,target=/usr/local/cargo/git \
    cargo build --release -p kbve -p jedi -p bevy_kbve_net -p bevy_npc

# ============================================================================
# [STAGE F] - Build Application
# ============================================================================
FROM foundation AS builder

# Astro build output (precompressed) -> placed into templates/dist
COPY --from=astro-precompressor /static /app/apps/chuckrpg/axum-chuckrpg/templates/dist

# Foundation crate source (cargo needs source to verify fingerprints)
COPY packages/data/proto packages/data/proto
COPY packages/rust/jedi packages/rust/jedi
COPY packages/rust/kbve packages/rust/kbve
COPY packages/rust/bevy/bevy_kbve_net packages/rust/bevy/bevy_kbve_net
COPY packages/rust/bevy/bevy_npc packages/rust/bevy/bevy_npc

# Application source (most frequently changing — placed last for cache)
COPY apps/chuckrpg/axum-chuckrpg apps/chuckrpg/axum-chuckrpg

RUN --mount=type=cache,target=/usr/local/cargo/registry \
    --mount=type=cache,target=/usr/local/cargo/git \
    cargo build --release -p axum-chuckrpg && \
    strip target/release/axum-chuckrpg

# ============================================================================
# [STAGE Z] - Runtime Image (pre-built chisel + jemalloc + libpq)
# ============================================================================
FROM ghcr.io/kbve/chisel-ubuntu-axum:24.04 AS runtime

WORKDIR /app

COPY --from=builder --chown=10001:10001 /app/target/release/axum-chuckrpg /app/axum-chuckrpg

COPY --from=builder --chown=10001:10001 /app/apps/chuckrpg/axum-chuckrpg/templates/dist /app/templates/dist

ENV HTTP_HOST=0.0.0.0
ENV HTTP_PORT=4322
ENV RUST_LOG=info

EXPOSE 4322

ENTRYPOINT ["/app/axum-chuckrpg"]
