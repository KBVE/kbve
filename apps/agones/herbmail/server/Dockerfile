# ============================================================================
# herbmail-server — Herbmail game server (axum + tokio + simgrid)
# ============================================================================

FROM --platform=linux/amd64 ghcr.io/kbve/chisel-ubuntu-axum:24.04-builder AS planner
ENV CARGO_INCREMENTAL=0

COPY apps/agones/herbmail/server/Cargo.workspace.toml Cargo.toml
COPY Cargo.lock ./

COPY apps/agones/herbmail/server/Cargo.toml apps/agones/herbmail/server/Cargo.toml
COPY packages/rust/simgrid/Cargo.toml packages/rust/simgrid/Cargo.toml
COPY packages/rust/jedi/Cargo.toml packages/rust/jedi/Cargo.toml
COPY packages/rust/herbmail-sim/Cargo.toml packages/rust/herbmail-sim/Cargo.toml

RUN mkdir -p apps/agones/herbmail/server/src && \
    echo "fn main() {}" > apps/agones/herbmail/server/src/main.rs && \
    echo "" > apps/agones/herbmail/server/src/lib.rs && \
    mkdir -p packages/rust/simgrid/src && \
    echo "" > packages/rust/simgrid/src/lib.rs && \
    mkdir -p packages/rust/jedi/src && \
    echo "" > packages/rust/jedi/src/lib.rs && \
    mkdir -p packages/rust/herbmail-sim/src && \
    echo "" > packages/rust/herbmail-sim/src/lib.rs

RUN cargo chef prepare --recipe-path recipe.json --bin herbmail-server

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
            SCCACHE_REDIS_KEY_PREFIX=herbmail-server; \
        echo "sccache: Redis backend enabled"; \
    else \
        echo "sccache: Redis password not provided, falling back to local disk cache"; \
    fi && \
    cargo chef cook --release --recipe-path recipe.json -p herbmail-server && \
    (sccache --show-stats || true)

# ============================================================================
FROM --platform=linux/amd64 ghcr.io/kbve/chisel-ubuntu-axum:24.04-builder AS builder
ENV CARGO_INCREMENTAL=0
ENV RUSTFLAGS="-C link-arg=-fuse-ld=mold"

COPY --from=builder-deps /app/target target
COPY --from=builder-deps /usr/local/cargo /usr/local/cargo

COPY apps/agones/herbmail/server/Cargo.workspace.toml Cargo.toml
COPY Cargo.lock ./

COPY packages/rust/simgrid packages/rust/simgrid
COPY packages/rust/jedi packages/rust/jedi
COPY packages/rust/herbmail-sim packages/rust/herbmail-sim
COPY apps/agones/herbmail/server apps/agones/herbmail/server

RUN --mount=type=cache,target=/usr/local/cargo/registry \
    --mount=type=cache,target=/usr/local/cargo/git \
    --mount=type=cache,target=/usr/local/sccache,id=sccache \
    --mount=type=secret,id=valkey_password,env=SCCACHE_REDIS_PASSWORD,required=false \
    if [ -n "${SCCACHE_REDIS_PASSWORD:-}" ]; then \
        export SCCACHE_REDIS_ENDPOINT=tcp://valkey.valkey.svc.cluster.local:6379 \
            SCCACHE_REDIS_USERNAME=default \
            SCCACHE_REDIS_KEY_PREFIX=herbmail-server; \
    fi && \
    cargo build --release -p herbmail-server --bin herbmail-server && \
    (sccache --show-stats || true) && \
    strip target/release/herbmail-server

# ============================================================================
FROM --platform=linux/amd64 ghcr.io/kbve/chisel-ubuntu-axum:24.04.3 AS runtime

COPY --from=builder --chown=10001:10001 /app/target/release/herbmail-server /app/herbmail-server

ENV HM_SERVER_ADDR=0.0.0.0:7979
ENV RUST_LOG=info,herbmail_server=debug

EXPOSE 7979

ENTRYPOINT ["/app/herbmail-server"]
