# ============================================================================
# nd-server — Nexus Defense game server (axum + tokio + q::nexus_defense_server)
# Multi-stage Docker build using shared chisel base images.
# ============================================================================

# ============================================================================
# [STAGE A] - Cargo Chef Planner
# ============================================================================
FROM --platform=linux/amd64 ghcr.io/kbve/chisel-ubuntu-axum:24.04-builder AS planner

ENV CARGO_INCREMENTAL=0

COPY apps/godot/nexus-defense/server/Cargo.workspace.toml Cargo.toml
COPY Cargo.lock ./

COPY apps/godot/nexus-defense/server/Cargo.toml apps/godot/nexus-defense/server/Cargo.toml
COPY packages/rust/q/Cargo.toml packages/rust/q/Cargo.toml

COPY packages/data/proto packages/data/proto

RUN mkdir -p apps/godot/nexus-defense/server/src && \
    echo "fn main() {}" > apps/godot/nexus-defense/server/src/main.rs && \
    mkdir -p packages/rust/q/src && \
    echo "" > packages/rust/q/src/lib.rs

RUN cargo chef prepare --recipe-path recipe.json --bin nd-server

# ============================================================================
# [STAGE B] - Cargo Chef Cook (cache external dependencies)
# ============================================================================
FROM --platform=linux/amd64 ghcr.io/kbve/chisel-ubuntu-axum:24.04-builder AS builder-deps
ENV CARGO_INCREMENTAL=0
ENV RUSTFLAGS="-C link-arg=-fuse-ld=mold"

# wry is a target-unconditional dep of the q crate (gated only at source level
# behind the `client` feature). Pull in its system deps so cargo-chef's cook
# pass can compile glib-sys / gtk-sys / webkit2gtk-sys even though the server
# binary never links them at runtime. Tracked: gate wry behind `dep:wry` so
# `server`-only builds skip it entirely.
RUN apt-get update && \
    (apt-get install -y --no-install-recommends --fix-missing \
        libglib2.0-dev libgtk-3-dev libsoup-3.0-dev \
        libwebkit2gtk-4.1-dev libjavascriptcoregtk-4.1-dev pkg-config || \
     apt-get install -y --no-install-recommends --fix-missing \
        libglib2.0-dev libgtk-3-dev libsoup-3.0-dev \
        libwebkit2gtk-4.1-dev libjavascriptcoregtk-4.1-dev pkg-config) && \
    rm -rf /var/lib/apt/lists/*

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
            SCCACHE_REDIS_KEY_PREFIX=nd-server; \
        echo "sccache: Redis backend enabled"; \
    else \
        echo "sccache: Redis password not provided, falling back to local disk cache"; \
    fi && \
    cargo chef cook --release --recipe-path recipe.json -p nd-server && \
    (sccache --show-stats || true)

# ============================================================================
# [STAGE C] - Build application from real source
# ============================================================================
FROM --platform=linux/amd64 ghcr.io/kbve/chisel-ubuntu-axum:24.04-builder AS builder
ENV CARGO_INCREMENTAL=0
ENV RUSTFLAGS="-C link-arg=-fuse-ld=mold"

RUN apt-get update && \
    (apt-get install -y --no-install-recommends --fix-missing \
        libglib2.0-dev libgtk-3-dev libsoup-3.0-dev \
        libwebkit2gtk-4.1-dev libjavascriptcoregtk-4.1-dev pkg-config || \
     apt-get install -y --no-install-recommends --fix-missing \
        libglib2.0-dev libgtk-3-dev libsoup-3.0-dev \
        libwebkit2gtk-4.1-dev libjavascriptcoregtk-4.1-dev pkg-config) && \
    rm -rf /var/lib/apt/lists/*

COPY --from=builder-deps /app/target target
COPY --from=builder-deps /usr/local/cargo /usr/local/cargo

COPY apps/godot/nexus-defense/server/Cargo.workspace.toml Cargo.toml
COPY Cargo.lock ./

COPY packages/data/proto packages/data/proto
COPY packages/rust/q packages/rust/q
COPY apps/godot/nexus-defense/server apps/godot/nexus-defense/server

RUN --mount=type=cache,target=/usr/local/cargo/registry \
    --mount=type=cache,target=/usr/local/cargo/git \
    --mount=type=cache,target=/usr/local/sccache,id=sccache \
    --mount=type=secret,id=valkey_password,env=SCCACHE_REDIS_PASSWORD,required=false \
    if [ -n "${SCCACHE_REDIS_PASSWORD:-}" ]; then \
        export SCCACHE_REDIS_ENDPOINT=tcp://valkey.valkey.svc.cluster.local:6379 \
            SCCACHE_REDIS_USERNAME=default \
            SCCACHE_REDIS_KEY_PREFIX=nd-server; \
    fi && \
    cargo build --release -p nd-server && \
    (sccache --show-stats || true) && \
    strip target/release/nd-server

# ============================================================================
# [STAGE Z] - Runtime image
# ============================================================================
FROM --platform=linux/amd64 ghcr.io/kbve/chisel-ubuntu-axum:24.04.3 AS runtime

COPY --from=builder --chown=10001:10001 /app/target/release/nd-server /app/nd-server
COPY --chown=10001:10001 apps/godot/nexus-defense/server/Cargo.toml /app/Cargo.toml

ENV ND_SERVER_ADDR=0.0.0.0:7878
ENV RUST_LOG=info,nd_server=debug

EXPOSE 7878

ENTRYPOINT ["/app/nd-server"]
