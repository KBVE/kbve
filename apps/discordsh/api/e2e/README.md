# discordsh-api-e2e

Vitest smoke suite for the `discordsh-api` HTTP server, run against the built
container.

## What it tests

- Health endpoints (`/health`, `/healthz`)
- Server directory endpoints:
    - `GET /api/servers/list` (pagination, sorting, category filter)
    - `GET /api/servers/{server_id}`
- Security headers (CSP, X-Frame-Options, etc.)
- Response time under 1s

## Running

```bash
# Builds the image, runs the container on :4321, tears it down after
moon run discordsh-api-e2e:e2e

# Against an already-running server on :4321
npx vitest run
```

This suite is not part of `moon run discordsh:e2e` — that pipeline runs the
Playwright suites in [`../../web/e2e/`](../../web/e2e/).

The inherited vitest `test` task is excluded in `moon.yml`: these specs need a
service behind them, so `test` on its own would fail on a refused connection.
