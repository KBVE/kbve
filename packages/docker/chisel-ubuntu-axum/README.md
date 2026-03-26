# chisel-ubuntu-axum

Shared base images for KBVE Axum services — one for building, one for running.

## Images

### Runtime (`ghcr.io/kbve/chisel-ubuntu-axum:24.04.X`)

Minimal chiseled Ubuntu 24.04 for production containers:

- **Chiseled Ubuntu 24.04** — no shell, no package manager
- **jemalloc** — pre-configured via `LD_PRELOAD`
- **libpq5** — PostgreSQL client library
- **CA certificates** — for HTTPS/TLS
- **Non-root user** — `appuser:10001`

### Builder (`ghcr.io/kbve/chisel-ubuntu-axum:24.04.X-builder`)

Full build environment for Rust + Astro services:

- **Rust 1.94** + `cargo-chef` for dependency caching
- **Node.js 24** + `pnpm` for Astro frontend builds
- **Build libs** — libssl-dev, libpq-dev, libjemalloc-dev, protobuf-compiler
- **Playwright skip** — `PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1`

## Usage

```dockerfile
# ── Build stage ──────────────────────────────────
FROM ghcr.io/kbve/chisel-ubuntu-axum:24.04.2-builder AS builder

COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

COPY Cargo.toml Cargo.lock ./
COPY src/ src/
RUN cargo build --release -p my-service

# ── Runtime stage ────────────────────────────────
FROM ghcr.io/kbve/chisel-ubuntu-axum:24.04.2

COPY --from=builder --chown=10001:10001 /app/target/release/my-service /app/my-service

EXPOSE 4321
USER 10001:10001
ENTRYPOINT ["/app/my-service"]
```

## Building

```bash
# Both targets
npx nx run chisel-ubuntu-axum:container

# Individual targets
npx nx run chisel-ubuntu-axum:containerx-runtime
npx nx run chisel-ubuntu-axum:containerx-builder
```

## Versioning

`24.04.X` — `24.04` = Ubuntu base, `X` = our patch number.

Tracked via `version.toml` (current) vs MDX frontmatter (target). CI publishes when they differ.
