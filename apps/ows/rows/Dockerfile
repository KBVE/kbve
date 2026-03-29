# syntax=docker/dockerfile:1
# ── Stage 1: Plan — generate dependency recipe ──────────────
FROM rust:1.94-slim-bookworm AS planner
RUN cargo install cargo-chef
WORKDIR /src

# Create workspace
RUN printf '[workspace]\nmembers = ["apps/ows/rows", "packages/rust/jedi", "packages/rust/kbve"]\nresolver = "2"\n' > Cargo.toml

# Copy all manifests + source for recipe generation
COPY apps/ows/rows/Cargo.toml apps/ows/rows/Cargo.toml
COPY packages/rust/jedi/Cargo.toml packages/rust/jedi/Cargo.toml
COPY packages/rust/kbve/Cargo.toml packages/rust/kbve/Cargo.toml
COPY packages/data/proto/ packages/data/proto/
COPY apps/ows/rows/build.rs apps/ows/rows/build.rs
COPY apps/ows/rows/src/ apps/ows/rows/src/
COPY packages/rust/jedi/src/ packages/rust/jedi/src/
COPY packages/rust/kbve/src/ packages/rust/kbve/src/

RUN cargo chef prepare --recipe-path recipe.json

# ── Stage 2: Cook — build deps only (cached layer) ─────────
FROM rust:1.94-slim-bookworm AS cook

RUN apt-get update && apt-get install -y \
    pkg-config libssl-dev protobuf-compiler curl \
    && rm -rf /var/lib/apt/lists/*

RUN cargo install cargo-chef
WORKDIR /src

# Create workspace
RUN printf '[workspace]\nmembers = ["apps/ows/rows", "packages/rust/jedi", "packages/rust/kbve"]\nresolver = "2"\n' > Cargo.toml

# Copy manifests + build.rs (needed for proc macros / build scripts)
COPY apps/ows/rows/Cargo.toml apps/ows/rows/Cargo.toml
COPY packages/rust/jedi/Cargo.toml packages/rust/jedi/Cargo.toml
COPY packages/rust/kbve/Cargo.toml packages/rust/kbve/Cargo.toml
COPY packages/data/proto/ packages/data/proto/
COPY apps/ows/rows/build.rs apps/ows/rows/build.rs

# Cook deps from recipe — this layer is cached until Cargo.toml/Cargo.lock change
COPY --from=planner /src/recipe.json recipe.json
RUN --mount=type=cache,target=/usr/local/cargo/registry \
    cargo chef cook --release --recipe-path recipe.json -p rows

# ── Stage 3: Build — compile only our source ────────────────
FROM cook AS builder

COPY packages/rust/jedi/ packages/rust/jedi/
COPY packages/rust/kbve/ packages/rust/kbve/
COPY apps/ows/rows/src/ apps/ows/rows/src/
RUN --mount=type=cache,target=/usr/local/cargo/registry \
    touch apps/ows/rows/src/main.rs && \
    cargo build --release -p rows && \
    cp target/release/rows /usr/local/bin/rows

# ── Stage 4: Runtime ────────────────────────────────────────
FROM debian:bookworm-slim

RUN apt-get update && apt-get install -y \
    ca-certificates libssl3 \
    && rm -rf /var/lib/apt/lists/*

RUN groupadd -r rows && useradd -r -g rows rows

COPY --from=builder /usr/local/bin/rows /usr/local/bin/rows

USER rows

ENV HTTP_HOST=0.0.0.0
ENV HTTP_PORT=4322
ENV RUST_LOG=rows=info,tower_http=info

EXPOSE 4322
EXPOSE 4323

HEALTHCHECK --interval=15s --timeout=3s --start-period=5s \
    CMD ["/usr/local/bin/rows", "--health-check"] || exit 1

ENTRYPOINT ["/usr/local/bin/rows"]
