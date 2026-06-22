# @kbve/arpg-web

Standalone Vite client for the ARPG. A **thin shell** — it owns no game code.
The game source of truth stays in
`apps/kbve/astro-kbve/src/arcade/isometric-arpg/`, and every play surface
consumes that same source:

1. **kbve.com/arcade/arpg/** — the Astro page (`AstroIsoArpg.astro`).
2. **Discord Activity embed** — `astro-kbve/src/embed/arpg/`.
3. **arpg.kbve.com** — this app (standalone, lightweight, no Starlight/content
   pipeline).

This app aliases the game source rather than copying it (`@arpg/*` →
`isometric-arpg`, `@kbve/laser` → its src, `@/lib/supa` → a CORS-proxy shim,
`@/` → astro src). Assets are served straight from astro's LFS-tracked
`public/assets/arcade/arpg/` via `publicDir` — **do not fork or duplicate the
PNGs / tilesets**; they're Git LFS (`.gitattributes` line ~74). Keeping one
source of truth is the whole point — don't break the pointers.

## Local dev

```sh
npx nx run arpg:dev          # full stack: arpg-server (:7979) + this web (:5402)
npx nx run arpg:web-dev      # just this client, against a server you run separately
```

Auth: runs the real Supabase login; the session JWT is verified by arpg-server
against Supabase GoTrue. The Vite dev server proxies `/supabase` to dodge the
`supabase.kbve.com` localhost-CORS block.

## Production (arpg.kbve.com) — TODO

Not yet deployed. Needs: a web Dockerfile (vite build → static serve), a kube
Deployment + Service, an HTTPRoute split (`/ws` → game server :7979, `/` → this
static app), and prod env (`wss://arpg.kbve.com/ws`, direct supabase URL). The
`arpg-server` nx project + its image/kube refs stay stable.
