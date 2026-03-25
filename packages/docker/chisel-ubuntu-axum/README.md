# chisel-ubuntu-axum

Shared chiseled Ubuntu 24.04 runtime base image for KBVE Axum services.

## Contents

- **Chiseled Ubuntu 24.04** — minimal rootfs via [chisel](https://github.com/canonical/chisel) (no shell, no package manager)
- **jemalloc** — pre-configured via `LD_PRELOAD` for better memory allocation
- **libpq5** — PostgreSQL client library for database connectivity
- **CA certificates** — for HTTPS outbound calls
- **Non-root user** — `appuser:10001` with `/app` workdir

## Usage

```dockerfile
FROM ghcr.io/kbve/chisel-ubuntu-axum:24.04 AS runtime

COPY --from=builder --chown=10001:10001 /app/target/release/my-service /app/my-service

ENV HTTP_HOST=0.0.0.0
ENV HTTP_PORT=4321
EXPOSE 4321
USER 10001:10001
ENTRYPOINT ["/app/my-service"]
```

## Services using this base

- `axum-discordsh` (planned)
- `axum-kbve` (planned)
- `axum-memes` (planned)
- `axum-herbmail` (planned)
- `axum-chuckrpg` (planned)
- `axum-cryptothrone` (planned)

## Building

```bash
npx nx run chisel-ubuntu-axum:container
# Or manually:
docker build -t ghcr.io/kbve/chisel-ubuntu-axum:24.04 packages/docker/chisel-ubuntu-axum/
```

## Environment Variables (pre-configured)

| Variable      | Value                                        | Description        |
| ------------- | -------------------------------------------- | ------------------ |
| `LD_PRELOAD`  | `/usr/lib/x86_64-linux-gnu/libjemalloc.so.2` | jemalloc allocator |
| `MALLOC_CONF` | `background_thread:true,...`                 | jemalloc tuning    |
