# discordsh-api

Axum HTTP server for [discord.sh](https://discord.sh). Serves the `discordsh-web`
Astro build as static assets and exposes the server-directory REST API.

The Discord gateway bot lives in [`../bot/`](../bot/) (`discordsh-bot`) — poise,
slash commands and the Embed Dungeon game all moved there. Nothing in this crate
talks to Discord.

## Environment Variables

### HTTP server

| Variable               | Required | Default          | Description                                                              |
| ---------------------- | -------- | ---------------- | ------------------------------------------------------------------------ |
| `HTTP_HOST`            | No       | `0.0.0.0`        | Bind address.                                                            |
| `HTTP_PORT`            | No       | `4321`           | Bind port.                                                               |
| `STATIC_DIR`           | No       | `templates/dist` | Root directory for the Astro static build.                               |
| `STATIC_PRECOMPRESSED` | No       | `true`           | Serve precompressed (brotli/gzip) assets. Set `0` or `false` to disable. |

### Data

`POST /api/servers/submit` forwards to a Supabase edge function; the read paths
prefer a direct Postgres pool and fall back to the edge when it is unavailable.

| Variable            | Required | Default | Description                                                                       |
| ------------------- | -------- | ------- | --------------------------------------------------------------------------------- |
| `SUPABASE_EDGE_URL` | Yes\*    | —       | Edge function base URL. Submissions return 500 if unset.                          |
| `KBVE_PG_RW_URL`    | No       | —       | Read-write Postgres URL for `PgCluster`. Init failure logs a warn and falls back. |
| `KBVE_PG_RO_URL`    | No       | —       | Read-only Postgres URL.                                                           |

> \* Only for submissions. Listing, health and static serving work without it.
> The full `KBVE_PG_*` set is documented by `jedi::state::pg::PgCluster::from_env`.

## Routes

| Route                      | Method | Description                                               |
| -------------------------- | ------ | --------------------------------------------------------- |
| `/health`                  | GET    | JSON health — CPU, memory, threads, uptime.               |
| `/healthz`                 | GET    | Plain-text liveness probe.                                |
| `/api/servers/list`        | GET    | Paginated server directory. Sorting and category filter.  |
| `/api/servers/{server_id}` | GET    | Single server record.                                     |
| `/api/servers/submit`      | POST   | Submit a server. Auth token required, 5 req / 60s per IP. |
| `/*`                       | GET    | Astro static assets from `STATIC_DIR`.                    |

## Development

```bash
# Builds discordsh-web first, then serves it out of dist/
moon run discordsh-api:dev

# Tests
moon run discordsh-api:test
```

## Container

```bash
moon run discordsh-api:containerx   # -> kbve/discordsh:latest and :<Cargo version>
```

The Dockerfile builds the Astro site and the Rust binary in one graph and ships
them on the chiseled runtime base, so `containerx` needs no separate web build.

## E2E

`moon run discordsh:e2e` is the full pipeline:

1. `discordsh-api:test` — Rust unit tests
2. `discordsh-api:container` — image build
3. `discordsh-web-e2e:e2e-docker` — Playwright against the bare container
4. `discordsh-web-e2e:e2e-mock` — Playwright against the Mockoon stack
   ([`../web/e2e/mock/`](../web/e2e/mock/))

`discordsh-api-e2e:e2e` ([`e2e/`](./e2e/)) is a separate vitest smoke suite over
the same image, run on its own.

| Variable          | Used by    | Default | Description                                                              |
| ----------------- | ---------- | ------- | ------------------------------------------------------------------------ |
| `DISCORDSH_IMAGE` | `e2e-mock` | —       | Pre-built image tag. When set, the mock compose skips rebuilding.        |
| `CI`              | all e2e    | —       | Set by the runner. Raises Playwright retries to 2 and pins workers to 1. |

## Related

- [`../web/`](../web/) — `discordsh-web`, the Astro frontend this crate serves
- [`../bot/`](../bot/) — `discordsh-bot`, the Discord gateway bot
- `crates/jedi` — Postgres pool, GitHub client
- `crates/kbve` — Supabase helpers, image generation
