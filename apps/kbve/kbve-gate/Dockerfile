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
COPY packages/rust/jedi/Cargo.toml packages/rust/jedi/Cargo.toml
COPY packages/rust/kbve/Cargo.toml packages/rust/kbve/Cargo.toml
COPY packages/rust/holy/Cargo.toml packages/rust/holy/Cargo.toml

COPY packages/data/proto packages/data/proto

RUN mkdir -p apps/kbve/kbve-gate/src && echo "fn main() {}" > apps/kbve/kbve-gate/src/main.rs && \
    mkdir -p packages/rust/jedi/src && echo "" > packages/rust/jedi/src/lib.rs && \
    mkdir -p packages/rust/kbve/src && echo "" > packages/rust/kbve/src/lib.rs && \
    mkdir -p packages/rust/holy/src && echo "" > packages/rust/holy/src/lib.rs

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

COPY packages/rust/jedi packages/rust/jedi
COPY packages/rust/kbve packages/rust/kbve
COPY packages/rust/holy packages/rust/holy

RUN --mount=type=cache,target=/usr/local/cargo/registry \
    --mount=type=cache,target=/usr/local/cargo/git \
    --mount=type=cache,target=/usr/local/sccache,id=sccache \
    cargo build --release -p kbve -p jedi -p holy

# [STAGE D] - Build Application
FROM foundation AS builder

COPY packages/data/proto packages/data/proto
COPY packages/rust/jedi packages/rust/jedi
COPY packages/rust/kbve packages/rust/kbve
COPY packages/rust/holy packages/rust/holy

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
