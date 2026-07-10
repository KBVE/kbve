---
title: apps/kbve
description: KBVE platform services powering kbve.com
services:
    - dir: astro-kbve/
      tech: Astro 5, Starlight, React 19
      role: Static frontend — docs, content, game UI. Nested e2e/ holds Playwright browser/visual/a11y specs.
    - dir: astro-kbve-e2e/
      tech: Vitest + Docker
      role: Integration tests against the running kbve/kbve container (routes, redirects, meta, api).
    - dir: axum-kbve/
      tech: Rust, Axum, Askama
      role: Backend — serves Astro dist, API routes, SSR, JWT auth, Discord, game server.
    - dir: axum-kbve-e2e/
      tech: Vitest + Docker
      role: Integration tests against the running axum-kbve container.
    - dir: kbve-gate/
      tech: Rust
      role: Auth proxy sidecar — fronts n8n, grafana, studio with Supabase JWT validation.
    - dir: edge/
      tech: Deno
      role: Supabase Edge Functions.
    - dir: edge-e2e/
      tech: Deno
      role: Edge function tests.
    - dir: isometric/
      tech: Bevy, Tauri, WASM
      role: Isometric game client — native (Tauri) and WASM targets.
    - dir: desktop-kbve/
      tech: Tauri 2, React 19, Rust
      role: Cross-platform desktop app.
    - dir: kbve-react-native/
      tech: Expo, React Native, TypeGPU
      role: Mobile app — RN with TypeGPU effects lane.
    - dir: forums/
      tech: Design spec
      role: KBVE Forums design specification.
    - dir: kilobase/
      tech: Rust, pgrx
      role: PostgreSQL extension.
sources:
    proto: packages/data/proto/
    rust_crates: packages/rust/
    npm_packages: packages/npm/
---

# apps/kbve

KBVE platform services powering [kbve.com](https://kbve.com). Service inventory lives in the frontmatter above.

## Data Flow

```mermaid
flowchart LR
    Browser([Browser])
    Desktop([Desktop / Tauri])
    Mobile([Mobile / Expo])

    Browser --> Astro[astro-kbve<br/>static]
    Browser --> Axum[axum-kbve<br/>dynamic]
    Browser --> Edge[edge<br/>Deno]
    Browser --> Iso[isometric<br/>WASM]
    Desktop --> Axum
    Mobile --> Axum

    Astro --> CDN[(CDN)]
    Axum --> Gate[kbve-gate<br/>auth proxy]
    Axum --> PG[(PostgreSQL /<br/>kilobase)]
    Axum --> Supa[(Supabase)]
    Axum --> Redis[(Valkey)]
    Edge --> SupaEdge[(Supabase Edge)]
    Iso -.WebSocket.-> Axum

    Gate --> N8N[n8n / grafana / studio]
```

## Sources of Truth

- Proto: `packages/data/proto/`
- Shared Rust crates: `packages/rust/`
- Shared NPM packages: `packages/npm/`
