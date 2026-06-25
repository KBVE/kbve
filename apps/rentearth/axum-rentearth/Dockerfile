# ============================================================================
# axum-rentearth Dockerfile — itch download backend + Vite/TanStack web
# Uses ghcr.io/kbve/chisel-ubuntu-axum for pre-built builder + runtime
# ============================================================================

# ============================================================================
# [STAGE W] - Build the Vite + TanStack web (self-contained, no monorepo deps)
# ============================================================================
FROM ghcr.io/kbve/chisel-ubuntu-axum:24.04-builder AS web-builder

WORKDIR /web

COPY apps/rentearth/axum-rentearth/web/package.json apps/rentearth/axum-rentearth/web/package-lock.json ./
RUN npm ci

COPY apps/rentearth/axum-rentearth/web/ ./
RUN npm run build

# ============================================================================
# [STAGE C] - Cargo Chef Planner
# ============================================================================
FROM ghcr.io/kbve/chisel-ubuntu-axum:24.04-builder AS planner

# sccache 0.14.0 refuses to wrap rustc unless CARGO_INCREMENTAL is explicitly 0.
# Cargo-chef's first probe is `sccache rustc -vV`, which trips this guard.
ENV CARGO_INCREMENTAL=0

WORKDIR /app

COPY apps/rentearth/axum-rentearth/Cargo.workspace.toml Cargo.toml
COPY Cargo.lock ./

COPY apps/rentearth/axum-rentearth/Cargo.toml apps/rentearth/axum-rentearth/Cargo.toml
COPY packages/rust/jedi/Cargo.toml packages/rust/jedi/Cargo.toml
COPY packages/rust/holy/Cargo.toml packages/rust/holy/Cargo.toml
COPY packages/rust/kbve/Cargo.toml packages/rust/kbve/Cargo.toml
COPY packages/rust/bevy/bevy_kbve_net/Cargo.toml packages/rust/bevy/bevy_kbve_net/Cargo.toml
COPY packages/rust/bevy/bevy_npc/Cargo.toml packages/rust/bevy/bevy_npc/Cargo.toml
# bevy_kbve_net carries an optional path dep on bevy_tasker behind the
# "creatures" feature. cargo chef prepare reads every member manifest
# fully — including optional path deps — so the bevy_tasker manifest
# must exist on disk even though we never enable the feature here.
COPY packages/rust/bevy/bevy_tasker/Cargo.toml packages/rust/bevy/bevy_tasker/Cargo.toml

COPY packages/data/proto packages/data/proto

RUN mkdir -p apps/rentearth/axum-rentearth/src && echo "fn main() {}" > apps/rentearth/axum-rentearth/src/main.rs && \
    mkdir -p packages/rust/jedi/src && echo "" > packages/rust/jedi/src/lib.rs && \
    mkdir -p packages/rust/holy/src && echo "" > packages/rust/holy/src/lib.rs && \
    mkdir -p packages/rust/kbve/src && echo "" > packages/rust/kbve/src/lib.rs && \
    mkdir -p packages/rust/bevy/bevy_kbve_net/src && echo "" > packages/rust/bevy/bevy_kbve_net/src/lib.rs && \
    mkdir -p packages/rust/bevy/bevy_npc/src && echo "" > packages/rust/bevy/bevy_npc/src/lib.rs && \
    mkdir -p packages/rust/bevy/bevy_tasker/src && echo "" > packages/rust/bevy/bevy_tasker/src/lib.rs

RUN cargo chef prepare --recipe-path recipe.json

# ============================================================================
# [STAGE D] - Cargo Chef Cook (Cache External Dependencies)
# ============================================================================
FROM ghcr.io/kbve/chisel-ubuntu-axum:24.04-builder AS builder-deps

ENV CARGO_INCREMENTAL=0

WORKDIR /app

COPY --from=planner /app/recipe.json recipe.json
COPY --from=planner /app/Cargo.toml /app/Cargo.lock ./
COPY --from=planner /app/apps apps
COPY --from=planner /app/packages packages

RUN --mount=type=cache,target=/usr/local/cargo/registry \
    --mount=type=cache,target=/usr/local/cargo/git \
    cargo chef cook --release --recipe-path recipe.json -p axum-rentearth

# ============================================================================
# [STAGE E] - Foundation Layer (Compile kbve + jedi from real source)
# ============================================================================
FROM ghcr.io/kbve/chisel-ubuntu-axum:24.04-builder AS foundation

ENV CARGO_INCREMENTAL=0

WORKDIR /app

COPY --from=builder-deps /app/target target
COPY --from=builder-deps /usr/local/cargo /usr/local/cargo

COPY --from=planner /app/Cargo.toml ./
COPY Cargo.lock ./

COPY apps/rentearth/axum-rentearth/Cargo.toml apps/rentearth/axum-rentearth/Cargo.toml
RUN mkdir -p apps/rentearth/axum-rentearth/src && \
    echo "fn main() {}" > apps/rentearth/axum-rentearth/src/main.rs

COPY packages/data/proto packages/data/proto

COPY packages/rust/jedi packages/rust/jedi
COPY packages/rust/holy packages/rust/holy
COPY packages/rust/kbve packages/rust/kbve
COPY packages/rust/bevy/bevy_kbve_net packages/rust/bevy/bevy_kbve_net
COPY packages/rust/bevy/bevy_npc packages/rust/bevy/bevy_npc
COPY packages/rust/bevy/bevy_tasker packages/rust/bevy/bevy_tasker

RUN --mount=type=cache,target=/usr/local/cargo/registry \
    --mount=type=cache,target=/usr/local/cargo/git \
    cargo build --release -p kbve -p jedi -p holy -p bevy_kbve_net -p bevy_npc

# ============================================================================
# [STAGE F] - Build Application
# ============================================================================
FROM foundation AS builder

# Foundation crate source (cargo needs source to verify fingerprints)
COPY packages/data/proto packages/data/proto
COPY packages/rust/jedi packages/rust/jedi
COPY packages/rust/holy packages/rust/holy
COPY packages/rust/kbve packages/rust/kbve
COPY packages/rust/bevy/bevy_kbve_net packages/rust/bevy/bevy_kbve_net
COPY packages/rust/bevy/bevy_npc packages/rust/bevy/bevy_npc
COPY packages/rust/bevy/bevy_tasker packages/rust/bevy/bevy_tasker

# Application source (most frequently changing — placed last for cache).
# Includes templates/askama, which askama compiles into the binary.
COPY apps/rentearth/axum-rentearth apps/rentearth/axum-rentearth

RUN --mount=type=cache,target=/usr/local/cargo/registry \
    --mount=type=cache,target=/usr/local/cargo/git \
    cargo build --release -p axum-rentearth && \
    strip target/release/axum-rentearth

# ============================================================================
# [STAGE Z] - Runtime Image (pre-built chisel + jemalloc + libpq)
# ============================================================================
FROM ghcr.io/kbve/chisel-ubuntu-axum:24.04 AS runtime

WORKDIR /app

COPY --from=builder --chown=10001:10001 /app/target/release/axum-rentearth /app/axum-rentearth

# Vite web build -> served as static at / (axum keeps /downloads + /api/downloads)
COPY --from=web-builder --chown=10001:10001 /web/dist /app/templates/dist

ENV HTTP_HOST=0.0.0.0
ENV HTTP_PORT=4323
ENV RUST_LOG=info

EXPOSE 4323

ENTRYPOINT ["/app/axum-rentearth"]
