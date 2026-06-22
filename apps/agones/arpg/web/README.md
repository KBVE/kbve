# @kbve/arpg-web

Vite client for the ARPG and the **source of truth** for the game code. The
game lives here under `src/game/` (scene, ECS, netcode, float movement,
dungeon, combat); the only external dependency is `@kbve/laser` (wire protocol +
shared client), aliased to its source at `packages/npm/laser/src`.

## Three play surfaces, one bundle

All three ship from this app — `arpg.kbve.com` is the single CDN source:

1. **arpg.kbve.com** — the standalone app (`vite build` → `dist/`).
2. **kbve.com/arcade/arpg** — loads the embed IIFE (`window.ArpgEmbed`) built by
   `vite build --mode embed` → `dist/arpg-embed.js`, cross-origin from the CDN.
3. **Discord Activity** — the discord IIFE (`window.ArpgDiscord`) built by
   `vite build --mode discord` → `dist/discord/arpg/arpg.js`, served
   same-origin and loaded relatively.

`npm run build` (nx `arpg:build`) emits all three in order.

## Assets (Git LFS)

Art lives in this app's `public/assets/arcade/arpg/` (characters / environment /
ui / `ground.png`) and is Git LFS-tracked — see `.gitattributes` (~line 74) and
the nested `.lfsconfig`. Served via vite `publicDir`. Don't fork or duplicate
the PNGs/tilesets; the LFS pointers are the source of truth. The `arpg:web-build`
target pulls them first: `./kbve.sh -lfs arpg pull --include='…/arpg/**'`.

## Local dev

```sh
npx nx run arpg:dev        # full stack: arpg-server (:7979) + this web (:5402),
                           # docker compose, auto-down on exit
npx nx run arpg:web-dev    # just this client, against a server you run separately
npx nx run arpg:compose-up # arpg-server only (no web)
```

Auth: runs the real Supabase login; the session JWT is verified by `arpg-server`
against Supabase GoTrue. The vite dev server proxies `/supabase` (dodges the
`supabase.kbve.com` localhost-CORS block) and `/gamechat` (realm chat over the
irc-gateway).

## Production (arpg.kbve.com)

Deployed. Image `kbve/arpg-web` (nx `arpg:container-web`), manifests in
`apps/kube/agones/arpg/manifests/` — `web-deployment.yaml` (static serve),
`game-service.yaml` + `game-httproute.yaml` (`/ws` → game server :7979, `/` →
this app), `game-certificate.yaml`, and the Agones `fleet.yaml` /
`fleet-autoscaler.yaml` for the game servers.
