# ============================================================================
# kbve-gate — auth reverse-proxy sidecar. Multi-stage cargo-chef build.
#
# Shared chisel base images:
#   ghcr.io/kbve/chisel-ubuntu-axum:24.04-builder  (Rust + cargo-chef + sccache)
#   ghcr.io/kbve/chisel-ubuntu-axum:24.04.3         (chiseled Ubuntu runtime)
# ============================================================================

# [STAGE A] - Cargo Chef Planner
FROM --platform=linux/amd64 ghcr.io/kbve/chisel-ubuntu-axum:24.04-builder AS planner

COPY apps/kbve/kbve-gate/Cargo.workspace.toml Cargo.toml
COPY Cargo.lock ./

COPY apps/kbve/kbve-gate/Cargo.toml apps/kbve/kbve-gate/Cargo.toml
COPY crates/jedi/Cargo.toml crates/jedi/Cargo.toml
COPY crates/kbve-proto/Cargo.toml crates/kbve-proto/Cargo.toml
COPY crates/kbve/Cargo.toml crates/kbve/Cargo.toml
COPY crates/holy/Cargo.toml crates/holy/Cargo.toml
COPY crates/holy-derive/Cargo.toml crates/holy-derive/Cargo.toml

COPY packages/data/proto packages/data/proto

RUN mkdir -p apps/kbve/kbve-gate/src && echo "fn main() {}" > apps/kbve/kbve-gate/src/main.rs && \
    mkdir -p crates/jedi/src && echo "" > crates/jedi/src/lib.rs && \
    mkdir -p crates/holy-derive/src && echo "" > crates/holy-derive/src/lib.rs && \
    mkdir -p crates/kbve-proto/src && echo "" > crates/kbve-proto/src/lib.rs && \
    mkdir -p crates/kbve/src && echo "" > crates/kbve/src/lib.rs && \
    mkdir -p crates/holy/src && echo "" > crates/holy/src/lib.rs

RUN cargo chef prepare --recipe-path recipe.json

# [STAGE B] - Cargo Chef Cook (cache external deps)
FROM --platform=linux/amd64 ghcr.io/kbve/chisel-ubuntu-axum:24.04-builder AS builder-deps
ENV CARGO_INCREMENTAL=0

COPY --from=planner /app/recipe.json recipe.json
COPY --from=planner /app/Cargo.toml /app/Cargo.lock ./
COPY --from=planner /app/apps apps
COPY --from=planner /app/packages packages

RUN --mount=type=cache,target=/usr/local/cargo/registry \
    --mount=type=cache,target=/usr/local/cargo/git \
    --mount=type=cache,target=/usr/local/sccache,id=sccache \
    cargo chef cook --release --recipe-path recipe.json -p kbve-gate

# [STAGE C] - Foundation (compile kbve + jedi + holy from source)
FROM --platform=linux/amd64 ghcr.io/kbve/chisel-ubuntu-axum:24.04-builder AS foundation
ENV CARGO_INCREMENTAL=0

COPY --from=builder-deps /app/target target
COPY --from=builder-deps /usr/local/cargo /usr/local/cargo

COPY --from=planner /app/Cargo.toml ./
COPY Cargo.lock ./

COPY apps/kbve/kbve-gate/Cargo.toml apps/kbve/kbve-gate/Cargo.toml
RUN mkdir -p apps/kbve/kbve-gate/src && \
    echo "fn main() {}" > apps/kbve/kbve-gate/src/main.rs

COPY packages/data/proto packages/data/proto

COPY crates/jedi crates/jedi
COPY crates/kbve-proto crates/kbve-proto
COPY crates/holy-derive crates/holy-derive
COPY packages/proto packages/proto
COPY crates/kbve crates/kbve
COPY crates/holy crates/holy

RUN --mount=type=cache,target=/usr/local/cargo/registry \
    --mount=type=cache,target=/usr/local/cargo/git \
    --mount=type=cache,target=/usr/local/sccache,id=sccache \
    cargo build --release -p kbve -p jedi -p holy

# [STAGE D] - Build Application
FROM foundation AS builder

COPY packages/data/proto packages/data/proto
COPY crates/jedi crates/jedi
COPY crates/kbve-proto crates/kbve-proto
COPY crates/holy-derive crates/holy-derive
COPY packages/proto packages/proto
COPY crates/kbve crates/kbve
COPY crates/holy crates/holy

COPY apps/kbve/kbve-gate apps/kbve/kbve-gate

RUN --mount=type=cache,target=/usr/local/cargo/registry \
    --mount=type=cache,target=/usr/local/cargo/git \
    --mount=type=cache,target=/usr/local/sccache,id=sccache \
    cargo build --release -p kbve-gate && \
    strip target/release/kbve-gate

# [STAGE Z] - Runtime
FROM --platform=linux/amd64 ghcr.io/kbve/chisel-ubuntu-axum:24.04.3 AS runtime

COPY --from=builder --chown=10001:10001 /app/target/release/kbve-gate /app/kbve-gate

ENV GATE_LISTEN=0.0.0.0:5678
ENV RUST_LOG=info

EXPOSE 5678

ENTRYPOINT ["/app/kbve-gate"]
