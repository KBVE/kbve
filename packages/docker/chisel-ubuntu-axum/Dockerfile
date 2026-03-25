# ============================================================================
# chisel-ubuntu-axum — Shared chiseled Ubuntu runtime base for KBVE Axum services
#
# Includes: chiseled Ubuntu 24.04 rootfs + jemalloc + libpq + CA certs
# Published to: ghcr.io/kbve/chisel-ubuntu-axum:24.04
#
# Usage in service Dockerfiles:
#   FROM ghcr.io/kbve/chisel-ubuntu-axum:24.04 AS runtime
# ============================================================================

# ── Stage 1: Chisel the Ubuntu rootfs ────────────────────────────────
FROM --platform=linux/amd64 ubuntu:24.04 AS chisel-builder

RUN apt-get update && apt-get install -y --no-install-recommends wget ca-certificates

# Install chisel from GitHub releases (avoids 200MB+ Go SDK)
ARG CHISEL_VERSION=1.1.0
RUN wget -q "https://github.com/canonical/chisel/releases/download/v${CHISEL_VERSION}/chisel_v${CHISEL_VERSION}_linux_amd64.tar.gz" -O /tmp/chisel.tar.gz && \
    tar -xzf /tmp/chisel.tar.gz -C /usr/local/bin chisel && \
    rm /tmp/chisel.tar.gz && \
    chisel --version

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
    mkdir -p /rootfs/app && chown 10001:10001 /rootfs/app

# ── Stage 2: Extract jemalloc ────────────────────────────────────────
FROM --platform=linux/amd64 ubuntu:24.04 AS jemalloc

RUN apt-get update && \
    apt-get install -y --no-install-recommends libjemalloc-dev && \
    rm -rf /var/lib/apt/lists/*

# ── Stage 3: Extract libpq ──────────────────────────────────────────
FROM --platform=linux/amd64 ubuntu:24.04 AS libpq-runtime

RUN apt-get update && \
    apt-get install -y --no-install-recommends libpq5 && \
    rm -rf /var/lib/apt/lists/*

# ── Final: Assemble runtime image ───────────────────────────────────
FROM --platform=linux/amd64 scratch

COPY --from=chisel-builder /rootfs /
COPY --from=jemalloc /usr/lib/x86_64-linux-gnu/libjemalloc.so.2 /usr/lib/x86_64-linux-gnu/libjemalloc.so.2
COPY --from=libpq-runtime /usr/lib/x86_64-linux-gnu/libpq.so.5* /usr/lib/x86_64-linux-gnu/

# Default jemalloc configuration for Axum services
ENV LD_PRELOAD=/usr/lib/x86_64-linux-gnu/libjemalloc.so.2
ENV MALLOC_CONF="background_thread:true,dirty_decay_ms:10000,muzzy_decay_ms:10000,lg_tcache_max:32,oversize_threshold:4194304"

WORKDIR /app
USER 10001:10001
