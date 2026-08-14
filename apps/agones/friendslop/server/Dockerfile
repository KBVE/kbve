# ============================================================================
# friendslop-server — authoritative rapier3d sim over WebSocket (axum + tokio)
# Multi-stage build on the shared chisel base. `q` is built with
# `--no-default-features --features net-dedicated`, which excludes godot and the
# desktop platform deps, so the builder needs no gtk/webkit system libs.
# ============================================================================

FROM --platform=linux/amd64 ghcr.io/kbve/chisel-ubuntu-axum:24.04-builder AS planner
ENV CARGO_INCREMENTAL=0

COPY apps/agones/friendslop/server/Cargo.workspace.toml Cargo.toml
COPY Cargo.lock ./

COPY apps/agones/friendslop/server/Cargo.toml apps/agones/friendslop/server/Cargo.toml
COPY packages/rust/q/Cargo.toml packages/rust/q/Cargo.toml
COPY packages/rust/jedi/Cargo.toml packages/rust/jedi/Cargo.toml

RUN mkdir -p apps/agones/friendslop/server/src && \
    echo "fn main() {}" > apps/agones/friendslop/server/src/main.rs && \
    mkdir -p packages/rust/q/src && \
    echo "" > packages/rust/q/src/lib.rs && \
    mkdir -p packages/rust/jedi/src && \
    echo "" > packages/rust/jedi/src/lib.rs && \
    echo "fn main() {}" > packages/rust/jedi/build.rs

RUN cargo chef prepare --recipe-path recipe.json --bin friendslop-server

# ============================================================================
FROM --platform=linux/amd64 ghcr.io/kbve/chisel-ubuntu-axum:24.04-builder AS builder-deps
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
            SCCACHE_REDIS_KEY_PREFIX=friendslop-server; \
        echo "sccache: Redis backend enabled"; \
    else \
        echo "sccache: Redis password not provided, falling back to local disk cache"; \
    fi && \
    cargo chef cook --release --recipe-path recipe.json -p friendslop-server && \
    (sccache --show-stats || true)

# ============================================================================
FROM --platform=linux/amd64 ghcr.io/kbve/chisel-ubuntu-axum:24.04-builder AS builder
ENV CARGO_INCREMENTAL=0
ENV RUSTFLAGS="-C link-arg=-fuse-ld=mold"

COPY --from=builder-deps /app/target target
COPY --from=builder-deps /usr/local/cargo /usr/local/cargo

COPY apps/agones/friendslop/server/Cargo.workspace.toml Cargo.toml
COPY Cargo.lock ./

COPY packages/rust/q packages/rust/q
COPY packages/rust/jedi packages/rust/jedi
COPY apps/agones/friendslop/server apps/agones/friendslop/server

RUN --mount=type=cache,target=/usr/local/cargo/registry \
    --mount=type=cache,target=/usr/local/cargo/git \
    --mount=type=cache,target=/usr/local/sccache,id=sccache \
    --mount=type=secret,id=valkey_password,env=SCCACHE_REDIS_PASSWORD,required=false \
    if [ -n "${SCCACHE_REDIS_PASSWORD:-}" ]; then \
        export SCCACHE_REDIS_ENDPOINT=tcp://valkey.valkey.svc.cluster.local:6379 \
            SCCACHE_REDIS_USERNAME=default \
            SCCACHE_REDIS_KEY_PREFIX=friendslop-server; \
    fi && \
    cargo build --release -p friendslop-server && \
    (sccache --show-stats || true) && \
    strip target/release/friendslop-server

# ============================================================================
FROM --platform=linux/amd64 ghcr.io/kbve/chisel-ubuntu-axum:24.04.3 AS runtime

COPY --from=builder --chown=10001:10001 /app/target/release/friendslop-server /app/friendslop-server

ENV FS_SERVER_ADDR=0.0.0.0:7980
ENV FS_UDP_ADDR=0.0.0.0:7981
ENV RUST_LOG=info,friendslop_server=debug

EXPOSE 7980
EXPOSE 7981/udp

ENTRYPOINT ["/app/friendslop-server"]
