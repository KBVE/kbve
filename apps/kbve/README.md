# apps/kbve

KBVE platform services powering [kbve.com](https://kbve.com).

## Services

| Directory         | Description                                                                                                     |
| ----------------- | --------------------------------------------------------------------------------------------------------------- |
| `astro-kbve/`     | Static frontend built with Astro 5, Starlight, and React 19. Docs, content, game UI.                            |
| `astro-kbve-e2e/` | Playwright end-to-end tests for the Astro frontend.                                                             |
| `axum-kbve/`      | Rust backend (Axum). Serves the Astro dist, API routes, Askama SSR, JWT auth, Discord integration, game server. |
| `axum-kbve-e2e/`  | Vitest end-to-end tests for the Axum backend.                                                                   |
| `edge/`           | Deno edge functions (Supabase Edge).                                                                            |
| `edge-e2e/`       | Edge function tests.                                                                                            |
| `isometric/`      | Bevy-based isometric game client. Builds to native (Tauri) and WASM.                                            |
| `kilobase/`       | PostgreSQL Rust extension (pgx).                                                                                |

## Data Flow

```
Browser --> astro-kbve (static) --> CDN
Browser --> axum-kbve (dynamic) --> PostgreSQL / Supabase / Redis
Browser --> edge (Deno)          --> Supabase Edge Functions
Browser --> isometric (WASM)     --> axum-kbve game server (WebSocket)
```

Proto source of truth: `packages/data/proto/`
Shared Rust crates: `packages/rust/`
Shared NPM packages: `packages/npm/`
