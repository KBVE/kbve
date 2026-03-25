# axum-discordsh

Discord bot + HTTP server for the KBVE ecosystem. Combines a [poise](https://github.com/serenity-rs/poise)-based Discord bot with an [Axum](https://github.com/tokio-rs/axum) HTTP server serving Astro static assets.

## Environment Variables

### Core

| Variable                    | Required | Default | Description                                                                                     |
| --------------------------- | -------- | ------- | ----------------------------------------------------------------------------------------------- |
| `DISCORD_TOKEN`             | Yes\*    | —       | Discord bot token. Falls back to Supabase Vault if unset.                                       |
| `SUPABASE_URL`              | No       | —       | Supabase project URL for PostgREST, Vault, and RPC calls. Features degrade gracefully if unset. |
| `SUPABASE_SERVICE_ROLE_KEY` | No       | —       | Supabase service role key for elevated DB/Vault access.                                         |

> \* At least one of `DISCORD_TOKEN` or the Supabase Vault must provide a bot token.

### HTTP Server

| Variable               | Required | Default          | Description                                                                      |
| ---------------------- | -------- | ---------------- | -------------------------------------------------------------------------------- |
| `HTTP_HOST`            | No       | `0.0.0.0`        | HTTP server bind address.                                                        |
| `HTTP_PORT`            | No       | `4321`           | HTTP server bind port.                                                           |
| `STATIC_DIR`           | No       | `templates/dist` | Root directory for serving Astro static assets.                                  |
| `STATIC_PRECOMPRESSED` | No       | `true`           | Enable precompressed (brotli/gzip) asset serving. Set `0` or `false` to disable. |

### Discord Bot

| Variable            | Required | Default | Description                                                                                      |
| ------------------- | -------- | ------- | ------------------------------------------------------------------------------------------------ |
| `GUILD_ID`          | No       | —       | Guild ID for guild-scoped command registration (dev mode). If unset, commands register globally. |
| `DISCORD_THREAD_ID` | No       | —       | Thread ID for status reports and admin cleanup operations.                                       |

### Sharding (Distributed Deployment)

| Variable       | Required | Default   | Description                                                                                       |
| -------------- | -------- | --------- | ------------------------------------------------------------------------------------------------- |
| `SHARD_ID`     | No       | —         | Explicit shard ID. If unset, derived from `HOSTNAME` pod ordinal (e.g. `discordsh-2` → `2`).      |
| `SHARD_COUNT`  | No       | `1`       | Total number of shards in the cluster.                                                            |
| `HOSTNAME`     | No       | —         | Pod hostname for instance identification and shard ordinal derivation (set automatically in K8s). |
| `CLUSTER_NAME` | No       | `default` | Cluster identifier for multi-cluster shard tracking.                                              |

### GitHub Integration

| Variable               | Required | Default                  | Description                                                                    |
| ---------------------- | -------- | ------------------------ | ------------------------------------------------------------------------------ |
| `GITHUB_TOKEN`         | No       | —                        | GitHub PAT for API calls. Checked first.                                       |
| `GITHUB_TOKEN_API`     | No       | —                        | Alternative GitHub token (checked if `GITHUB_TOKEN` is empty).                 |
| `GITHUB_TOKEN_PAT`     | No       | —                        | Alternative GitHub token (checked last before Vault fallback).                 |
| `GITHUB_API_BASE_URL`  | No       | `https://api.github.com` | Override GitHub REST API base URL (for testing with Mockoon or GHE).           |
| `GITHUB_DEFAULT_REPO`  | No       | —                        | Default `owner/repo` for `/github` commands when user omits the repo argument. |
| `GH_REPO`              | No       | `KBVE/kbve`              | Fallback default repo if `GITHUB_DEFAULT_REPO` is unset.                       |
| `GITHUB_ALLOWED_REPOS` | No       | (all)                    | Comma-separated `owner/repo` allowlist. Blocks API calls to unlisted repos.    |

> Token resolution order: `GITHUB_TOKEN` → `GITHUB_TOKEN_API` → `GITHUB_TOKEN_PAT` → Supabase Vault (tag `github_pat:<guild_id>`).
>
> Default repo resolution order: `GITHUB_DEFAULT_REPO` → `GH_REPO` → `KBVE/kbve`.
>
> The repo allowlist is enforced at the `GitHubClient` level in the `jedi` crate — requests to repos not in the list are rejected before any HTTP call is made. If `GITHUB_ALLOWED_REPOS` is unset, all repos are allowed (open mode).

### GitHub Command Permissions

Commands are organized into three permission tiers with sensible defaults. Each tier can be overridden via env var, or set to `NONE` to make it unrestricted. Discord Administrators bypass all tier checks.

| Tier      | Commands                             | Default Permission   | Env Override        |
| --------- | ------------------------------------ | -------------------- | ------------------- |
| **Read**  | `issues`, `pulls`, `repo`, `commits` | (none — open to all) | `GITHUB_PERM_READ`  |
| **Board** | `noticeboard`, `taskboard`           | `MANAGE_MESSAGES`    | `GITHUB_PERM_BOARD` |
| **Admin** | (future write commands)              | `ADMINISTRATOR`      | `GITHUB_PERM_ADMIN` |

Per-user rate limiting applies across all tiers:

| Variable                 | Required | Default | Description                                                |
| ------------------------ | -------- | ------- | ---------------------------------------------------------- |
| `GITHUB_CMD_RATE_LIMIT`  | No       | `5`     | Maximum `/github` commands per user per rate-limit window. |
| `GITHUB_CMD_RATE_WINDOW` | No       | `60`    | Rate-limit window duration in seconds.                     |

> Supported permission flags: `ADMINISTRATOR`, `MANAGE_GUILD`, `MANAGE_MESSAGES`, `MANAGE_CHANNELS`, `MANAGE_ROLES`, `SEND_MESSAGES`, `VIEW_CHANNEL`, `MODERATE_MEMBERS`. Set a tier to `NONE` to make it unrestricted. Unknown flags are ignored with a warning.

### GitHub Board Scheduler

Auto-posts notice board and task board embeds to a Discord thread on a recurring interval.

| Variable                     | Required | Default      | Description                                                            |
| ---------------------------- | -------- | ------------ | ---------------------------------------------------------------------- |
| `GITHUB_BOARD_THREAD_ID`     | Yes\*\*  | —            | Discord thread ID to post embeds into. Scheduler is disabled if unset. |
| `GITHUB_BOARD_INTERVAL_SECS` | No       | `21600` (6h) | Interval between scheduled posts in seconds.                           |
| `GITHUB_BOARD_REPO`          | No       | `KBVE/kbve`  | Target repository in `owner/repo` format.                              |
| `GITHUB_BOARD_STALE_DAYS`    | No       | `3`          | Threshold (days) for marking issues/PRs as stale on the notice board.  |

> \*\* Only required if you want the scheduler feature. The bot runs fine without it.

### Rendering

| Variable           | Required | Default                       | Description                                                  |
| ------------------ | -------- | ----------------------------- | ------------------------------------------------------------ |
| `FONT_PATH`        | No       | `alagard.ttf`                 | Path to custom game font for SVG-to-PNG rendering.           |
| `SYMBOL_FONT_PATH` | No       | `NotoSansSymbols-Regular.ttf` | Path to Unicode symbol font for special character rendering. |

## Slash Commands

| Command                     | Description                          |
| --------------------------- | ------------------------------------ |
| `/ping`                     | Health check                         |
| `/status`                   | Bot status with shard info           |
| `/health`                   | System health (CPU, memory, threads) |
| `/restart`                  | Restart bot shards (admin)           |
| `/cleanup`                  | Clean up thread messages (admin)     |
| `/dungeon start\|join\|...` | Embed Dungeon game commands          |

### `/github` Subcommands

All `/github` subcommands are gated by the permission check (`GITHUB_REQUIRED_PERMISSIONS`) and per-user rate limiter (`GITHUB_CMD_RATE_LIMIT`). Each accepts an optional `repo` argument in `owner/repo` format — defaults to `GITHUB_DEFAULT_REPO` / `GH_REPO` / `KBVE/kbve`.

| Command               | Parameters                                   | Description                                                                                                      |
| --------------------- | -------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `/github noticeboard` | `repo?`, `stale_days?` (default: 3)          | Fetches open issues + PRs, filters stale items, and posts a priority-sorted notice board embed (critical first). |
| `/github taskboard`   | `repo?`, `phase?` (default: "Current Phase") | Groups open issues by department label (programming, qa, devops, etc.) and shows progress counts.                |
| `/github issues`      | `repo?`, `limit?` (default: 10, max: 25)     | Lists open issues with labels, assignees, and links. Embed sidebar color matches the first label.                |
| `/github pulls`       | `repo?`, `limit?` (default: 10, max: 25)     | Lists open PRs with branch, labels, assignees, and `[DRAFT]` markers.                                            |
| `/github repo`        | `repo?`                                      | Shows repository info — description, default branch, and open issue count.                                       |
| `/github commits`     | `repo?`, `limit?` (default: 10, max: 25)     | Shows recent commits with author, short SHA, and first line of the commit message.                               |

## Development

```bash
# Local dev (guild-scoped commands for fast iteration)
DISCORD_TOKEN=... GUILD_ID=... HTTP_PORT=4321 cargo run -p axum-discordsh

# Run tests
cargo test -p axum-discordsh --bin axum-discordsh
cargo test -p jedi --lib github
```

## E2E Testing

The full e2e pipeline runs via `nx e2e discordsh`:

1. **Unit tests** — `cargo test -p axum-discordsh`
2. **Docker build** — `nx container axum-discordsh`
3. **Docker e2e** — Playwright against the bare container (`nx e2e:docker discordsh-e2e`)
4. **Mock e2e** — Playwright against the Mockoon mock stack (`nx e2e:mock discordsh-e2e`)

### E2E Environment Variables

| Variable          | Used By  | Default              | Description                                                                                                                     |
| ----------------- | -------- | -------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `DISCORDSH_IMAGE` | e2e:mock | —                    | Pre-built Docker image tag (e.g. `kbve/discordsh:0.1.31`). When set, the mock docker-compose skips rebuilding.                  |
| `DISCORD_TOKEN`   | e2e:mock | `mock-discord-token` | Bot token for the mock stack. A real test bot token enables full gateway connection; the mock fallback tests GitHub-only paths. |
| `CI`              | all e2e  | —                    | Set automatically in CI. Adjusts Playwright retries (2) and workers (1).                                                        |

### Running E2E Locally

```bash
# Full pipeline (unit tests → docker build → docker e2e → mock e2e)
./kbve.sh -nx e2e discordsh

# Individual steps
cargo test -p axum-discordsh                    # unit tests
./kbve.sh -nx container axum-discordsh          # docker build
./kbve.sh -nx e2e:docker discordsh-e2e          # playwright vs container
./kbve.sh -nx e2e:mock discordsh-e2e            # playwright vs mockoon stack

# Mock stack only (without Nx)
docker compose -f apps/discordsh/poc/docker-compose-poc-dev.yaml up
```

### Mock Stack Architecture

```
docker-compose-poc-dev.yaml
├── mockoon-github    (port 4010) — GitHub REST API mock
├── mockoon-discord   (port 4011) — Discord REST API mock
└── discordsh         (port 4321) — bot with GITHUB_API_BASE_URL → mockoon
```

See [poc/README.md](../poc/README.md) for mock route details and CI integration guide.
