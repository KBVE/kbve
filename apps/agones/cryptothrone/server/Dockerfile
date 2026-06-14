# ============================================================================
# cryptothrone-server — CryptoThrone game server (axum + tokio + simgrid)
# Multi-stage build on the shared chisel base. No godot/wry/rapier, so the
# builder needs no gtk/webkit system libs (simgrid pulls headless bevy only).
# ============================================================================

FROM --platform=linux/amd64 ghcr.io/kbve/chisel-ubuntu-axum:24.04-builder AS planner
ENV CARGO_INCREMENTAL=0

COPY apps/agones/cryptothrone/server/Cargo.workspace.toml Cargo.toml
COPY Cargo.lock ./

COPY apps/agones/cryptothrone/server/Cargo.toml apps/agones/cryptothrone/server/Cargo.toml
COPY packages/rust/simgrid/Cargo.toml packages/rust/simgrid/Cargo.toml
COPY packages/rust/jedi/Cargo.toml packages/rust/jedi/Cargo.toml

RUN mkdir -p apps/agones/cryptothrone/server/src && \
    echo "fn main() {}" > apps/agones/cryptothrone/server/src/main.rs && \
    mkdir -p packages/rust/simgrid/src && \
    echo "" > packages/rust/simgrid/src/lib.rs && \
    mkdir -p packages/rust/jedi/src && \
    echo "" > packages/rust/jedi/src/lib.rs

RUN cargo chef prepare --recipe-path recipe.json --bin cryptothrone-server

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
            SCCACHE_REDIS_KEY_PREFIX=cryptothrone-server; \
        echo "sccache: Redis backend enabled"; \
    else \
        echo "sccache: Redis password not provided, falling back to local disk cache"; \
    fi && \
    cargo chef cook --release --recipe-path recipe.json -p cryptothrone-server && \
    (sccache --show-stats || true)

# ============================================================================
FROM --platform=linux/amd64 ghcr.io/kbve/chisel-ubuntu-axum:24.04-builder AS builder
ENV CARGO_INCREMENTAL=0
ENV RUSTFLAGS="-C link-arg=-fuse-ld=mold"

COPY --from=builder-deps /app/target target
COPY --from=builder-deps /usr/local/cargo /usr/local/cargo

COPY apps/agones/cryptothrone/server/Cargo.workspace.toml Cargo.toml
COPY Cargo.lock ./

COPY packages/rust/simgrid packages/rust/simgrid
COPY packages/rust/jedi packages/rust/jedi
COPY packages/data/codegen/generated/npcdb-data.json packages/data/codegen/generated/npcdb-data.json
COPY apps/agones/cryptothrone/server apps/agones/cryptothrone/server

RUN --mount=type=cache,target=/usr/local/cargo/registry \
    --mount=type=cache,target=/usr/local/cargo/git \
    --mount=type=cache,target=/usr/local/sccache,id=sccache \
    --mount=type=secret,id=valkey_password,env=SCCACHE_REDIS_PASSWORD,required=false \
    if [ -n "${SCCACHE_REDIS_PASSWORD:-}" ]; then \
        export SCCACHE_REDIS_ENDPOINT=tcp://valkey.valkey.svc.cluster.local:6379 \
            SCCACHE_REDIS_USERNAME=default \
            SCCACHE_REDIS_KEY_PREFIX=cryptothrone-server; \
    fi && \
    cargo build --release -p cryptothrone-server && \
    (sccache --show-stats || true) && \
    strip target/release/cryptothrone-server

# ============================================================================
FROM --platform=linux/amd64 ghcr.io/kbve/chisel-ubuntu-axum:24.04.3 AS runtime

COPY --from=builder --chown=10001:10001 /app/target/release/cryptothrone-server /app/cryptothrone-server

ENV CT_SERVER_ADDR=0.0.0.0:7979
ENV RUST_LOG=info,cryptothrone_server=debug

EXPOSE 7979

ENTRYPOINT ["/app/cryptothrone-server"]
