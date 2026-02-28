# Edge Functions

Supabase Edge Runtime (Deno) functions served via Docker. All requests route through `main/index.ts` which spawns isolated workers per service.

## Request Flow

```
HTTP Request → main/index.ts (JWT verify if VERIFY_JWT=true)
  → parse path: /{service_name}
  → spawn Deno worker at /home/deno/functions/{service_name}/
  → worker handles request via serve()
```

Workers run isolated (150MB memory, 60s timeout). Environment variables are forwarded.

## Directory Structure

```
functions/
├── _shared/           Centralized utilities (all edge functions)
│   ├── cors.ts          CORS headers (allow-origin: *, auth/apikey/content-type)
│   └── supabase.ts      JWT parsing, token extraction, Supabase client factories,
│                         role guards (requireServiceRole, requireUserToken)
├── main/              Entry point / router
│   └── index.ts         Routes /{service} → worker, optional JWT gate
├── vault-reader/      System secrets (service_role only)
│   └── index.ts         get: decrypt by secret_id | set: encrypt secret_name/value
│                         RPCs: get_vault_secret_by_id, set_vault_secret
│                         Restricted to system/, service/, config/ prefixes
├── user-vault/        Per-user token management (dual-auth)
│   ├── index.ts         Router: "tokens.{action}" commands
│   │                    Auth: service_role + user_id in body OR authenticated JWT (sub)
│   └── tokens.ts        set_token, get_token, list_tokens, delete_token, toggle_token
│                         RPCs: service_set_api_token, service_get_api_token, etc.
├── mc/                Minecraft server integration
│   ├── _shared.ts       Re-exports from _shared/supabase.ts + MC validators
│   │                    (McRequest, validateMcUuid, requireNonEmpty, isValidMcUuid)
│   ├── index.ts         Router: "module.action" commands
│   ├── auth.ts          Account linking (request_link, verify, status, lookup, unlink)
│   ├── player.ts        Player snapshots (save, load) — service_role only
│   ├── container.ts     Chest/barrel state (save, load) — service_role only
│   ├── transfer.ts      Item transfer tracking (record, history) — service_role only
│   ├── character.ts     RPG character sheets (save, load, add_xp) — service_role only
│   └── skill.ts         Skill progression (save, load, add_xp) — service_role only
└── types.d.ts         Deno/EdgeRuntime type declarations
```

## Auth Model

| Role            | Description                                     | Usage                     |
| --------------- | ----------------------------------------------- | ------------------------- |
| `service_role`  | System-level access, can act on behalf of users | Discord bot, MC server    |
| `authenticated` | User-scoped, identity from JWT `sub` claim      | Web UI, direct user calls |
| `anon`          | Rejected by all service functions               | —                         |

JWT: HS256 signed with `JWT_SECRET` env var.

## Command Format

`vault-reader` uses flat commands (`get`, `set`). All other services use `module.action`:

```json
{ "command": "tokens.set_token", "token_name": "my_pat", "service": "github", ... }
{ "command": "auth.request_link", "mc_uuid": "..." }
{ "command": "player.save", "mc_uuid": "...", "server_id": "...", ... }
```

## Environment Variables

| Variable                    | Required | Description                                             |
| --------------------------- | -------- | ------------------------------------------------------- |
| `JWT_SECRET`                | Yes      | HS256 signing key for JWT verification                  |
| `VERIFY_JWT`                | No       | Set `true` to enable JWT check at main router level     |
| `SUPABASE_URL`              | Yes      | Supabase project URL                                    |
| `SUPABASE_ANON_KEY`         | Yes      | Supabase anon/public key (used for user-scoped clients) |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes      | Supabase service role key (used for elevated RPC calls) |

## Build & Run

```bash
# Build Docker image
pnpm nx run edge:container

# Run e2e tests (builds image, starts container, runs vitest, cleans up)
pnpm nx e2e edge

# Dev mode (local Docker with volume mount)
pnpm nx run edge:run-dev
```

Image: `supabase/edge-runtime:v1.70.5` with functions copied to `/home/deno/functions`.
