# RN Dash — Minecraft GameOps Parity Design

Date: 2026-07-16
Status: approved
Follows: `2026-07-16-rn-dash-generic-controls-clickhouse-parity-design.md` (ClickHouse migration pattern, commit 9db5a32d)

## Problem

`/dashboard/gameops/mc/` (astro-kbve `dashboard/gameops/mc/index.mdx`) mounts `ReactMinecraftDashRN`, which uses `@kbve/rn/dash` `createMinecraftStream`. That adapter polls `GET /api/v1/rcon/mc/{server}/status` per server with a bearer token. That route does not exist on axum-kbve — every fetch fails, the catch path marks the server offline, so the dashboard reports all 4 servers offline. It also hardcodes 4 servers including `worldedit`, which is not a real backend.

The legacy astro components (`dashboard/ReactMcDashboard.tsx`, `dashboard/mc/{ServerCard,RconConsole,commands}`) are the source of truth for behavior: they poll `GET /api/v1/mc/players` (public, cached server-side) and run staff RCON via `POST /api/v1/rcon/mc/{server}/exec`.

Goal: migrate the MC dashboard into `@kbve/rn` with 1:1 behavioral parity, ClickHouse-commit style — composition dir in the package, legacy astro components deleted, native screen added. This is the first of the GameOps migrations (Factorio, ROWS, Vibeshine follow the same pattern later).

## Decisions (from brainstorm)

- Scope: full parity in one PR — players endpoint fix, player chips, staff gate, per-server RCON console.
- RCON console is cross-platform (web + native). Native `McScreen` added to HomeView like `ClickHouseScreen`.
- Staff gate lives in the astro bridge (`ReactMinecraftDashRN` keeps the `$isStaff` check with a ShieldOff fallback). `McView` in the package is gate-free; native HomeView gates via its own session. Backend still 403s non-staff exec.
- Architecture: approach B — full composition dir `dash/mc/`, per-card embedded console (matches old UX).

## Data flow

### Status stream

```
GET {baseUrl}/api/v1/mc/players   (no auth; poll 15s)
→ {
    online, max,
    players:  [{ name, uuid, skin_url, server, position? }],
    servers:  [{ server, online, max, reachable }],
    cached_at
  }
```

`mcStream` via `createStreamSource`:

- `key: 'mc:servers'`, `pollMs: 15_000`, `cacheTtlMs: 60_000`
- One fetch per poll (not per server). Map `servers[]` → `McServerItem`:
  `{ id: server, name: server, online, max, reachable, players: players.filter(p => p.server === server), cachedAt: cached_at }`
- `signature`: `reachable|online|max|<player names joined>` — skips re-renders when nothing changed.
- Order: velocity, lobby, survival first; any unknown servers the backend reports append after. The backend response is the source of truth for which servers exist — no hardcoded fleet, no `worldedit`.

### RCON exec

```
POST {baseUrl}/api/v1/rcon/mc/{server}/exec   (Authorization: Bearer <token>, staff-gated server-side)
body { command, args[] } → { ok, output, latency_ms, error? }
```

`execRcon` is built inside `dash/mc/` from injected `{ getToken, baseUrl }` — a port of astro-kbve `lib/rcon-client.ts`, including its non-OK handling (parse body as JSON, fall back to text, never throw into the UI).

### Labels

Static map in `mc/labels.ts`: velocity → "Velocity Proxy" + role text, lobby → "Lobby Backend", survival → "Survival Backend" (role strings carried over from `ReactMcDashboard`). Unknown server → its name as label, empty role.

## Components — `packages/npm/rn/src/dash/mc/`

- `mcStream.ts` — `createMcStream(opts: { baseUrl?, pollMs? })` + `McServerItem` / raw response types. No token needed.
- `commands.ts` — verbatim port of the tier/scope command table (`read | write | destructive` × `velocity | backend | shared`) and `commandsForServer`.
- `labels.ts` — server label/role map.
- `rconExec.ts` — `createRconExec({ getToken, baseUrl })` returning `(server, { command, args }) => Promise<RconExecResponse>`.
- `RconConsole.tsx` — cross-platform console: tier tabs (reuse Segmented control), command picker via `ui/controls/Select`, arg `TextInput`s from the command def, run button, log list (cap 50; timestamp, latency, error tint). Destructive tier confirms first: `window.confirm` on web, `Alert.alert` on native (Platform check).
- `ServerCard.tsx` — Surface card: label + role, reachable pill (online/unreachable), online/max metric, player chips (hidden on velocity, matching old behavior), embedded `RconConsole`.
- `McView.tsx` — composition: stat row (total online/max, reachable count, cache age from `cached_at`) + responsive card grid + refresh wired to the store. Props: `{ getToken, baseUrl }`.
- `index.ts` — named re-exports only (avoid the `export *` barrel clash hit in the ClickHouse migration, TS2308).

### `adapters/minecraft.tsx` (rewrite, kept)

Fetch switches to the same `GET /api/v1/mc/players` (single call, map servers). Token requirement dropped, hardcoded server list dropped, `MinecraftServerItem`/lens kept so `StreamView` rows-layout consumers keep working. `motd`/`version` fields go away (endpoint doesn't provide them) — lens rows show host-less `name`, players, reachable status.

## astro-kbve changes

- `components/rnweb/ReactMinecraftDashRN.tsx` — keeps `getToken`/`DASH_PROXY_BASE`, adds `homeService.$isStaff` gate with the ShieldOff fallback (moved from `ReactMcDashboard`), renders `<McView getToken={getToken} baseUrl={DASH_PROXY_BASE} />`.
- Delete: `components/dashboard/ReactMcDashboard.tsx`, `components/dashboard/mc/ServerCard.tsx`, `components/dashboard/mc/RconConsole.tsx`, `components/dashboard/mc/commands.ts`.
- `AstroMcDashboard.astro` and `dashboard/gameops/mc/index.mdx` unchanged (shell already mounts the RN bridge).

## Native changes

- `packages/npm/rn/src/screens/McScreen.tsx` — wraps `McView` with app-level `getToken` + absolute `baseUrl`, same shape as `ClickHouseScreen`.
- `screens/HomeView.tsx` — entry for Minecraft alongside ClickHouse.

## Error handling

- Status fetch failure: `createStreamSource` keeps last-good items; stat row shows cache age so staleness is visible. First-load failure surfaces the stream's error state.
- Exec failure (network, 403, non-JSON body): resolves to `{ ok: false, error }`, appended to the console log with error tint. Never throws to the UI.
- `reachable: false` from the backend renders the unreachable pill — that is data, not an error.

## Tests (vitest, `dash/mc/__tests__/`, following `adapters/__tests__` style)

- `mcStream`: raw response → items (join players to servers, ordering, unknown-server append, empty response).
- `commands`: `commandsForServer` scoping for velocity vs backends.
- `rconExec`: ok response, non-OK JSON error body, non-JSON text body, missing token → `Not signed in`.
- `RconConsole`: renders tiers/commands, destructive confirm gates exec.
- `adapters/minecraft`: updated for the new fetch shape.

## Out of scope

- Factorio / ROWS / Vibeshine gameops migrations (same pattern, later PRs).
- Player position/skin rendering (`position`, `skin_url` are in the payload; chips show names only, matching the old dash).
- Backend changes to axum-kbve.
