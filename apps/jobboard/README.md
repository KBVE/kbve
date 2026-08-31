---
title: jobboard
description: Decoupled freelance job board — one Axum binary serves an embedded React/Vite SPA plus a REST /api.
domains:
    - host: jobs.kbve.com
      role: This SPA (app-focused, no SEO).
    - host: kbve.com/jobs/$N
      role: Astro SEO pages (future), same /api backend.
layout:
    - path: src/
      role: Axum service — REST + rust-embed SPA serve + Supabase-JWT auth.
    - path: web/
      role: React + Vite SPA; consumes @kbve/rn/auth + @kbve/rn/ui.
    - path: docker-compose.yml
      role: Local stack — kilobase Postgres → dbmate → seed → jobboard.
    - path: Dockerfile
      role: Multi-stage — node (SPA) → cargo-chef (Rust) → chisel runtime.
ports:
    - port: 5400
      role: Axum (SPA + /api) — the deployable.
    - port: 5401
      role: Vite dev server (web-dev), proxies /api → :5400.
    - port: 54322
      role: Local Postgres (kilobase).
sources:
    auth: supabase.kbve.com (Supabase JWT)
    shared_npm: '@kbve/rn'
    db: kilobase Postgres
---

# jobboard

Decoupled freelance job board. Rust/Axum REST API on `:5400` that also serves
an embedded React + Vite SPA (the same `@kbve/rn` components the mobile app
uses, via react-native-web). One binary serves UI + `/api`. Layout, ports, and
domains live in the frontmatter above.

## Data Flow

```mermaid
flowchart LR
    User([Browser])
    Dev([Vite dev :5401])

    User --> Axum[axum jobboard :5400<br/>SPA + /api]
    Dev -. proxies /api .-> Axum

    Axum --> Embed[rust-embed web/dist<br/>or JOBBOARD_WEB_DIR]
    Axum --> API{/api/*, /health, /ready}
    API --> PG[(kilobase<br/>Postgres)]
    Axum -. verify JWT .-> Supa[(supabase.kbve.com)]

    SPA[React SPA] -. sign-in .-> Supa
    Embed --> SPA
```

## Commands

Run targets either through the repo wrapper (sources `.env.local`, avoids OOM)
or pnpm nx directly:

```bash
# full local stack (Postgres + migrations + seed + the Axum binary)
moon run jobboard:dev
moon run jobboard:dev

# tear the stack down (wipes the db volume)
moon run jobboard:down
moon run jobboard:down

# SPA dev server with hot reload (vite :5401, proxies /api -> :5400)
moon run jobboard:web-dev
moon run jobboard:web-dev

# build the SPA to web/dist
moon run jobboard:web-build
moon run jobboard:web-build

# run the Axum binary on the host, serving web/dist from disk (no re-embed)
moon run jobboard:serve-static
moon run jobboard:serve-static

# cargo run / build / test / lint the Rust service
moon run jobboard:run
moon run jobboard:build
moon run jobboard:test
moon run jobboard:lint
moon run jobboard:run

# build the production container image
moon run jobboard:container
moon run jobboard:container
```

## Quick start

```bash
moon run jobboard:dev      # first run builds the image (slow, emulated)
open http://localhost:5400
```

`dev` streams full compose output and captures only FAILURE lines into
`jobboards.txt` (gitignored), wiped each run — `cat apps/jobboard/jobboards.txt`
to see just what broke.

### Fast SPA loop (no Rust rebuilds)

```bash
moon run jobboard:dev        # leave the DB + API up, or:
moon run jobboard:serve-static   # API + disk-served SPA on :5400
moon run jobboard:web-dev        # vite :5401 with HMR
```

## Auth

Identity comes from a Supabase JWT (`sub` = `auth.users.id`, `kbve_username`
claim). The SPA signs in against `supabase.kbve.com` via the shared
`@kbve/rn` `LoginScreen`. The Axum service verifies the bearer token with
`SUPABASE_JWT_SECRET`.

> Local note: sign-in yields a real Supabase token, but the compose default
> `SUPABASE_JWT_SECRET` is a placeholder, so `/api/auth/me` rejects it locally
> unless you supply the real kbve secret. `/api/verticals` + the SPA need no
> auth.

## How the SPA is served

- **Release / container** → `web/dist` is baked into the binary with
  `rust-embed`; one static binary serves everything.
- **`JOBBOARD_WEB_DIR=<path>`** → Axum serves that directory from disk at
  runtime instead (rebuild the SPA without recompiling Rust). `serve-static`
  sets it to `web/dist`.
- SPA deep links fall back to `index.html`; `/api/*`, `/health`, `/ready`
  are real routes.
