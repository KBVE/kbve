# syntax=docker/dockerfile:1
# ============================================================================
# rows — Multi-stage Docker build
#
# Uses shared chisel base images:
#   ghcr.io/kbve/chisel-ubuntu-axum:24.04-builder  (Rust + cargo-chef + sccache)
#   ghcr.io/kbve/chisel-ubuntu-axum:24.04.3         (chiseled Ubuntu + jemalloc + libpq)
# ============================================================================

# ── Stage 1: Plan — generate dependency recipe ──────────────
FROM --platform=linux/amd64 ghcr.io/kbve/chisel-ubuntu-axum:24.04-builder AS planner

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
FROM --platform=linux/amd64 ghcr.io/kbve/chisel-ubuntu-axum:24.04-builder AS cook
ENV CARGO_INCREMENTAL=0

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
    --mount=type=cache,target=/usr/local/sccache,id=sccache \
    cargo chef cook --release --recipe-path recipe.json -p rows

# ── Stage 3: Build — compile only our source ────────────────
FROM cook AS builder

# Ensure make is available for tikv-jemalloc-sys compilation (build from source)
RUN dpkg -s make >/dev/null 2>&1 || \
    (apt-get update && apt-get install -y --no-install-recommends make && rm -rf /var/lib/apt/lists/*)

COPY packages/rust/jedi/ packages/rust/jedi/
COPY packages/rust/kbve/ packages/rust/kbve/
COPY apps/ows/rows/src/ apps/ows/rows/src/
RUN --mount=type=cache,target=/usr/local/cargo/registry \
    --mount=type=cache,target=/usr/local/sccache,id=sccache \
    touch apps/ows/rows/src/main.rs && \
    cargo build --release -p rows --features jemalloc && \
    strip target/release/rows

# ── Stage 4: Runtime ────────────────────────────────────────
FROM --platform=linux/amd64 ghcr.io/kbve/chisel-ubuntu-axum:24.04.3 AS runtime

COPY --from=builder --chown=10001:10001 /app/target/release/rows /app/rows

ENV HTTP_HOST=0.0.0.0
ENV HTTP_PORT=4322
ENV RUST_LOG=rows=info,tower_http=info

EXPOSE 4322
EXPOSE 4323

HEALTHCHECK --interval=15s --timeout=3s --start-period=5s \
    CMD ["/app/rows", "--health-check"] || exit 1

ENTRYPOINT ["/app/rows"]
