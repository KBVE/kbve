# discordsh POC: Mockoon Local E2E

Proof-of-concept `docker-compose` environment that runs the discordsh bot against
mock API backends ([Mockoon](https://mockoon.com/cli/)) so developers can test the
full GitHub → Discord pipeline locally without real credentials.

## Architecture

```
docker-compose-poc-dev.yaml
├── discordsh            (real bot binary, existing Dockerfile)
├── mockoon-github       (mockoon/cli with github-mock.json, port 4010)
└── mockoon-discord      (mockoon/cli with discord-mock.json, port 4011)
```

## Quick Start

```bash
# From the repo root:
docker compose -f apps/discordsh/poc/docker-compose-poc-dev.yaml up --build
```

The Mockoon containers start first (healthchecked). The bot container starts once
both mocks are healthy.

## What Gets Mocked

### GitHub API (port 4010) — fully redirected via `GITHUB_API_BASE_URL`

| Route                                  | Description                                           |
| -------------------------------------- | ----------------------------------------------------- |
| `GET /repos/:owner/:repo/issues`       | Canned issue list with labels (includes stale issues) |
| `GET /repos/:owner/:repo/pulls`        | Canned PR list with draft flags                       |
| `GET /repos/:owner/:repo`              | Repo metadata                                         |
| `GET /repos/unauthorized/:repo/issues` | 401 error scenario                                    |
| `GET /repos/forbidden/:repo/issues`    | 403 rate-limit error scenario                         |
| `GET /repos/notfound/:repo/issues`     | 404 error scenario                                    |

### Discord REST API (port 4011) — for request inspection

| Route                                            | Description                                  |
| ------------------------------------------------ | -------------------------------------------- |
| `POST /api/v10/channels/:id/messages`            | Accepts embed payloads, returns mock message |
| `GET /api/v10/gateway/bot`                       | Mock gateway info                            |
| `GET /api/v10/users/@me`                         | Mock bot user                                |
| `POST /api/v10/interactions/:id/:token/callback` | Interaction ACK                              |
| `PUT /api/v10/applications/:appId/commands`      | Bulk command registration                    |

## Env Var Override: `GITHUB_API_BASE_URL`

The bot reads `GITHUB_API_BASE_URL` at runtime (defaults to `https://api.github.com`).
When set, all `GitHubClient` calls (both slash commands and the scheduler) are redirected
to the specified URL. The docker-compose sets this to `http://mockoon-github:4010`.

## Inspecting Requests

Mockoon logs every request to stdout. Watch the mock containers:

```bash
docker compose -f apps/discordsh/poc/docker-compose-poc-dev.yaml logs -f mockoon-github
docker compose -f apps/discordsh/poc/docker-compose-poc-dev.yaml logs -f mockoon-discord
```

You can also `curl` the mocks directly from your host:

```bash
# GitHub mock
curl http://localhost:4010/repos/KBVE/kbve/issues | jq .

# Discord mock — simulate a message post
curl -X POST http://localhost:4011/api/v10/channels/123/messages \
  -H 'Content-Type: application/json' \
  -d '{"content": "hello", "embeds": []}' | jq .

# Negative tests
curl http://localhost:4010/repos/unauthorized/test/issues  # → 401
curl http://localhost:4010/repos/forbidden/test/issues      # → 403
curl http://localhost:4010/repos/notfound/test/issues       # → 404
```

## Known Limitations

1. **Discord gateway**: serenity/poise does not support custom Discord REST base URLs.
   The bot will attempt to connect to the real Discord gateway. For full bot startup,
   provide a real `DISCORD_TOKEN` from a test application. Without it, the bot's HTTP
   server (port 4321) still starts and serves the Astro frontend and health endpoints.

2. **REST-only mocks**: Mockoon cannot handle WebSocket upgrades, so the Discord
   gateway mock (`/api/v10/gateway/bot`) returns metadata only — no real WS connection.

3. **Static responses**: The canned data is hardcoded. For dynamic scenarios, edit
   the Mockoon JSON files or use Mockoon's templating features.

## CI Pipeline Integration

To run this in CI, add a job that:

```yaml
steps:
    - uses: actions/checkout@v4
    - name: Start mock environment
      run: |
          docker compose -f apps/discordsh/poc/docker-compose-poc-dev.yaml up -d \
            mockoon-github mockoon-discord
    - name: Wait for mocks
      run: |
          for svc in mockoon-github mockoon-discord; do
            until docker compose -f apps/discordsh/poc/docker-compose-poc-dev.yaml \
              exec $svc wget -qO- http://localhost:4010/repos/KBVE/kbve 2>/dev/null; do
              sleep 1
            done
          done
    - name: Run E2E tests
      env:
          GITHUB_API_BASE_URL: http://localhost:4010
      run: cargo test --package axum-discordsh -- --test-threads=1
```

## Related Issues

- Parent: #7849
- This POC: #8180
- Related: #8150, #7856
