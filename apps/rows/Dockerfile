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
ENV CARGO_INCREMENTAL=0

# The real workspace root, with `members` narrowed to the crates this image builds.
# A hand-written stub root used to be enough, but since #15165 every member inherits
# `rust-version` from `[workspace.package]` and its dependency versions from
# `[workspace.dependencies]`, and a stub has neither — `cargo metadata` then fails
# before a single crate is compiled.
COPY Cargo.toml /tmp/workspace-root.toml
RUN sed -e '/^members = \[/,/^\]/c\members = ["apps/rows", "crates/jedi", "crates/holy", "crates/kbve"]' \
        /tmp/workspace-root.toml > Cargo.toml

# Copy all manifests + source for recipe generation
COPY apps/rows/Cargo.toml apps/rows/Cargo.toml
COPY crates/jedi/Cargo.toml crates/jedi/Cargo.toml
COPY crates/holy/Cargo.toml crates/holy/Cargo.toml
COPY crates/kbve/Cargo.toml crates/kbve/Cargo.toml
COPY packages/data/proto/ packages/data/proto/
COPY apps/rows/build.rs apps/rows/build.rs
COPY apps/rows/src/ apps/rows/src/
COPY crates/jedi/src/ crates/jedi/src/
COPY crates/holy/src/ crates/holy/src/
COPY crates/kbve/src/ crates/kbve/src/

RUN cargo chef prepare --recipe-path recipe.json

# ── Stage 2: Cook — build deps only (cached layer) ─────────
FROM --platform=linux/amd64 ghcr.io/kbve/chisel-ubuntu-axum:24.04-builder AS cook
ENV CARGO_INCREMENTAL=0

# The real workspace root, with `members` narrowed to the crates this image builds.
# A hand-written stub root used to be enough, but since #15165 every member inherits
# `rust-version` from `[workspace.package]` and its dependency versions from
# `[workspace.dependencies]`, and a stub has neither — `cargo metadata` then fails
# before a single crate is compiled.
COPY Cargo.toml /tmp/workspace-root.toml
RUN sed -e '/^members = \[/,/^\]/c\members = ["apps/rows", "crates/jedi", "crates/holy", "crates/kbve"]' \
        /tmp/workspace-root.toml > Cargo.toml

# Copy manifests + build.rs (needed for proc macros / build scripts)
COPY apps/rows/Cargo.toml apps/rows/Cargo.toml
COPY crates/jedi/Cargo.toml crates/jedi/Cargo.toml
COPY crates/holy/Cargo.toml crates/holy/Cargo.toml
COPY crates/kbve/Cargo.toml crates/kbve/Cargo.toml
COPY packages/data/proto/ packages/data/proto/
COPY apps/rows/build.rs apps/rows/build.rs

# Cook deps from recipe — this layer is cached until Cargo.toml/Cargo.lock change
COPY --from=planner /app/recipe.json recipe.json
RUN --mount=type=cache,target=/usr/local/cargo/registry \
    --mount=type=cache,target=/usr/local/sccache,id=sccache \
    cargo chef cook --release --recipe-path recipe.json -p rows

# ── Stage 3: Build — compile only our source ────────────────
FROM cook AS builder

# Ensure make is available for tikv-jemalloc-sys compilation (build from source)
RUN dpkg -s make >/dev/null 2>&1 || \
    (apt-get update && apt-get install -y --no-install-recommends make && rm -rf /var/lib/apt/lists/*)

COPY crates/jedi/ crates/jedi/
COPY crates/holy/ crates/holy/
COPY crates/kbve/ crates/kbve/
COPY apps/rows/src/ apps/rows/src/
# Re-copy real manifest: cargo-chef masks crate version to 0.0.1, leaks into env!("CARGO_PKG_VERSION")
COPY apps/rows/Cargo.toml apps/rows/Cargo.toml
RUN --mount=type=cache,target=/usr/local/cargo/registry \
    --mount=type=cache,target=/usr/local/sccache,id=sccache \
    touch apps/rows/src/main.rs && \
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
