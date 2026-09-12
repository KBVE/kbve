# ============================================================================
# mmorpg-server — authoritative avian3d sim replicated with lightyear over a
# WebSocket, plus the HTTP door that mints ConnectTokens. Multi-stage build on
# the shared chisel base.
#
# bevy is built headless (`default-features = false`), so the builder needs no
# X11, wayland, alsa or gtk system libraries and the runtime image stays the
# same chisel one every other axum service here uses.
#
# The COPY list below is the crate's path-dependency closure and has to stay
# equal to it: a missing crate fails in `cargo chef prepare` with a manifest
# error rather than anywhere near the line that introduced it.
#   mmorpg-server -> mmorpg_net, bevy_kbve_net, jedi -> kbve-proto
# ============================================================================

FROM --platform=linux/amd64 ghcr.io/kbve/chisel-ubuntu-axum:24.04.13-builder AS planner
ENV CARGO_INCREMENTAL=0

COPY apps/agones/mmorpg/server/Cargo.workspace.toml Cargo.toml
COPY Cargo.lock ./

COPY apps/agones/mmorpg/server/Cargo.toml apps/agones/mmorpg/server/Cargo.toml
COPY crates/mmorpg_net/Cargo.toml crates/mmorpg_net/Cargo.toml
COPY crates/bevy_kbve_net/Cargo.toml crates/bevy_kbve_net/Cargo.toml
COPY crates/jedi/Cargo.toml crates/jedi/Cargo.toml
COPY crates/kbve-proto/Cargo.toml crates/kbve-proto/Cargo.toml

RUN mkdir -p apps/agones/mmorpg/server/src && \
    echo "fn main() {}" > apps/agones/mmorpg/server/src/main.rs && \
    mkdir -p crates/mmorpg_net/src && \
    echo "" > crates/mmorpg_net/src/lib.rs && \
    mkdir -p crates/bevy_kbve_net/src && \
    echo "" > crates/bevy_kbve_net/src/lib.rs && \
    mkdir -p crates/jedi/src && \
    echo "" > crates/jedi/src/lib.rs && \
    echo "fn main() {}" > crates/jedi/build.rs && \
    mkdir -p crates/kbve-proto/src && echo "" > crates/kbve-proto/src/lib.rs

COPY packages/data/proto packages/data/proto

RUN cargo chef prepare --recipe-path recipe.json --bin mmorpg-server

# ============================================================================
FROM --platform=linux/amd64 ghcr.io/kbve/chisel-ubuntu-axum:24.04.13-builder AS builder-deps
ENV CARGO_INCREMENTAL=0
ENV RUSTFLAGS="-C link-arg=-fuse-ld=mold"

COPY --from=planner /app/recipe.json recipe.json
COPY --from=planner /app/Cargo.toml /app/Cargo.lock ./
COPY --from=planner /app/apps apps
COPY --from=planner /app/crates crates
COPY --from=planner /app/packages packages

RUN --mount=type=cache,target=/usr/local/cargo/registry \
    --mount=type=cache,target=/usr/local/cargo/git \
    --mount=type=cache,target=/usr/local/sccache,id=sccache \
    --mount=type=secret,id=valkey_password,env=SCCACHE_REDIS_PASSWORD,required=false \
    if [ -n "${SCCACHE_REDIS_PASSWORD:-}" ]; then \
        export SCCACHE_REDIS_ENDPOINT=tcp://valkey.valkey.svc.cluster.local:6379 \
            SCCACHE_REDIS_USERNAME=default \
            SCCACHE_REDIS_KEY_PREFIX=mmorpg-server; \
        echo "sccache: Redis backend enabled"; \
    else \
        echo "sccache: Redis password not provided, falling back to local disk cache"; \
    fi && \
    cargo chef cook --release --recipe-path recipe.json -p mmorpg-server && \
    (sccache --show-stats || true)

# ============================================================================
FROM --platform=linux/amd64 ghcr.io/kbve/chisel-ubuntu-axum:24.04.13-builder AS builder
ENV CARGO_INCREMENTAL=0
ENV RUSTFLAGS="-C link-arg=-fuse-ld=mold"

COPY --from=builder-deps /app/target target
COPY --from=builder-deps /usr/local/cargo /usr/local/cargo

COPY apps/agones/mmorpg/server/Cargo.workspace.toml Cargo.toml
COPY Cargo.lock ./

COPY crates/mmorpg_net crates/mmorpg_net
COPY crates/bevy_kbve_net crates/bevy_kbve_net
COPY crates/jedi crates/jedi
COPY crates/kbve-proto crates/kbve-proto
COPY packages/proto packages/proto
COPY apps/agones/mmorpg/server apps/agones/mmorpg/server

RUN --mount=type=cache,target=/usr/local/cargo/registry \
    --mount=type=cache,target=/usr/local/cargo/git \
    --mount=type=cache,target=/usr/local/sccache,id=sccache \
    --mount=type=secret,id=valkey_password,env=SCCACHE_REDIS_PASSWORD,required=false \
    if [ -n "${SCCACHE_REDIS_PASSWORD:-}" ]; then \
        export SCCACHE_REDIS_ENDPOINT=tcp://valkey.valkey.svc.cluster.local:6379 \
            SCCACHE_REDIS_USERNAME=default \
            SCCACHE_REDIS_KEY_PREFIX=mmorpg-server; \
    fi && \
    cargo build --release -p mmorpg-server && \
    (sccache --show-stats || true) && \
    strip target/release/mmorpg-server

# ============================================================================
FROM --platform=linux/amd64 ghcr.io/kbve/chisel-ubuntu-axum:24.04.13 AS runtime

COPY --from=builder --chown=10001:10001 /app/target/release/mmorpg-server /app/mmorpg-server

ENV MMORPG_GAME_ADDR=0.0.0.0:7960
ENV MMORPG_HTTP_ADDR=0.0.0.0:7961
ENV RUST_LOG=info,mmorpg_server=debug

EXPOSE 7960
EXPOSE 7961

ENTRYPOINT ["/app/mmorpg-server"]
