# ============================================================================
# chisel-ubuntu-axum — Shared base images for KBVE Axum services
#
# Two targets:
#   builder  → Rust build environment (cargo-chef, mold, protobuf, ssl, pq,
#              jemalloc-dev, brotli, gzip, Node + pnpm)
#   runtime  → Minimal chiseled Ubuntu (jemalloc, libpq, CA certs)
#
# Published as:
#   ghcr.io/kbve/chisel-ubuntu-axum:24.04.X          (runtime)
#   ghcr.io/kbve/chisel-ubuntu-axum:24.04.X-builder  (builder)
#
# Service Dockerfile usage:
#   FROM ghcr.io/kbve/chisel-ubuntu-axum:24.04.3-builder AS builder
#   COPY src/ src/
#   RUN cargo build --release -p my-service
#
#   FROM ghcr.io/kbve/chisel-ubuntu-axum:24.04.3
#   COPY --from=builder /app/target/release/my-service /app/my-service
#   ENTRYPOINT ["/app/my-service"]
# ============================================================================

# ╔═══════════════════════════════════════════════════════════════════╗
# ║  BUILDER TARGET                                                    ║
# ║  Rust 1.94 + cargo-chef + mold + brotli/gzip + Node 24 + pnpm    ║
# ╚═══════════════════════════════════════════════════════════════════╝

FROM --platform=linux/amd64 rust:1.94-slim AS builder

# ── System build dependencies ────────────────────────────────────────
RUN apt-get update && \
    apt-get upgrade -y && \
    apt-get install -y --no-install-recommends \
        pkg-config \
        libssl-dev \
        libpq-dev \
        libjemalloc-dev \
        protobuf-compiler \
        libprotobuf-dev \
        mold \
        gzip \
        brotli \
        curl \
        ca-certificates && \
    rm -rf /var/lib/apt/lists/*

# ── Rust tooling ─────────────────────────────────────────────────────
RUN rustup target add x86_64-unknown-linux-gnu && \
    cargo install cargo-chef --locked

# ── Node.js + pnpm (for Astro frontend builds) ──────────────────────
ARG NODE_VERSION=24
RUN curl -fsSL https://deb.nodesource.com/setup_${NODE_VERSION}.x | bash - && \
    apt-get install -y --no-install-recommends nodejs && \
    rm -rf /var/lib/apt/lists/* && \
    corepack enable && \
    corepack prepare pnpm@latest --activate

# Prevent Playwright from downloading browsers during pnpm install
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1

WORKDIR /app

# ╔═══════════════════════════════════════════════════════════════════╗
# ║  RUNTIME TARGET                                                    ║
# ║  Chiseled Ubuntu 24.04 + jemalloc + libpq + CA certs             ║
# ╚═══════════════════════════════════════════════════════════════════╝

# ── Chisel the Ubuntu rootfs ─────────────────────────────────────────
FROM --platform=linux/amd64 ubuntu:24.04 AS chisel-stage

RUN apt-get update && apt-get install -y --no-install-recommends wget ca-certificates

ARG CHISEL_VERSION=1.4.0
RUN wget -q "https://github.com/canonical/chisel/releases/download/v${CHISEL_VERSION}/chisel_v${CHISEL_VERSION}_linux_amd64.tar.gz" -O /tmp/chisel.tar.gz && \
    tar -xzf /tmp/chisel.tar.gz -C /usr/local/bin chisel && \
    rm /tmp/chisel.tar.gz

WORKDIR /rootfs
RUN chisel cut --release ubuntu-24.04 --root /rootfs \
        base-files_base \
        base-files_release-info \
        ca-certificates_data \
        libgcc-s1_libs \
        libc6_libs \
        libstdc++6_libs \
        openssl_config && \
    echo 'appuser:x:10001:10001::/nonexistent:/usr/sbin/nologin' >> /rootfs/etc/passwd && \
    echo 'appgroup:x:10001:' >> /rootfs/etc/group && \
    mkdir -p /rootfs/app && chown 10001:10001 /rootfs/app && \
    mkdir -p /rootfs/tmp && chmod 1777 /rootfs/tmp

# ── Extract runtime shared libs (jemalloc + libpq) ──────────────────
FROM --platform=linux/amd64 ubuntu:24.04 AS libs-stage

RUN apt-get update && \
    apt-get install -y --no-install-recommends libjemalloc-dev libpq5 && \
    rm -rf /var/lib/apt/lists/*

# ── Assemble runtime image ──────────────────────────────────────────
FROM --platform=linux/amd64 scratch AS runtime

COPY --from=chisel-stage /rootfs /
COPY --from=libs-stage /usr/lib/x86_64-linux-gnu/libjemalloc.so.2 /usr/lib/x86_64-linux-gnu/libjemalloc.so.2
COPY --from=libs-stage /usr/lib/x86_64-linux-gnu/libpq.so.5* /usr/lib/x86_64-linux-gnu/

ENV LD_PRELOAD=/usr/lib/x86_64-linux-gnu/libjemalloc.so.2
ENV MALLOC_CONF="background_thread:true,dirty_decay_ms:10000,muzzy_decay_ms:10000,lg_tcache_max:32,oversize_threshold:4194304"

WORKDIR /app
USER 10001:10001
