---
title: discordsh
description: Discord server directory at discord.sh — one Axum binary serves the Astro static site plus a REST /api, with a separate Discord gateway bot.
domains:
    - host: discord.sh
      role: The site and its /api, served by the api binary (HTTPRoute -> discordsh-service).
layout:
    - path: web/
      role: Astro frontend (`discordsh-web`). Builds to dist/apps/discordsh-web. Starlight is mounted for /guides and /servers docs only; src/pages owns /, /404 and /auth.
    - path: web/e2e/
      role: Playwright suites (`discordsh-web-e2e`) — bare-container and Mockoon-mock runs, plus the mock compose stack.
    - path: api/
      role: Axum service (`discordsh-api`). Serves the Astro build from STATIC_DIR and the /api/servers routes. This is the deployable web server; it holds no Discord code.
    - path: api/e2e/
      role: Vitest smoke suite (`discordsh-api-e2e`) against the built image. Not part of discordsh:e2e.
    - path: bot/
      role: Discord gateway bot (`discordsh-bot`). Poise slash commands, GitHub cards, and the Embed Dungeon game. Deploys separately.
    - path: bot/e2e/
      role: Vitest smoke suite (`discordsh-bot-e2e`) against the bot health server.
    - path: SQL_DUNGEON.md
      role: Proposal only — cross-door dungeon schema. No migration exists; do not apply.
ports:
    - port: 4321
      role: api — Astro static + /api. The deployable.
    - port: 4322
      role: bot — health endpoint for k8s probes.
images:
    api: kbve/discordsh
    bot: kbve/discordsh-bot
    base: ghcr.io/kbve/chisel-ubuntu-axum
kube:
    manifests: apps/kube/discordsh/manifest/
    api: deployment.yaml
    bot: discordsh-bot-deployment.yaml
sources:
    auth: supabase.kbve.com (Supabase JWT)
    db: kilobase Postgres via jedi PgCluster, Supabase edge functions as fallback
---

# discordsh

Discord server directory at [discord.sh](https://discord.sh). Two deployables
that share a repo and nothing else at runtime:

- **`discordsh-api`** — the web server. Axum on `:4321`, serving the Astro build
  from `STATIC_DIR` plus `/api/servers/*` and health routes.
- **`discordsh-bot`** — the Discord gateway. Poise slash commands, GitHub cards
  and the Embed Dungeon game, with a health endpoint on `:4322`.

The bot is not reachable from the site and the api speaks no Discord. Anything
about commands, the dungeon or gateway sharding belongs in [`bot/`](./bot/).

## Data flow

```mermaid
flowchart LR
    User([Browser]) --> Route[HTTPRoute discord.sh]
    Route --> Api[discordsh-api :4321<br/>static + /api]
    Api --> Static[dist/apps/discordsh-web<br/>via STATIC_DIR]
    Api --> PG[(kilobase Postgres<br/>jedi PgCluster)]
    Api -. submit, fallback reads .-> Edge[(Supabase edge)]

    Discord([Discord gateway]) <--> Bot[discordsh-bot :4322 health]
    Bot --> Supa[(Supabase RPC<br/>dungeon profiles)]
```

## Commands

```bash
# astro frontend
moon run discordsh-web:build
moon run discordsh-web:check

# api — builds the frontend first, then cargo run
moon run discordsh-api:dev
moon run discordsh-api:test
moon run discordsh-api:containerx     # kbve/discordsh:latest and :<Cargo version>

# bot
moon run discordsh-bot:test
moon run discordsh-bot:containerx     # kbve/discordsh-bot:latest

# full pipeline — unit tests, image build, both Playwright suites
moon run discordsh:e2e
```

## Base image

Both Dockerfiles build on `ghcr.io/kbve/chisel-ubuntu-axum` — the `-builder`
tag for the cargo-chef stages, the plain tag for the chiseled runtime. The
version is pinned in every `FROM` and rewritten by `tools/release/repin-base-image.mjs`
when the base publishes, so never hand-edit those tags. A build that dies in
`cargo chef cook` on an MSRV complaint means the pinned base is behind the
workspace toolchain.

## Docs

- [`api/README.md`](./api/README.md) — env vars, routes, e2e
- [`bot/README.md`](./bot/README.md) — commands, env vars, module layout
- [`bot/DISCORDSH_GAMEIDEA.md`](./bot/DISCORDSH_GAMEIDEA.md) — Embed Dungeon design, architecture and roadmap
- [`web/e2e/mock/README.md`](./web/e2e/mock/README.md) — the Mockoon stack
