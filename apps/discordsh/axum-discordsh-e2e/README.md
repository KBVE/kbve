# axum-discordsh-e2e

End-to-end smoke tests for the `axum-discordsh` HTTP server.

## What it tests

- Health endpoints (`/health`, `/healthz`)
- API server listing endpoints:
  - `GET /api/servers/list` (pagination, sorting, category filter)
  - `GET /api/servers/:server_id` (single server fetch)
- Security headers (CSP, X-Frame-Options, etc.)
- Performance (response time < 1s)

## Running tests

```bash
# Run e2e suite (builds container, runs tests, cleans up)
nx e2e axum-discordsh-e2e

# Run locally (assumes axum-discordsh running on :4321)
cd apps/discordsh/axum-discordsh-e2e
npx vitest run
```

## CI integration

Tests run automatically in GitHub Actions when `axum-discordsh` changes.

See: https://github.com/KBVE/kbve/issues/12367
