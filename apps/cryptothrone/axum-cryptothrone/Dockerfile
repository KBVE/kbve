# ============================================================================
# axum-cryptothrone — Multi-stage Docker build
#
# Uses shared chisel base images:
#   ghcr.io/kbve/chisel-ubuntu-axum:24.04-builder  (Rust + Node + pnpm + cargo-chef)
#   ghcr.io/kbve/chisel-ubuntu-axum:24.04.3         (chiseled Ubuntu + jemalloc + libpq)
# ============================================================================

# ============================================================================
# [STAGE A] - Build Astro Static Site
# ============================================================================
FROM --platform=linux/amd64 ghcr.io/kbve/chisel-ubuntu-axum:24.04-builder AS astro-builder

WORKDIR /app

COPY package.json pnpm-lock.yaml .npmrc tsconfig.base.json ./

RUN --mount=type=cache,target=/root/.local/share/pnpm/store/v3,id=pnpm-store \
    pnpm install --frozen-lockfile

COPY packages/npm/astro/ packages/npm/astro/
COPY packages/npm/droid/ packages/npm/droid/
COPY packages/npm/laser/ packages/npm/laser/

COPY packages/data/codegen/generated/ packages/data/codegen/generated/

COPY apps/cryptothrone/astro-cryptothrone/ apps/cryptothrone/astro-cryptothrone/

WORKDIR /app/apps/cryptothrone/astro-cryptothrone
RUN rm -rf .astro && npx astro sync && \
    UV_THREADPOOL_SIZE=4 NODE_OPTIONS="--max-old-space-size=4096" npx astro build

# ============================================================================
# [STAGE B] - Precompress Static Assets
# ============================================================================
FROM --platform=linux/amd64 ubuntu:24.04 AS astro-precompressor

RUN apt-get update && \
    apt-get install -y --no-install-recommends gzip brotli && \
    rm -rf /var/lib/apt/lists/*

COPY --from=astro-builder /app/dist/apps/astro-cryptothrone /static

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
# Rust build stages
# ============================================================================

# [STAGE C] - Cargo Chef Planner
FROM --platform=linux/amd64 ghcr.io/kbve/chisel-ubuntu-axum:24.04-builder AS planner

COPY apps/cryptothrone/axum-cryptothrone/Cargo.workspace.toml Cargo.toml
COPY Cargo.lock ./

COPY apps/cryptothrone/axum-cryptothrone/Cargo.toml apps/cryptothrone/axum-cryptothrone/Cargo.toml
COPY packages/rust/jedi/Cargo.toml packages/rust/jedi/Cargo.toml
COPY packages/rust/kbve/Cargo.toml packages/rust/kbve/Cargo.toml

COPY packages/data/proto packages/data/proto

RUN mkdir -p apps/cryptothrone/axum-cryptothrone/src && echo "fn main() {}" > apps/cryptothrone/axum-cryptothrone/src/main.rs && \
    mkdir -p packages/rust/jedi/src && echo "" > packages/rust/jedi/src/lib.rs && \
    mkdir -p packages/rust/kbve/src && echo "" > packages/rust/kbve/src/lib.rs

RUN cargo chef prepare --recipe-path recipe.json

# [STAGE D] - Cargo Chef Cook (Cache External Dependencies)
FROM --platform=linux/amd64 ghcr.io/kbve/chisel-ubuntu-axum:24.04-builder AS builder-deps
ENV CARGO_INCREMENTAL=0

COPY --from=planner /app/recipe.json recipe.json
COPY --from=planner /app/Cargo.toml /app/Cargo.lock ./
COPY --from=planner /app/apps apps
COPY --from=planner /app/packages packages

RUN --mount=type=cache,target=/usr/local/cargo/registry \
    --mount=type=cache,target=/usr/local/cargo/git \
    --mount=type=cache,target=/usr/local/sccache,id=sccache \
    cargo chef cook --release --recipe-path recipe.json -p axum-cryptothrone

# [STAGE E] - Foundation Layer (Compile kbve + jedi from real source)
FROM --platform=linux/amd64 ghcr.io/kbve/chisel-ubuntu-axum:24.04-builder AS foundation
ENV CARGO_INCREMENTAL=0

COPY --from=builder-deps /app/target target
COPY --from=builder-deps /usr/local/cargo /usr/local/cargo

COPY --from=planner /app/Cargo.toml ./
COPY Cargo.lock ./

COPY apps/cryptothrone/axum-cryptothrone/Cargo.toml apps/cryptothrone/axum-cryptothrone/Cargo.toml
RUN mkdir -p apps/cryptothrone/axum-cryptothrone/src && \
    echo "fn main() {}" > apps/cryptothrone/axum-cryptothrone/src/main.rs

COPY packages/data/proto packages/data/proto

COPY packages/rust/jedi packages/rust/jedi
COPY packages/rust/kbve packages/rust/kbve

RUN --mount=type=cache,target=/usr/local/cargo/registry \
    --mount=type=cache,target=/usr/local/cargo/git \
    --mount=type=cache,target=/usr/local/sccache,id=sccache \
    cargo build --release -p kbve -p jedi

# ============================================================================
# [STAGE F] - Build Application
# ============================================================================
FROM foundation AS builder

COPY --from=astro-precompressor /static /app/apps/cryptothrone/axum-cryptothrone/templates/dist

COPY packages/data/proto packages/data/proto
COPY packages/rust/jedi packages/rust/jedi
COPY packages/rust/kbve packages/rust/kbve

COPY apps/cryptothrone/axum-cryptothrone apps/cryptothrone/axum-cryptothrone

COPY apps/cryptothrone/axum-cryptothrone/templates/askama /app/apps/cryptothrone/axum-cryptothrone/templates/askama

RUN --mount=type=cache,target=/usr/local/cargo/registry \
    --mount=type=cache,target=/usr/local/cargo/git \
    --mount=type=cache,target=/usr/local/sccache,id=sccache \
    cargo build --release -p axum-cryptothrone --features jemalloc && \
    strip target/release/axum-cryptothrone

# ============================================================================
# [STAGE Z] - Runtime Image (shared chisel base)
# ============================================================================
FROM --platform=linux/amd64 ghcr.io/kbve/chisel-ubuntu-axum:24.04.3 AS runtime

COPY --from=builder --chown=10001:10001 /app/target/release/axum-cryptothrone /app/axum-cryptothrone

COPY --from=builder --chown=10001:10001 /app/apps/cryptothrone/axum-cryptothrone/templates/dist /app/templates/dist
COPY --from=builder --chown=10001:10001 /app/apps/cryptothrone/axum-cryptothrone/templates/askama /app/templates/askama

ENV HTTP_HOST=0.0.0.0
ENV HTTP_PORT=4321
ENV RUST_LOG=info

EXPOSE 4321

ENTRYPOINT ["/app/axum-cryptothrone"]
