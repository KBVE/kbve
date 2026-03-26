# chisel-ubuntu-axum

Shared base images for KBVE Axum services — one for building, one for running.

## Images

### Runtime (`ghcr.io/kbve/chisel-ubuntu-axum:24.04.X`)

Minimal chiseled Ubuntu 24.04 for production containers (~15MB):

| Component           | Details                                                                                                |
| ------------------- | ------------------------------------------------------------------------------------------------------ |
| **Base**            | Chiseled Ubuntu 24.04 via [chisel](https://github.com/canonical/chisel) — no shell, no package manager |
| **jemalloc**        | Pre-configured via `LD_PRELOAD` with tuned `MALLOC_CONF`                                               |
| **libpq5**          | PostgreSQL client library for database connectivity                                                    |
| **CA certificates** | For HTTPS/TLS outbound connections                                                                     |
| **User**            | Non-root `appuser:10001` with `/app` workdir                                                           |

### Builder (`ghcr.io/kbve/chisel-ubuntu-axum:24.04.X-builder`)

Full build environment for Rust + Astro services:

| Component             | Version | Purpose                             |
| --------------------- | ------- | ----------------------------------- |
| **Rust**              | 1.94    | Axum service compilation            |
| **cargo-chef**        | latest  | Dependency layer caching for Docker |
| **Node.js**           | 24      | Astro frontend builds               |
| **pnpm**              | latest  | Package management (via corepack)   |
| **protobuf-compiler** | system  | Proto schema compilation            |
| **libssl-dev**        | system  | TLS/SSL build headers               |
| **libpq-dev**         | system  | PostgreSQL build headers            |
| **libjemalloc-dev**   | system  | jemalloc build headers              |
| **pkg-config**        | system  | Library discovery                   |

`PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1` is pre-set to avoid 600MB+ browser downloads during `pnpm install`.

## Usage

```dockerfile
# ── Build stage ──────────────────────────────────
FROM ghcr.io/kbve/chisel-ubuntu-axum:24.04.2-builder AS builder

# Astro frontend (if applicable)
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile
COPY apps/my-app/astro/ apps/my-app/astro/
RUN pnpm exec astro build

# Rust binary
COPY Cargo.toml Cargo.lock ./
COPY src/ src/
RUN cargo build --release -p my-service && strip target/release/my-service

# ── Runtime stage ────────────────────────────────
FROM ghcr.io/kbve/chisel-ubuntu-axum:24.04.2

COPY --from=builder --chown=10001:10001 /app/target/release/my-service /app/my-service

ENV HTTP_HOST=0.0.0.0
ENV HTTP_PORT=4321
EXPOSE 4321
USER 10001:10001
ENTRYPOINT ["/app/my-service"]
```

## Building & Testing

```bash
# Build both images (runtime + builder)
./kbve.sh -nx run chisel-ubuntu-axum:container

# Run e2e validation against both images
./kbve.sh -nx run chisel-ubuntu-axum:test

# Individual targets
./kbve.sh -nx run chisel-ubuntu-axum:containerx-runtime
./kbve.sh -nx run chisel-ubuntu-axum:containerx-builder
```

### What the test target validates

**Runtime image:**

- Binary execution works (`/usr/bin/env true`)
- `libjemalloc.so.2` is present
- `libpq.so.5` is present

**Builder image:**

- `cargo --version` — Rust compiler
- `cargo chef --version` — Dependency caching
- `node --version` — Node.js runtime
- `pnpm --version` — Package manager
- `protoc --version` — Protobuf compiler
- `pkg-config --libs libpq` — Library discovery

## Versioning

`24.04.X` — `24.04` = Ubuntu base version, `X` = our patch number.

| File                     | Purpose                   |
| ------------------------ | ------------------------- |
| `version.toml`           | Current published version |
| `chisel.mdx` frontmatter | Target version            |

CI compares the two — when they differ, Docker publish triggers. Post-publish sync updates `version.toml` to match.

## Services using this base

| Service             | Status  |
| ------------------- | ------- |
| `axum-discordsh`    | planned |
| `axum-kbve`         | planned |
| `axum-memes`        | planned |
| `axum-herbmail`     | planned |
| `axum-chuckrpg`     | planned |
| `axum-cryptothrone` | planned |
| `rows`              | planned |

## Environment Variables (runtime, pre-configured)

| Variable      | Value                                                                                                          | Description        |
| ------------- | -------------------------------------------------------------------------------------------------------------- | ------------------ |
| `LD_PRELOAD`  | `/usr/lib/x86_64-linux-gnu/libjemalloc.so.2`                                                                   | jemalloc allocator |
| `MALLOC_CONF` | `background_thread:true,dirty_decay_ms:10000,muzzy_decay_ms:10000,lg_tcache_max:32,oversize_threshold:4194304` | jemalloc tuning    |

## Environment Variables (builder, pre-configured)

| Variable                           | Value | Description                       |
| ---------------------------------- | ----- | --------------------------------- |
| `PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD` | `1`   | Skip Playwright browser downloads |
