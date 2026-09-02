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
COPY crates/jedi/Cargo.toml crates/jedi/Cargo.toml
COPY crates/kbve-proto/Cargo.toml crates/kbve-proto/Cargo.toml
COPY crates/holy/Cargo.toml crates/holy/Cargo.toml
COPY crates/kbve/Cargo.toml crates/kbve/Cargo.toml
COPY crates/bevy_kbve_net/Cargo.toml crates/bevy_kbve_net/Cargo.toml
COPY crates/bevy_npc/Cargo.toml crates/bevy_npc/Cargo.toml
# bevy_kbve_net carries an optional path dep on bevy_tasker behind the
# "creatures" feature. cargo chef prepare reads every member manifest
# fully — including optional path deps — so the bevy_tasker manifest
# must exist on disk even though we never enable the feature here.
COPY crates/bevy_tasker/Cargo.toml crates/bevy_tasker/Cargo.toml

COPY packages/data/proto packages/data/proto

RUN mkdir -p apps/rentearth/axum-rentearth/src && echo "fn main() {}" > apps/rentearth/axum-rentearth/src/main.rs && \
    mkdir -p crates/jedi/src && echo "" > crates/jedi/src/lib.rs && \
    mkdir -p crates/kbve-proto/src && echo "" > crates/kbve-proto/src/lib.rs && \
    mkdir -p crates/holy/src && echo "" > crates/holy/src/lib.rs && \
    mkdir -p crates/kbve/src && echo "" > crates/kbve/src/lib.rs && \
    mkdir -p crates/bevy_kbve_net/src && echo "" > crates/bevy_kbve_net/src/lib.rs && \
    mkdir -p crates/bevy_npc/src && echo "" > crates/bevy_npc/src/lib.rs && \
    mkdir -p crates/bevy_tasker/src && echo "" > crates/bevy_tasker/src/lib.rs

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

COPY crates/jedi crates/jedi
COPY crates/kbve-proto crates/kbve-proto
COPY packages/proto packages/proto
COPY crates/holy crates/holy
COPY crates/kbve crates/kbve
COPY crates/bevy_kbve_net crates/bevy_kbve_net
COPY crates/bevy_npc crates/bevy_npc
COPY crates/bevy_tasker crates/bevy_tasker

RUN --mount=type=cache,target=/usr/local/cargo/registry \
    --mount=type=cache,target=/usr/local/cargo/git \
    cargo build --release -p kbve -p jedi -p holy -p bevy_kbve_net -p bevy_npc

# ============================================================================
# [STAGE F] - Build Application
# ============================================================================
FROM foundation AS builder

# Foundation crate source (cargo needs source to verify fingerprints)
COPY packages/data/proto packages/data/proto
COPY crates/jedi crates/jedi
COPY crates/kbve-proto crates/kbve-proto
COPY packages/proto packages/proto
COPY crates/holy crates/holy
COPY crates/kbve crates/kbve
COPY crates/bevy_kbve_net crates/bevy_kbve_net
COPY crates/bevy_npc crates/bevy_npc
COPY crates/bevy_tasker crates/bevy_tasker

# Application source (most frequently changing — placed last for cache).
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

# Vite SPA build -> served as static; axum keeps /api/downloads + /downloads/{platform}
COPY --from=web-builder --chown=10001:10001 /web/dist /app/templates/dist

ENV HTTP_HOST=0.0.0.0
ENV HTTP_PORT=4323
ENV RUST_LOG=info

EXPOSE 4323

ENTRYPOINT ["/app/axum-rentearth"]
