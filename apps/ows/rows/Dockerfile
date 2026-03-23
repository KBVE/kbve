# ── Stage 1: Build ──────────────────────────────────────────
FROM rust:1.87-slim-bookworm AS builder

RUN apt-get update && apt-get install -y \
    pkg-config libssl-dev protobuf-compiler \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /src

# Copy workspace manifests first for layer caching
COPY Cargo.toml Cargo.lock ./
COPY packages/rust/ packages/rust/
COPY apps/ows/rows/ apps/ows/rows/
COPY packages/data/proto/ packages/data/proto/

# Create dummy main.rs for dependency caching
RUN mkdir -p apps/ows/rows/src && \
    echo 'fn main() {}' > apps/ows/rows/src/main.rs && \
    cargo build --release -p rows 2>/dev/null || true

# Copy real source and rebuild
COPY apps/ows/rows/src/ apps/ows/rows/src/
COPY apps/ows/rows/proto/ apps/ows/rows/proto/
COPY apps/ows/rows/build.rs apps/ows/rows/build.rs
RUN touch apps/ows/rows/src/main.rs && \
    cargo build --release -p rows

# ── Stage 2: Runtime ───────────────────────────────────────
FROM debian:bookworm-slim

RUN apt-get update && apt-get install -y \
    ca-certificates libssl3 \
    && rm -rf /var/lib/apt/lists/*

RUN groupadd -r rows && useradd -r -g rows rows

COPY --from=builder /src/target/release/rows /usr/local/bin/rows

USER rows

ENV HTTP_HOST=0.0.0.0
ENV HTTP_PORT=4322
ENV RUST_LOG=rows=info,tower_http=info

EXPOSE 4322

HEALTHCHECK --interval=15s --timeout=3s --start-period=5s \
    CMD ["/usr/local/bin/rows", "--health-check"] || exit 1

ENTRYPOINT ["/usr/local/bin/rows"]
