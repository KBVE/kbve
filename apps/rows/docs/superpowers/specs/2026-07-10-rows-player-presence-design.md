# ROWS Player Presence & Location — Design

> **Status:** approved design, pre-implementation. Plan doc: `../plans/` (written next).
> Prior art verified against TrinityCore/AzerothCore source (see §2). Depends on nothing from the
> fleet-restart PR (#13575) except conventions; ships dark behind `ROWS_VALKEY_URL`.

## 1. Goal

ROWS knows, at all times: **who is online, which UE5 GameServer instance they're on, what zone,
and their live coordinates** — served from valkey (the live tier) — and durably saves each
player's **last position** to Postgres on logout/travel/teardown plus a randomized periodic flush
(the durable tier). Game servers stay dumb reporters: UE sends the messages it already sends;
ROWS owns valkey, the roster, and all save scheduling.

**Consumers (this phase ships the data layer + two internal read endpoints; consumers wire later):**

- **GM/admin tools** — teleport-to-player, "where is everyone" (seconds-fresh xyz).
- **Group finder / social** — "is my friend online, what zone" (zone-level).
- **Resume-on-login** — restore last location after logoff or crash (durable).

## 2. Prior art (TrinityCore / AzerothCore, verified against source)

| Their mechanism | ROWS translation |
|---|---|
| Live `Player` position in worldserver process memory; `WhoListCacheMgr` snapshots for /who; friends via `ObjectAccessor::FindPlayer` — **never the DB** | valkey presence hashes (ROWS has no single stateful process — many per-zone UE servers, ≥2 ROWS replicas) |
| `characters.position_x/y/z` + `zone` saved on logout + `PlayerSaveInterval` (TC conf ships 90 s, AC 15 min), **per-player randomized ±50%** to spread write load; saves async on DB worker threads | `characters.X/Y/Z/RX/RY/RZ` (columns exist) written by a ROWS background flusher with per-player jittered intervals |
| `characters.online` flag + `zone` column (crash recovery, cross-process queries) | `charonmapinstance` joined to `mapinstances` (already exists; created on join, deleted on logout) |
| GM `.appear`: target online → live object; offline → `LoadPositionFromDB` | `/presence/player/{name}`: online → valkey; offline → `characters` row + `online:false` |

## 3. Identifiers

An instance is **`mapinstances.mapinstanceid`** (integer, per tenant) + **`gameservername`** (the
Agones pod name). The tenant `customerguid` (UUID) prefixes every valkey key. Zone =
`maps.zonename` via the instance's `mapid` — known to ROWS at allocation time.

## 4. Valkey schema

All keys prefixed `rows:{customerguid}:`. Every read below is valkey-only — no Postgres joins on
the read path.

| Key | Type | Contents | Written when | TTL |
|---|---|---|---|---|
| `presence:{instance_id}` | hash | `char → {x,y,z,rx,ry,rz,last_seen,last_flushed}` | every position report — **wholesale replace** (the report is the instance's complete roster, so joins/leaves/crashed clients reconcile automatically) | ~5 min, refreshed per report (dead instance self-expires) |
| `instance:{instance_id}` | hash | `{zone, map_name, gameservername, world_server_id, port}` | at allocation (spin-up pipeline knows all of it); static for the instance's life | refreshed alongside its presence key |
| `online` | hash | `char → instance_id` | position report + join/travel/logout events | none (entries removed on logout/teardown/staleness) |

Lookups: *who's online* = `online` + join against `instance:` hashes; *where is X* =
`HGET online` → `instance:{id}` (zone + pod name) + `presence:{id}` (xyz). Three cheap reads —
enough for GM teleport end-to-end later (pod name resolves address/port).

**Self-heal:** if an `instance:` hash is missing (valkey restarted — it's emptyDir), resolve
zone/gameservername from the DB once and lazily re-populate. A valkey wipe degrades nothing
permanently; presence refills within one heartbeat interval.

## 5. Write path (UE unchanged — zero chuck work this phase)

`POST /api/Characters/UpdateAllPlayerPositions` (existing wire format
`CharName:X:Y:Z:RX:RY:RZ|…`, service-key gated) becomes:

1. Parse (existing code).
2. Valkey pipeline: replace `presence:{instance_id}`, update `online`, refresh TTLs.
3. **Valkey unreachable → fall back to today's direct DB write** (positions never lost to a
   valkey blip). `ROWS_VALKEY_URL` unset → step 2 skipped entirely: **the feature ships dark and
   behavior is exactly today's.**

Carrying `last_flushed` forward across the wholesale replace: read the old hash's `last_flushed`
values in the same pipeline (HGETALL before replace) — one round trip, instance-sized.

`UpdateNumberOfPlayers` (the count heartbeat) is untouched — it remains the reaper's liveness
signal.

## 6. Durable flush (the TrinityCore save-interval, ROWS-owned)

A `presence_flush` job in `jobs.rs` (30 s tick, tenant advisory lock via the same pinned-connection
pattern as the reaper/fleet-restart — **third user: extract the shared lock helper as part of this
work**):

- Each tick, for each live `presence:` hash: flush players whose `last_flushed` age exceeds their
  **per-player jittered interval** — `hash(char_name)` mapped into
  `[ROWS_PRESENCE_FLUSH_MIN_SECS, ROWS_PRESENCE_FLUSH_MAX_SECS]` (defaults 90/300). Deterministic
  per player, so the fleet's writes spread evenly (TC's randomized `m_nextSave`, made stateless).
- Flush = existing batched `update_positions` repo call (one statement per batch), then update
  `last_flushed` fields.
- **Immediate flushes** (skip the interval): **logout** (existing handler — also removes from
  `online`), **travel** (position handoff between instances), and **instance teardown** — the
  reaper/deallocate path flushes that instance's `presence:` hash before deleting its keys.
  Teardown flush is the crash-save win: a UE pod dying no longer loses positions since its last
  report; ROWS still holds them and persists them.

Crash-loss bound: at most `ROWS_PRESENCE_FLUSH_MAX_SECS` of *movement* (same zone, slightly stale
spot), and only if ROWS **and** valkey die together before a flush; a UE-only crash loses nothing
past its last heartbeat.

## 7. Events

- **Logon/join/travel/logout:** already flow through ROWS (`join_map`, re-allocation,
  `player_logout`) — these update `online` and trigger the immediate flushes above. No new events.
- **Crash/disconnect (the missing event):** covered by reconciliation — a player absent from the
  next wholesale roster replace is gone from `presence:`; `online` entries whose instance's
  presence key expired are swept by the flush job (staleness = TTL expiry).

## 8. Read endpoints (internal, this phase)

Same posture as `/fleet-restart/status`: tenant-GUID header, cluster-internal, read-only, no new
auth surface (mutating GM actions like summon/teleport are a later phase and will need the
gateway-token treatment).

- `GET /presence/online` → `{ total, players: [{char_name, instance_id, zone, map_name,
  gameservername, x, y, z, last_seen}] }` — valkey; **degrade when valkey is down** to the
  existing DB join (`/api/System/ActivePlayers`'s query) with `positions: null`.
- `GET /presence/player/{char_name}` → online: live location as above with `online: true`;
  offline: last durable position from `characters` + `online: false` (the TC `.appear` split).
  404 only if the character doesn't exist.

Register both in `openapi.rs`.

## 9. Config knobs (register in the config index in the same PR)

| Env | Default | Meaning |
|---|---|---|
| `ROWS_VALKEY_URL` | unset (**dark**) | e.g. `redis://ows-valkey.rows.svc:6379`; unset = no valkey client, today's behavior |
| `ROWS_PRESENCE_FLUSH_MIN_SECS` / `_MAX_SECS` | 90 / 300 | per-player jittered durable-save interval |
| `ROWS_PRESENCE_TTL_SECS` | 300 | presence/instance key TTL (must exceed the UE position-report cadence) |

Client crate: `fred` v10 (workspace precedent — optional dep in `packages/rust/jedi`).

## 10. Infra

`ows-valkey` (valkey 8, rows namespace) already exists: single replica, `emptyDir`, no eviction
policy — the lifecycle spec's B2 caveat. **Acceptable for this phase** because every key here is
loss-benign (self-heals from heartbeats + lazy DB reads); no hardening required before shipping.
Hardening (PVC, PDB, `maxmemory` + eviction) becomes mandatory before valkey ever holds hot-path
*claims* (party anchors, reserved markers) — explicitly out of scope here. Per-tenant deployments
each point at their namespace's valkey (tenant overlays add the env).

## 11. Testing

- Pure logic (no infra): jitter bucketing (deterministic, in-range, spread), wire-format parse
  (exists), staleness/TTL decisions.
- `TEST_VALKEY_URL`-gated integration tests (mirror the `TEST_DATABASE_URL` skip pattern):
  wholesale replace reconciles a leaver; TTL expiry sweeps `online`; fallback path writes DB when
  valkey is absent.
- DB-gated: flush writes `characters` via `update_positions`; teardown flush persists a dead
  instance's positions.

## 12. Out of scope (tracked, not built here)

- Valkey hardening (PVC/PDB/eviction) — precondition for *claims*, not presence.
- Reaper v2 (valkey occupancy) — this lays its data foundation; the reaper keeps reading DB counts.
- GM summon/teleport execution, group finder UI, friends — consumers of these endpoints.
- Any UE/chuck change — existing messages only. (Optional later: richer heartbeat fields per the
  drain contract 🕳️ items.)
- Position history/trails — only current position is kept.
