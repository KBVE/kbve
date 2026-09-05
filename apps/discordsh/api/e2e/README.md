# discordsh-api-e2e

End-to-end smoke tests for the `discordsh-api` HTTP server.

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
nx e2e discordsh-api-e2e

# Run locally (assumes discordsh-api running on :4321)
cd apps/discordsh/api/e2e
npx vitest run
```

## CI integration

Tests run automatically in GitHub Actions when `discordsh-api` changes.

See: https://github.com/KBVE/kbve/issues/12367
