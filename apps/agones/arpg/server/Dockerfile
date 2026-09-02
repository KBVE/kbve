# ============================================================================
# arpg-server — ARPG game server (axum + tokio + simgrid)
# Multi-stage build on the shared chisel base. No godot/wry/rapier, so the
# builder needs no gtk/webkit system libs (simgrid pulls headless bevy only).
# ============================================================================

FROM --platform=linux/amd64 ghcr.io/kbve/chisel-ubuntu-axum:24.04-builder AS planner
ENV CARGO_INCREMENTAL=0

COPY apps/agones/arpg/server/Cargo.workspace.toml Cargo.toml
COPY Cargo.lock ./

COPY apps/agones/arpg/server/Cargo.toml apps/agones/arpg/server/Cargo.toml
COPY crates/simgrid/Cargo.toml crates/simgrid/Cargo.toml
COPY crates/jedi/Cargo.toml crates/jedi/Cargo.toml
COPY crates/kbve-proto/Cargo.toml crates/kbve-proto/Cargo.toml
COPY crates/bevy_items/Cargo.toml crates/bevy_items/Cargo.toml
COPY crates/bevy_inventory/Cargo.toml crates/bevy_inventory/Cargo.toml
COPY crates/bevy_mapdb/Cargo.toml crates/bevy_mapdb/Cargo.toml
COPY crates/bevy_spells/Cargo.toml crates/bevy_spells/Cargo.toml

RUN mkdir -p apps/agones/arpg/server/src && \
    echo "fn main() {}" > apps/agones/arpg/server/src/main.rs && \
    mkdir -p crates/simgrid/src && \
    echo "" > crates/simgrid/src/lib.rs && \
    mkdir -p crates/jedi/src && \
    echo "" > crates/jedi/src/lib.rs && \
    mkdir -p crates/bevy_items/src && \
    echo "" > crates/bevy_items/src/lib.rs && \
    mkdir -p crates/bevy_inventory/src && \
    echo "" > crates/bevy_inventory/src/lib.rs && \
    mkdir -p crates/bevy_mapdb/src && \
    echo "" > crates/bevy_mapdb/src/lib.rs && \
    mkdir -p crates/bevy_spells/src && \
    echo "" > crates/bevy_spells/src/lib.rs

RUN cargo chef prepare --recipe-path recipe.json --bin arpg-server

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
            SCCACHE_REDIS_KEY_PREFIX=arpg-server; \
        echo "sccache: Redis backend enabled"; \
    else \
        echo "sccache: Redis password not provided, falling back to local disk cache"; \
    fi && \
    cargo chef cook --release --recipe-path recipe.json -p arpg-server && \
    (sccache --show-stats || true)

# ============================================================================
FROM --platform=linux/amd64 ghcr.io/kbve/chisel-ubuntu-axum:24.04-builder AS builder
ENV CARGO_INCREMENTAL=0
ENV RUSTFLAGS="-C link-arg=-fuse-ld=mold"

COPY --from=builder-deps /app/target target
COPY --from=builder-deps /usr/local/cargo /usr/local/cargo

COPY apps/agones/arpg/server/Cargo.workspace.toml Cargo.toml
COPY Cargo.lock ./

COPY crates/simgrid crates/simgrid
COPY crates/jedi crates/jedi
COPY crates/kbve-proto crates/kbve-proto
COPY packages/proto packages/proto
COPY crates/bevy_items crates/bevy_items
COPY crates/bevy_inventory crates/bevy_inventory
COPY crates/bevy_mapdb crates/bevy_mapdb
COPY crates/bevy_spells crates/bevy_spells
# arpg-server include_bytes!s the canonical itemdb + mapdb + spelldb + npcdb at compile time.
COPY packages/data/codegen/generated/itemdb-data.binpb packages/data/codegen/generated/itemdb-data.binpb
COPY packages/data/codegen/generated/mapdb-data.binpb packages/data/codegen/generated/mapdb-data.binpb
COPY packages/data/codegen/generated/spelldb-data.binpb packages/data/codegen/generated/spelldb-data.binpb
COPY packages/data/codegen/generated/npcdb-data.json packages/data/codegen/generated/npcdb-data.json
COPY apps/agones/arpg/server apps/agones/arpg/server

RUN --mount=type=cache,target=/usr/local/cargo/registry \
    --mount=type=cache,target=/usr/local/cargo/git \
    --mount=type=cache,target=/usr/local/sccache,id=sccache \
    --mount=type=secret,id=valkey_password,env=SCCACHE_REDIS_PASSWORD,required=false \
    if [ -n "${SCCACHE_REDIS_PASSWORD:-}" ]; then \
        export SCCACHE_REDIS_ENDPOINT=tcp://valkey.valkey.svc.cluster.local:6379 \
            SCCACHE_REDIS_USERNAME=default \
            SCCACHE_REDIS_KEY_PREFIX=arpg-server; \
    fi && \
    cargo build --release -p arpg-server && \
    (sccache --show-stats || true) && \
    strip target/release/arpg-server

# ============================================================================
FROM --platform=linux/amd64 ghcr.io/kbve/chisel-ubuntu-axum:24.04.3 AS runtime

COPY --from=builder --chown=10001:10001 /app/target/release/arpg-server /app/arpg-server

ENV ARPG_SERVER_ADDR=0.0.0.0:7979
ENV RUST_LOG=info,arpg_server=debug

EXPOSE 7979

ENTRYPOINT ["/app/arpg-server"]
