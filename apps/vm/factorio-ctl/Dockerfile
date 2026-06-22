# ============================================================================
# factorio-ctl — Multi-stage Docker build
#
# Builder uses the shared chisel base image:
#   ghcr.io/kbve/chisel-ubuntu-axum:24.04-builder  (Rust 1.94 + cargo-chef)
# Runtime is a slim Ubuntu with CA certs only — the service talks to the
# in-cluster Kubernetes API (Agones) and ClickHouse over HTTPS/HTTP.
# ============================================================================

# ============================================================================
# [STAGE A] - Cargo Chef Planner
# ============================================================================
FROM --platform=linux/amd64 ghcr.io/kbve/chisel-ubuntu-axum:24.04-builder AS planner
ENV CARGO_INCREMENTAL=0

COPY apps/vm/factorio-ctl/Cargo.workspace.toml Cargo.toml
COPY Cargo.lock ./
COPY apps/vm/factorio-ctl/Cargo.toml apps/vm/factorio-ctl/Cargo.toml

COPY packages/rust/jedi packages/rust/jedi

RUN mkdir -p apps/vm/factorio-ctl/src && \
    echo "fn main() {}" > apps/vm/factorio-ctl/src/main.rs

RUN cargo chef prepare --recipe-path recipe.json

# ============================================================================
# [STAGE B] - Cargo Chef Cook (Cache Dependencies)
# ============================================================================
FROM --platform=linux/amd64 ghcr.io/kbve/chisel-ubuntu-axum:24.04-builder AS builder-deps
ENV CARGO_INCREMENTAL=0

COPY --from=planner /app/recipe.json recipe.json
COPY --from=planner /app/Cargo.toml /app/Cargo.lock ./
COPY --from=planner /app/apps apps
COPY --from=planner /app/packages packages

RUN --mount=type=cache,target=/usr/local/cargo/registry \
    --mount=type=cache,target=/usr/local/cargo/git \
    --mount=type=cache,target=/usr/local/sccache,id=sccache \
    cargo chef cook --release --recipe-path recipe.json -p factorio-ctl

# ============================================================================
# [STAGE C] - Build Application
# ============================================================================
FROM --platform=linux/amd64 ghcr.io/kbve/chisel-ubuntu-axum:24.04-builder AS builder
ENV CARGO_INCREMENTAL=0

COPY --from=builder-deps /app/target target
COPY --from=builder-deps /usr/local/cargo /usr/local/cargo

COPY --from=planner /app/Cargo.toml ./

COPY apps/vm/factorio-ctl apps/vm/factorio-ctl
COPY packages/rust/jedi packages/rust/jedi

RUN --mount=type=cache,target=/usr/local/cargo/registry \
    --mount=type=cache,target=/usr/local/cargo/git \
    --mount=type=cache,target=/usr/local/sccache,id=sccache \
    cargo build --release -p factorio-ctl && \
    strip target/release/factorio-ctl

# ============================================================================
# [STAGE Z] - Runtime
# ============================================================================
FROM --platform=linux/amd64 ubuntu:24.04 AS runtime

RUN apt-get update && \
    apt-get install -y --no-install-recommends ca-certificates && \
    rm -rf /var/lib/apt/lists/* && \
    groupadd -g 10001 appgroup && \
    useradd -u 10001 -g appgroup -s /bin/false appuser

COPY --from=builder /app/target/release/factorio-ctl /usr/local/bin/factorio-ctl

ENV FACTORIO_CTL_PORT=9002
ENV RUST_LOG=factorio_ctl=info,tower_http=info

USER 10001:10001
EXPOSE 9002

ENTRYPOINT ["factorio-ctl"]
