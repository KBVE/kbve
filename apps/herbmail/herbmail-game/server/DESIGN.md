# herbmail-game — Authoritative Server Design

Status: design proposal, nothing implemented.
Author: research pass over `packages/rust/simgrid`, `apps/agones/{cryptothrone,arpg}/server`, `apps/herbmail/*`, `packages/data/codegen`, `packages/npm/laser`.

---

## 1. Executive summary

**Verdict: depend on `simgrid`. Do not fork it. Do not run rapier on the server.**

`packages/rust/simgrid` is already a game-agnostic, headless, grid-authoritative multiplayer core — bevy ECS sim loop, axum WebSocket + UDP transport, postcard wire, Supabase JWT admission, AOI interest management, client-prediction reconciliation, seed-derived endless dungeons, and persistence sinks. Two games already consume it as a library through a thin per-game adapter (`apps/agones/cryptothrone/server`, `apps/agones/arpg/server`). herbmail should be the third.

The recommended architecture is a new binary crate, `herbmail-server`, that:

- takes `simgrid` as a path dependency and hosts it exactly like `arpg-server` does (`build_app` + `run_sim_loop` on a blocking thread, `simgrid::router(state)` on axum, Agones health loop alongside);
- supplies a herbmail-specific adapter module: `KindRegistry`, `SimConfig`, and a `WalkableMap` whose collision is a **Rust port of `dungeon/generate.ts` + `dungeon/sector.ts` + `dungeon/collision.ts`**, so only the seed crosses the wire;
- ships its own ~200-line `motor.rs` (a 1:1 port of `character/CharacterMotor.ts` + `collision.ts::makeMover`) instead of reusing `simgrid::float_move`, because herbmail's collision has sub-tile geometry that `float_move`'s `Fn(i32,i32) -> bool` predicate cannot express;
- consumes the same `packages/data/codegen/generated/*-data.json` the client consumes, via `include_bytes!`, exactly as `cryptothrone-server` already does.

On the browser side the client work is largely **already available**: `@kbve/laser` exports `GameClient`, `ReconnectingSocket`, the full postcard wire codec, the protocol types, and `mulberry32`/`mix32`/`rollPct` determinism mirrors — and `herbmail-game` already depends on `@kbve/laser`.

### Three corrections to the brief, stated up front

1. **`simgrid` does not use rapier.** Its own `Cargo.toml` description says so verbatim: *"No godot, no rapier, no lightyear."* There is no rapier dependency anywhere in it. Collision is tile occupancy; movement is float bodies with sub-stepped axis-separated resolution (`packages/rust/simgrid/src/float_move.rs`). The only rapier in the Rust workspace is `packages/rust/q` (rapier**2d**, optional feature, unrelated to this stack).

2. **rapier already exists in the herbmail client, and it is cosmetic.** `apps/herbmail/herbmail-game/src/game/sab/sim.worker.ts` runs `@dimforge/rapier3d-compat`, but the player is a `RigidBodyDesc.kinematicPositionBased()` proxy driven from the main thread — rapier decides nothing about the player. Its only dynamic bodies are the six break-off panels spawned by `shatter()` (`BODY_PANEL`, `F_BREAKABLE`, `PANEL_TTL = 8`, `PANEL_FADE = 1.2`). It is a debris VFX sim. Replicating it server-side would buy nothing.

3. **"MMORPG" and what this stack delivers are different things.** Both existing simgrid games run as a *single pod, single world* — `minReplicas: maxReplicas: 1` with `MAX_PLAYERS: 32`, because "a Service round-robins; multiple Ready pods would split players across separate worlds" (`apps/kube/agones/cryptothrone/README.md`). There is no sharding, no cross-server handoff and no zone service anywhere in this repo. This design gets herbmail to a solid 32-player shared world on well-trodden rails; going beyond that is an unsolved problem here and should be scoped separately.

4. **`apps/herbmail/axum-herbmail` is a static file server.** Its routes are `/health`, `/_astro/{*path}`, `/`, and MIME overrides so `.ts` worker files are served as JS (`src/transport/https.rs`). No DB, no auth, no WebSocket handler, no game state. It should be left alone; the game server goes **beside** it, not inside it.

### Recommended first milestone

Two browser clients, authenticated with Supabase JWTs, connected to `herbmail-server` over WebSocket, seeing each other's nameplate + capsule move around **sector (0,0)** — with the sector's geometry derived independently on both sides from `DUNGEON_SEED = 1337`, and nothing but positions on the wire. Everything else (props, mining, combat, doors, goblins) stays exactly as it is, client-local, until later milestones.

---

## 2. What already exists (inventory of prior art)

### 2.1 `packages/rust/simgrid` — 18,966 lines, 21 modules

`packages/rust/simgrid/Cargo.toml` / `README.md`:

> Headless grid-authoritative multiplayer sim core for KBVE games. bevy ECS (headless) + axum WebSocket transport + postcard wire format + Supabase HS256 JWT admission. No godot, no rapier, no lightyear — collision is tile occupancy, "physics" is integer grid math.

The README's own layout note is out of date (`build_app` now takes a `KindRegistry`, and `ServerState::new` takes an input sender, not a snapshot broadcaster) — read `apps/agones/cryptothrone/server/src/main.rs` as the live reference instead.

Modules relevant to herbmail:

| Module | Lines | What it gives herbmail |
| --- | --- | --- |
| `proto.rs` | 1932 | `PROTOCOL_VERSION: u32 = 16`, `ClientMessage`, `Input`, `ServerEvent`, `Snapshot`, `EntityDelta`, COBS-framed postcard encode/decode, `UdpPacket` |
| `sim.rs` | 6604 | `build_app`, `run_sim_loop`, `SIM_TICK_HZ = 20`, `SimSet` ordering, `Health`/`Inventory`/`Loot`/`XpState`/`Equipped`/`EnvObject`, persistence sinks |
| `net.rs` | 869 | axum `/ws` + `/healthz` router, per-connection session loop, `Roster`, **AOI snapshot routing** |
| `net_udp.rs` | 405 | `UdpLane` — token-authenticated UDP fastlane with automatic WS fallback |
| `float_move.rs` | 395 | `FloatBody`, `step_float`, `step_steer`, sub-stepped axis-separated tile collision |
| `arpg_dungeon.rs` | 414 | Endless chunk-streamed multi-floor dungeon, collision as a pure `is_floor(seed, x, y)` |
| `dungeon.rs` | 333 | Bounded rooms+corridors generator, semantic `role` grid, `role_blocks` |
| `grid.rs` | 627 | `WalkableMap` (bitset **or** pure-function collision + dynamic `blocked` overlay), `Floor`, `Stairs`, `StairGrace` |
| `rng.rs` | 123 | `Mulberry32`, `mix32`, `stream`, `roll_pct`, domain tags incl. `LOOT` / `DUNGEON` — **byte-mirrored in TS** |
| `data.rs` | 351 | `ItemDb`, `NpcDb`, `KindRegistry` loaded from codegen JSON |
| `auth.rs` | 93 | Supabase JWT verification, trusts the `kbve_username` claim |

**Is it game-agnostic?** Yes, demonstrably. `sim.rs` comments call the sim "content-agnostic"; `SimConfig` has a `corpse_kind: Option<u16>` field explicitly because "the sim is content-agnostic". Two very different games already ride it:

- `cryptothrone-server` — bounded 50×50 Tiled map, town + casino + shops, `WalkableMap::from_blocked`.
- `arpg-server` — endless seeded multi-floor dungeon, `WalkableMap::arpg_dungeon(DUNGEON_SEED, PATH_WINDOW)`, plus ~200KB of game-specific systems (`duel.rs`, `pets`, `creatures.rs`, `pilot.rs`) layered on top via `app.add_systems(...)`.

`arpg-server` is the closer analogue to herbmail and proves the shape works for a seed-derived endless world.

### 2.2 The extension seam

`packages/rust/simgrid/src/sim.rs:1505`:

```rust
pub fn build_app(
    tx: mpsc::UnboundedSender<ServerEvent>,
    input_rx: mpsc::UnboundedReceiver<(proto::PlayerSlot, Input)>,
    roster: Arc<RwLock<Roster>>,
    seed: u64,
    config: SimConfig,
    map: WalkableMap,
    registry: KindRegistry,
) -> App
```

There is no `GamePlugin` trait. The seam is that `build_app` returns a plain bevy `App` the host mutates, plus resource injection, plus `PendingX` command queues the host drains in its own systems. `SimSet` is a 7-stage chained pipeline in `Update`:

```rust
pub enum SimSet { Tick, Spawn, Index, Input, Ai, Movement, Snapshot }
```

The **one real trait** is `TokenVerifier` (`src/auth.rs:17`), whose doc comment states the design intent exactly:

```rust
#[async_trait::async_trait]
pub trait TokenVerifier: Send + Sync {
    async fn verify(&self, token: &str) -> Result<VerifiedUser, String>;
}
```

> The sim is content/infra-agnostic, so a host (the arpg server) injects a verifier — typically the shared jedi GoTrue + LRU cache — without simgrid taking that dependency.

So a game adapter supplies `SimConfig`, `WalkableMap`, `KindRegistry`, a `TokenVerifier`, and extra bevy systems inserted into a `SimSet` — and nothing else. From `apps/agones/cryptothrone/server/src/main.rs`:

```rust
let mut app = build_app(out_tx, input_rx, roster, seed, config, map, registry);
app.insert_resource(game::consumables());
app.insert_resource(game::item_prices());
app.add_systems(Update, game::spawn_world.in_set(simgrid::SimSet::Spawn));
rt.block_on(run_sim_loop(app));
```

That is the whole integration surface. It is small, and it is the reason "fork" is the wrong answer.

### 2.3 Browser-side kit — `@kbve/laser`

`packages/npm/laser/src/index.ts` already exports, from the root barrel:

- `GameClient` (`lib/net/game-client.ts`) — join handshake, COBS/postcard decode, typed event bus (`snapshot`, `welcome`, `combat`, `inventory`, `floor`, `pickup`, `stats`, …), and a `private unackedMoves: MoveSample[]` buffer for reconciliation;
- `ReconnectingSocket` (`lib/net/connection.ts`);
- `encodeClientMessage` / `decodeServerEvent` and the full typed protocol mirror (`lib/net/protocol.ts`, `lib/net/postcard-wire.ts`, with `postcard-wire.spec.ts` pinning parity);
- `Domain`, `mix32`, `mulberry32`, `stream`, `rollPct` (`lib/determ`) — the exact mirrors of `simgrid::rng`.

`apps/herbmail/herbmail-game/vite.config.ts:286-298` already aliases `@kbve/laser/mecs`, `/ecs`, `/phaser`, `/r3f`. Adding the root import costs nothing. Note that `net` lives in the **root** barrel (`@kbve/laser`), not a subpath — consistent with the "peers never in the root barrel" rule, since the net module has no peer deps.

### 2.4 Deployment precedent

`apps/kube/agones/arpg/manifests/`:

- `fleet.yaml` — Agones `Fleet` named `arpg-server`, `portPolicy: None` on both ports (no hostPort; traffic arrives via the Cilium gateway), `containerPort: 7979/TCP` (ws) and `7977/UDP`, health `periodSeconds: 10`, `runAsNonRoot: true`.
- `fleet-autoscaler.yaml` — `Buffer` policy with **`minReplicas: 1, maxReplicas: 1`**.
- `game-service.yaml` — plain `ClusterIP` + `sessionAffinity: ClientIP`.
- `game-httproute.yaml` — Gateway API `HTTPRoute` on `arpg.kbve.com`; `/ws` → `arpg-game:7979` with `backendRequest: 3600s`, everything else → the static vite client.
- `game-udp-service.yaml` — `LoadBalancer` with `lbipam.cilium.io/ips` + sharing key.

**Important and non-obvious: there is no Agones Allocation step.** The fleet is pinned to exactly one replica and clients reach it through an ordinary Service. Agones is used for lifecycle, health and rolling updates — this is a **single persistent world shard**, not a match-allocated session game. herbmail should copy this exactly.

---

## 3. The herbmail client, as it stands

### 3.1 Determinism from the seed — verified, and stronger than the brief claims

`apps/herbmail/herbmail-game/src/game/dungeon/store.ts:28`:

```ts
export const DUNGEON_SEED = 1337;
```

There is **no `Math.random` anywhere in the generation path**. The entire world derives from a stateless integer hash, `src/game/geometry/rng.ts`:

```ts
export function hashInt(x: number, y: number, z = 0): number {
	let h = Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(z | 0, 1274126177);
	h = Math.imul(h ^ (h >>> 13), 1274126177);
	return (h ^ (h >>> 16)) >>> 0;
}
export function hash01(x, y, z = 0) { return hashInt(x, y, z) / 4294967295; }
export function jitter(x, y, z, min, max) { return min + hash01(x, y, z) * (max - min); }
```

`Math.imul` is `i32` wrapping multiply and `>>>` is a logical shift, so this is a trivially exact Rust port (`wrapping_mul` on `i32`, shifts on `u32`). It is a **coordinate hash, not a stream** — which is better than `Mulberry32` for a server: draws are order-independent and can be evaluated for any tile in O(1) without generating anything else.

`genSector(seed, sx, sy)` and `genSectorDesc(seed, sx, sy)` are pure functions of `(seed, sx, sy)` with no global reads and no neighbour generation. Cross-sector agreement is achieved with **symmetric unordered-pair hashes** (`borderPos`, `seamKept`, `edgeOpen`) so two adjacent sectors independently agree on their shared seam. Sectors are memoized lazily by coordinate in `DungeonWorld.ensureSector(sx, sy)` and evicted past `KEEP_ROOMS = 64`; revisiting regenerates an identical sector.

Coordinate scheme (three nested levels):

| Level | Constant | Value | Defined in |
| --- | --- | --- | --- |
| tile | `TILE` | 3 world units | `src/game/config.ts` |
| cell | `CELL` | 6 tiles = 18 units | `src/game/dungeon/generate.ts` |
| sector | `SECTOR` | 8 cells = 48 tiles = **144 world units** | `src/game/dungeon/sector.ts` |

One caveat for the port: `sector.ts` also wraps `hashInt` in a **counter-based stream**:

```ts
function makeRng(seed) {
  let i = 0;
  const next = () => hashInt(seed | 0, i++, 0x9e3779b9) / 4294967295;
  return { next, int: (min, max) => min + Math.floor(next() * (max - min + 1)) };
}
```

This is draw-order dependent. Any reordering of `rng.next()` calls in `partition` / `carveCorridor` / `applyLocks` changes the map. The Rust port must reproduce the call order exactly. Everything decided by `hash01(x, y, salt)` (torches, columns, oases, doorway widths, decor, stone identity) is order-independent and safe.

**Consequence: the wire carries a `u64` seed and nothing else about geometry.** No tile streaming, no chunk downloads. This is the single biggest asset herbmail brings to a multiplayer port, and it exactly matches how `arpg-server` already operates.

### 3.2 Collision — and why the Y axis does not matter

`src/game/dungeon/collision.ts::solidAtWorld(x, z)` takes **only X and Z**. Consulted in order:

1. `DOORWAY` bit → `doorClosedAt(wc, wr)`, else a jittered opening half-width — the arch's *collision* geometry comes from the same hash as its rendered mesh:
   ```ts
   const openHW = jitter(lc, lr, 1 + desc.variant * ARCH_SALT, TILE * 0.28, TILE * 0.38);
   const lat = ns ? z - (wr + 0.5) * TILE : x - (wc + 0.5) * TILE;
   return Math.abs(lat) > openHW;
   ```
2. `PILLAR` → circle test, `COLUMN_R = 0.55`
3. `SOLID` → true
4. prop footprint via `colliderAt(wc, wr)` → AABB from `Collider.hx/hz`

Vertical geometry is `floorYAtWorld(x, z)`, which returns exactly `0` or `-OASIS_DEPTH` depending on the `PIT` bit. That is the entire height model: two discrete planes, a pure function of tile.

**Therefore jumping cannot bypass any wall, and swimming cannot reach anywhere walking cannot.** The Y axis is cosmetic and derivable. This is the finding that closes the rapier question: herbmail's *gameplay* space is already 2.5D, identical in shape to what simgrid models.

`makeMover(radius, self, skipBodies, blockPits)` resolves motion by sub-stepped axis-separated sliding, then actor-vs-actor depenetration against a global `Set<Body>`:

```ts
const moveAxis = (pos, dx, dz) => {
  if (dx !== 0 && !blocked(pos.x + dx + Math.sign(dx) * radius, pos.z)) pos.x += dx;
  if (dz !== 0 && !blocked(pos.x, pos.z + dz + Math.sign(dz) * radius)) pos.z += dz;
};
const steps = Math.min(64, Math.max(1, Math.ceil(dist / radius)));
```

This is structurally the same algorithm as `simgrid::float_move::move_axis_sub`. The differences are enumerated in §5.

### 3.3 Movement integration

`src/game/character/CharacterMotor.ts`:

```ts
const k = 1 - Math.exp(-this.cfg.accel * dt);
this.velocity.lerp(this.desired, k);
```

`simgrid::float_move::accelerate`:

```rust
let response = 1.0 - exp_decay(rate, dt);
b.vx += (target_vx - b.vx) * response;
```

**These are the same equation.** herbmail already uses simgrid's acceleration model. `DEFAULT_MOTOR = { walkSpeed: 1.8, runSpeed: 4.5, accel: 12, turnLerp: 10, gravity: 22, jumpSpeed: 6 }`, body radius `0.35`.

The one real mismatch is timestep: herbmail runs the motor from `useFrame` at variable `dt` clamped to 50 ms (`Character.tsx:681`), in two independent per-frame callbacks. A server sim is fixed at 20 Hz. Converting the client to a fixed-step accumulator for the *motor only* (render interpolation on top) is prerequisite work for prediction — see Milestone 1.

### 3.4 Everywhere the client currently assumes authority

Nothing in `herbmail-game` is persisted — there is no `localStorage`, no `fetch`, no Supabase, no network of any kind in the game bundle. All mutable state is module-global JS, wiped on reload. `src/game/profession/store.ts:3` says it plainly:

> Session-only progression. Deliberately not persisted — profession state is runtime state each game owns, and herbmail has no save layer yet.

The complete list of client-authority sites:

| # | Site | What it decides unilaterally |
| --- | --- | --- |
| A | `character/mine.ts::mineHit` | node HP decrement, **loot roll**, **XP grant**, node destruction |
| B | `profession/store.ts::grantXp` | XP and level-ups; backing store is a bare module-level `Map` |
| C | `inventory/store.ts::addLoot` | item creation; backing store is `let items: PlacedItem[] = []` |
| D | `character/useCrateBreak.ts` | crate HP, unconditional `addLoot('wood')` |
| E | `prop/burn.ts::killByBurn` | DoT ticks and the resulting `addLoot('wood')` |
| F | `combat/castSystem.ts::applyDamage` | all damage and all kills |
| G | `combat/castSystem.ts` cone test | hit detection (`reach`/`arc`, no raycast, no server) |
| H | `character/melee.ts` | crate hits sampled from **render skeleton bone positions** |
| I | `door/doors.ts::unlockDoor` | door unlock, with **no key check at all** (`SEdge.keyId` is generated but never consulted) |
| J | `prop/placed.ts` | placed/destroyed props, FIFO-capped at `CAP = 24` / `SUPPRESS_CAP = 4096` |
| K | `npc/goblinSim.ts` | all NPC position, aggro, and death |
| L | `npc/spawn.ts::enemyBudget` | enemy population, from **client session history** (`progress.maxDist`) |
| M | `character/playerStats.ts` | HP/MP/EP/SP pools and regen |
| N | `character/mine.ts::mineRefusal` | tool + level gating, read from client-only `isHeld()` / `levelOf()` |

Two of these are easy wins because they are already deterministic and coordinate-derived:

- **A's loot roll is a pure function of world tile.** `Stone.seed[eid] = hashInt(worldCol, worldRow, 0x570e)` (`prop/stone.ts`), and the roll is `hash01(seed, 0x10a7 + i * 0x3f, i + 1) >= chance`. A server can recompute the exact drop from `(wc, wr)` with no RNG synchronisation problem whatsoever. Only *whether the node is still there* needs authority.
- **F/G have no RNG at all.** `Health.hp[t] -= Math.max(1, ability.damage - def)` with a deterministic cone test. Combat is trivially reproducible server-side and trivially predictable client-side.

The genuinely hard one is **K**: `goblinSim.ts` is the only true nondeterminism in the game (`Math.random()` at lines 127, 273-274, 295-296, 300), its runtime state lives in an off-ECS plain JS `Map<eid, NpcRuntime>`, and **L** makes population a function of client session history rather than world coordinates. NPCs must be rewritten, not ported.

`combat/castSystem.ts:26` shows the author already anticipated this:

```ts
// Input -> sim bridge. Player keydown (and, later, network commands) push here;
```

That intent queue is the correct seam.

---

## 4. Reuse verdict on simgrid

**Depend, and extend upstream only where the extension is genuinely general.**

Reasoning, concretely:

- **Not "ignore"** — simgrid solves transport, framing, admission, roster, AOI, snapshot/delta, reconciliation, persistence sinks and the Agones host shape. Rebuilding that is months of work that two other games have already paid for and hardened with integration tests (`tests/ws_flow.rs`, `tests/udp_flow.rs`).
- **Not "fork"** — the integration surface is seven arguments to `build_app` plus `app.add_systems`. `arpg-server` layers ~200KB of game-specific systems on top without touching simgrid. herbmail needs strictly less than that.
- **"Extend" only for one thing** (see §5): a continuous-coordinate blocked predicate. Even that is better done *locally first* and upstreamed once proven.

### What the herbmail adapter looks like

A new binary crate, structured as a near-copy of `apps/agones/arpg/server`:

```
herbmail-server/
  Cargo.toml            # simgrid + jedi + bevy + axum + tokio + agones
  Cargo.workspace.toml  # slim workspace for the docker chef build
  Dockerfile            # copy of arpg/cryptothrone, chisel-ubuntu-axum base
  project.json          # nx targets: build, build-release, run, test, lint, e2e, container
  src/
    main.rs        # ~130 lines, near-identical to cryptothrone-server's main.rs
    agones.rs      # verbatim copy of apps/agones/cryptothrone/server/src/agones.rs
    auth.rs        # verbatim copy (jedi JWKS accept-both verifier)
    db/            # verbatim copy (pg_cluster + kv_cache, both non-fatal)
    game.rs        # KindRegistry + SimConfig + WalkableMap + spawn systems
    hash.rs        # port of geometry/rng.ts   (hashInt / hash01 / jitter)
    sector.rs      # port of dungeon/sector.ts (BSP, corridors, locks, connectors)
    generate.rs    # port of dungeon/generate.ts (tile grid, doorways, oases, columns)
    collide.rs     # port of dungeon/collision.ts::solidAtWorld
    motor.rs       # port of CharacterMotor + makeMover  (see §5)
    npc.rs         # goblin AI, rewritten deterministically
```

`game.rs` is the adapter proper. It provides:

- `walkable_map() -> WalkableMap` — herbmail cannot use `WalkableMap::from_blocked` (the world is unbounded) and cannot use `WalkableMap::arpg_dungeon` (wrong generator). It needs a third `Collision` variant. `grid.rs` already models exactly this distinction:
  ```rust
  enum Collision {
      Bitset(Vec<bool>),
      Dungeon { seed: u32 },
  }
  ```
  Adding `Collision::Herbmail { seed: u32 }` backed by `collide::solid_at(seed, x, z)` is a ~20-line upstream change and is the right kind of extension — it follows the pattern the module was built for. The dynamic `blocked: HashSet<(i32, Tile)>` overlay already exists and is exactly what player-placed props and closed doors need.
- `registry() -> KindRegistry` — kind IDs for player, goblin, kurenai, stone node, crate, torch, door, ground item.
- `config() -> SimConfig` — `spawn` from the ported `dungeonSpawn()`, `player_hp: 100`, `safe_radius` around the entrance room.
- data resources loaded from codegen, mirroring `cryptothrone-server/src/game.rs:17-20`:
  ```rust
  const ITEMDB_JSON: &[u8] = include_bytes!(".../packages/data/codegen/generated/itemdb-data.json");
  ```
  arpg does the same with `.binpb` and typed decoders: `bevy_mapdb::MapDb::from_bytes(include_bytes!(".../mapdb-data.binpb"))`, `bevy_items::ItemDb::from_bytes(...)`, `simgrid::NpcDb::from_json(...)`. **One source of truth, two consumers, no schema duplication.**

  herbmail additionally needs **professiondb** (mining actions, XP curves, `spawnWeight` tables) and **mapdb** (`objectDefs`, the join target for `resourceNodeRef`). mapdb already has a Rust decoder. **professiondb does not** — see §10; it is the one piece of genuinely new data-layer tooling this design requires.

### Where the crate should live

The brief specifies `apps/herbmail/herbmail-game/server/`. **Repo convention says otherwise**: every Agones game server in this monorepo lives at `apps/agones/<game>/server` (`cryptothrone`, `arpg`), is a member of the root `Cargo.toml` `[workspace] members` list, has a sibling `apps/agones/<game>/web`, and gets its k8s manifests at `apps/kube/agones/<game>/manifests`.

Recommendation: put the crate at **`apps/agones/herbmail/server`** and keep `apps/herbmail/herbmail-game/` as the pure client. Deviating would make the Dockerfile's `Cargo.workspace.toml` trick, the nx tags (`["rust", "game-server", "agones", "herbmail"]`), and the CI dispatch manifest all one-off. This document lives at the requested path; the code should not follow it.

Root `Cargo.toml` `[workspace] members` is an **explicit list, not a glob**, so the new crate must be added to it (one line, alongside `'apps/agones/arpg/server'`).

---

## 5. Rapier's role: none, server-side

The brief proposes "physics via rapier". The evidence says don't.

**Argument 1 — herbmail's gameplay space has no vertical dimension.** `solidAtWorld(x, z)` never reads Y. `floorYAtWorld` returns `0` or `-OASIS_DEPTH` as a pure function of tile. Nothing can be jumped over, climbed onto, or fallen off. A 3D rigid-body solver would be simulating a degree of freedom that does not affect a single gameplay outcome.

**Argument 2 — the client is not running rapier for movement either.** The player is `kinematicPositionBased()` in `sim.worker.ts`; the tile grid decides where it goes. Introducing server rapier would create a *new* disagreement between client tile-collision and server rigid-body collision that does not exist today.

**Argument 3 — herbmail's collision is intentionally non-physical.** The doorway rule (`|lat| > openHW`, where `openHW = jitter(lc, lr, 1 + variant * ARCH_SALT, TILE*0.28, TILE*0.38)`) is a hash-derived gameplay constraint, not a mesh. Reproducing it as rapier colliders means baking per-arch geometry on the server and keeping it in sync with a hash the client evaluates lazily. Reproducing it as a predicate is four lines.

**Argument 4 — cost.** rapier3d + a broadphase over streamed sector geometry for N players is materially more CPU and memory per shard than evaluating a coordinate hash on demand. `arpg-server` holds an unbounded world at zero geometry memory precisely because collision is a pure function.

### So does herbmail reuse `simgrid::float_move`?

**No — port it into `herbmail-server/src/motor.rs` instead.** Three concrete incompatibilities:

1. **Predicate signature.** `float_move` threads `is_blocked: &impl Fn(i32, i32) -> bool` — tile-discrete. herbmail's `solidAtWorld` is continuous in `(x, z)` because of doorway half-widths, pillar circles and prop AABBs. A tile-granular predicate would make every arch either fully open or fully closed.
2. **Tile space.** `float_move::tile_at(v) = (v + 0.5).floor()` puts tile *centres* on integers, with `BODY_RADIUS = 0.34`. herbmail uses `Math.floor(x / TILE)` with `TILE = 3` and radius `0.35` (≈ 0.117 tiles). Different origin convention and a ~3× different body-to-tile ratio.
3. **Actor depenetration.** herbmail pushes actors apart against a registered body set and routes the push back through `moveAxis` so it respects walls. `float_move` has no actor-vs-actor pass; simgrid handles crowding elsewhere.

`motor.rs` will be roughly 200 lines and is a direct transliteration of two files the client already ships and tests (`collision.test.ts`, `doorwaySteer.test.ts`, `strafe.test.ts`). Keeping it in the herbmail crate lets it stay byte-identical to the TS without negotiating a general abstraction in simgrid.

**Upstream later, once proven:** generalise `float_move` over a `Blocked` trait with `TileBlocked` and `PointBlocked` impls, so simgrid gets herbmail's continuous predicate without breaking cryptothrone/arpg. Do not attempt this before Milestone 3.

### How client prediction and the server avoid disagreeing

Same discipline `arpg-server` and `@kbve/laser` already use:

- **One canonical algorithm, two transliterations, pinned by parity vectors.** `simgrid/src/heightfield.rs` shows exactly how this repo does it — a `PINNED_BITS` table asserted bit-exactly in Rust and mirrored in `heightAt.spec.ts`. herbmail should do the same for `hashInt`, `sectorSeed`, and a fingerprint of the generated tile grid for a fixed set of `(seed, sx, sy)`.
- **There is a working precedent for the client half.** `apps/cryptothrone/astro-cryptothrone/src/components/game/systems/floatMotion.ts` is a line-by-line TS port of `float_move.rs` with the constants duplicated (`WALK_SPEED = 3.4`, `MOVE_ACCEL = 18`, `BODY_RADIUS = 0.34`, `MAX_MOVE_STEP = 0.2`) and `stepFloat`/`moveAxis` structurally identical to the Rust. Read it before writing herbmail's equivalent — including its two hard-won details: an immediate flush on the moving→idle **release edge** rather than waiting for the 50 ms send cadence, and an anti-fight guard that skips reconciliation entirely when the body is already moving toward the server position.
- **Correction is smoothed, not snapped.** cryptothrone uses `RECONCILE_LERP = 0.25` per correction with a hard snap only past `RECONCILE_SNAP_DIST = 6` tiles, and seeds the replay with the server's reported velocity (`qvx/qvy`) so unacked inputs reproduce the authoritative coast. Replaying from rest leaves the body trailing. Copy this.
- **Fixed timestep on both sides.** Server 20 Hz; the client motor must move to a 20 Hz (or 50 Hz, integer multiple) accumulator, with render interpolation on top. This is the only real refactor the client needs.
- **Reconciliation via `input_ack`.** `EntityDelta` already carries `qx`, `qy`, `qvx`, `qvy` and `input_ack`; `GameClient` already keeps `unackedMoves`. On a snapshot the client snaps its authoritative body to the server position and replays unacked inputs.
- **Divergence is bounded, not eliminated.** `f32` `exp()` differs between JS and Rust in the last bits. That is fine: reconciliation corrects sub-centimetre drift invisibly. The thing that must be *exact* is the tile grid and the loot/hash derivations, which use only integer ops.

---

## 6. Authority split

### Server-authoritative

| System | Notes |
| --- | --- |
| Player position | Server owns `FloatBody`; client predicts and reconciles. Y stays client-side cosmetic. |
| NPC position, aggro, death | Full rewrite of `goblinSim.ts`; `Math.random` → `simgrid::rng::stream(root, WANDER, &[eid, tick])`. |
| NPC population | Replace `enemyBudget()`'s client-history budget with a per-sector, seed-derived spawn table, so two players in the same sector see the same goblins. |
| Combat damage and kills | `applyDamage` moves server-side verbatim (no RNG). Client predicts the swing and the hit-flash; server confirms HP. |
| Hit detection | Server re-runs the cone test at the caster's *server* position. `melee.ts` bone-sampling cannot be authoritative — replace it with the same cone/reach model used for abilities. |
| Loot | Server recomputes `hash01(stoneId(wc, wr), 0x10a7 + i*0x3f, i+1)`. Deterministic, so the client can *predict* the drop and be right every time. |
| Node/crate depletion | The only genuinely stateful part of mining. Lives in simgrid's dynamic overlay + a persisted env log. |
| Profession XP and levels | `grantXp` becomes a server event; client shows a server-sent `StatsEvent`. |
| Inventory | Server owns the item list; client renders a synced view. `Input::MoveItem { from, to }` already exists in the protocol. |
| Door unlock | Server checks `SEdge.keyId` against the player's keys — the check the client never does. Unlocked doors become entries in the dynamic blocked overlay. |
| Placed / destroyed props | Server owns; `prop/placed.ts`'s FIFO caps disappear. simgrid already has `PersistedEnvObject` / `EnvPersistSink` for exactly this. |
| Player pools (HP/MP/EP/SP) | Server regen; simgrid's `EntityDelta` already carries `mp/max_mp/energy/max_energy/stamina/max_stamina`. |

### Client-predicted / client-only

| System | Rationale |
| --- | --- |
| Player XZ movement | Predicted from local input, reconciled on `input_ack`. |
| Player Y — jump, swim, pit descent | Purely cosmetic; cannot affect XZ collision. Do not put it on the wire. |
| Yaw / turn lerp | Cosmetic; `EntityDelta.facing` is enough for remote players. |
| Camera, targeting lock, HUD | `combat/targeting.ts` is UI state. |
| Cast windup/active/recover phases | Predicted for responsiveness; server confirms damage. |
| Break-off panel debris (`sim.worker.ts`) | Stays entirely client-side. Server sends "node destroyed", client plays `shatter()`. |
| Torch flicker, fireflies, decor, embers | All `hash01`-derived or purely visual; derived locally from seed. |
| Baked vertex lighting, occlusion, LOD | Rendering. |

### Derived on both sides, never transmitted

Sector layout, room/corridor topology, doorway positions and widths, pillar placement, oasis extents, torch and decor placement, stone node identity and its resource tier, crate placement, the spawn point. All are pure functions of `(DUNGEON_SEED, sector coords)` or `(world tile)`.

---

## 7. Protocol

**Recommendation: adopt simgrid's protocol as-is. Do not design a new one.**

- **Transport: WebSocket only. herbmail cannot use the UDP lane.** simgrid's `UdpLane` is real, tested (`tests/udp_flow.rs`) and wired into snapshot routing:
  ```rust
  if let Some(lane) = udp
      && let Some(addr) = lane.bound_addr(h.slot)
      && lane.try_send_snapshot(addr, &view) { continue; }
  let frame = Arc::new(encode_frame(&proto::ServerEventRef::Snapshot(view)));
  deliver(h.value(), frame);
  ```
  But **cryptothrone never calls `.with_udp()`** — `state.udp` is `None` and no `UDP_OFFER` is ever emitted, because a browser cannot open a raw UDP socket. Only `arpg-server` enables it, env-gated on `ARPG_UDP_ADDR`, for native clients. herbmail is browser-only, so plan for WS and **omit the UDP Service from the manifests** until a native client exists.

  WebTransport is not used anywhere in this repo, and `apps/kbve/astro-kbve/src/content/docs/gdd/netcode.mdx:103` records a standing rule that WS and WT transports are never mixed in shared structs. If sub-WS latency is ever needed, `UdpPacket` / `UdpPacketRef` is already the right shape to port onto WebTransport — but that is out of scope here.

  WS is also what the Cilium Gateway `HTTPRoute` already terminates, with the `backendRequest: 3600s` timeout configured for exactly this.

- **The WS handshake itself is unauthenticated.** The JWT arrives inside the first postcard `JoinMatch` frame, not in a header or query param, so the edge cannot reject unauthorized connections — every client gets a socket and a decode before rejection. Inherited from simgrid; note it, don't fix it here.

- **Framing: COBS-framed postcard.** `proto::encode`. Note the hard rule stated in `proto.rs`: postcard is positional, so **never** use `skip_serializing_if` on a wire field — a conditionally omitted field shifts every following byte. New fields are appended last, with `#[serde(default)]`.

- **Versioning:** `PROTOCOL_VERSION: u32 = 16`, sent in `JoinMatch` and checked on admission. Bump when variants are added. Note the repeated comment convention in `Input`: *"Appended last so serde variant indices of the existing inputs are unchanged."*

- **Tick rates:** `SIM_TICK_HZ = 20`, `SNAPSHOT_EVERY_N_TICKS = 2` (10 Hz snapshots), `KEYFRAME_EVERY_N_TICKS = 100` (5 s). `run_sim_loop` uses a tokio interval with `MissedTickBehavior::Skip` and feeds physics a constant `dt_ms = 1000.0 / SIM_TICK_HZ` — never wall-clock delta, so the sim is deterministic in tick count. These are good defaults for a dungeon crawler; no change needed.

- **"Snapshot" is a full state broadcast, not a delta — despite the type name `EntityDelta`.** `emit_snapshot` maps *every* matching entity every time. `Snapshot.keyframe` is computed but nothing branches on it, `Snapshot.input_ack` is hardcoded `0` (the real ack rides per-entity `EntityDelta.input_ack`), and `destroyed` is always `false` — client despawn is by **absence from the snapshot**, which is why AOI culling and despawn are coupled. Do not design herbmail around a baseline/ack delta scheme that does not exist. If bandwidth becomes a problem, adding real delta encoding is an upstream simgrid project, not a herbmail one.

- **Input handling: `IntentBuffer`, a per-player client-tick jitter buffer** (`sim.rs:2042-2178`). `INPUT_JITTER_BUFFER = 2` intents are primed before consumption starts; exactly one intent is consumed per server tick in client-tick order; on starvation the last intent is held for `INPUT_STARVE_GRACE = 2` ticks then zeroed, accumulating `debt` so a late stop lands next tick rather than replaying a burst. This is what makes "the release stops exactly when the client did" true, and it is the reason the client must stamp `Input::Move.tick`. herbmail gets it for free and must send `tick` correctly.

- **Lag compensation already exists.** `PosHistory` is a 16-tile ring rewound by `LAG_COMP_TICKS: usize = 5` for hit resolution, so the shooter's view of a target is reconstructed. Relevant if herbmail ever adds PvP.

- **Interest management:** `net.rs::route_snapshot_aoi` — per-connection encode, filtered to `e.z == me.z && aoi_chebyshev(e.tile, me.tile) <= AOI_RADIUS` with `AOI_RADIUS: i32 = 64`. herbmail's sector is 48 tiles, so 64 covers a bit over one sector. The client mounts a 3×3 sector ring (`store.ts::mountedSectorCoords`), i.e. ±72 tiles. **Raise `AOI_RADIUS` to 96 for herbmail** (or make it a `SimConfig` field — currently it is a module constant) so entities never pop in inside the mounted ring. This is a small, safe upstream change.

- **Messages herbmail needs**, all of which already exist in `proto::Input`: `Move { seq, mx, my, run, tick }`, `Face`, `Action { id, target }`, `UseItem`, `DropItem`, `MoveItem`, `EquipItem`, `PlaceItem { item_ref, tile, rot }`, `PickupObject { tile }`, `Heartbeat { client_tick }`, `Leave`. Mining maps cleanly onto the existing `Fell { tile }` shape (arpg's tree-felling); herbmail should add `Input::Mine { tile }` appended last rather than overloading `Fell`. Door interaction needs one new variant, `Input::OpenDoor { tile }`.

- **Server events herbmail needs**, already present: `Snapshot`, `Welcome`, plus the ephemeral channels `EPHEMERAL_COMBAT`, `EPHEMERAL_INVENTORY`, `EPHEMERAL_PICKUP`, `EPHEMERAL_STATS`, `EPHEMERAL_ITEM_PLACED`, `EPHEMERAL_EQUIPPED`. A new `EPHEMERAL_MINE` (node destroyed + yield) is the only genuinely new one.

- **Coordinate encoding.** `EntityDelta` carries both `tile: Tile` (i32 pair) and `qx/qy: i32` + `qvx/qvy: i16` quantized floats (`POS_SCALE = 32`, i.e. 1/32 tile; `VEL_SCALE = 256`). herbmail should send positions in **tile units** (world units / `TILE`), matching simgrid's convention, and convert at the client boundary. Do not send world units — the AOI filter and the tile field both assume tile space.

  **One thing herbmail must not copy from cryptothrone:** its client reads `qx/qy/qvx/qvy` only for `myEid` and renders *remote* players at tile granularity, letting gridEngine tween between 10 Hz tile steps. The sub-tile data is on the wire and thrown away. herbmail is a 3D third-person crawler where remote players sliding between tile centres would look broken — read `qx/qy/qvx/qvy` for every entity and interpolate continuously. The bandwidth is already being spent.

---

## 8. Deployment

Copy the arpg pattern verbatim.

1. **Crate** at `apps/agones/herbmail/server`, added to root `Cargo.toml` `[workspace] members`.
2. **`Cargo.workspace.toml`** in the crate dir listing only `apps/agones/herbmail/server`, `packages/rust/simgrid`, `packages/rust/jedi` — this is the slim workspace the Dockerfile's `cargo chef` planner stage copies in as `Cargo.toml`.
3. **Dockerfile** — copy of `apps/agones/cryptothrone/server/Dockerfile`: `ghcr.io/kbve/chisel-ubuntu-axum:24.04-builder`, cargo-chef planner/deps/builder split, mold linker, sccache with the Valkey backend.
4. **`project.json`** — targets `build`, `build-release`, `run`, `test`, `lint`, `container` (`@nx-tools/nx-container:build`, `push: false`, `local`/`production` configurations with a ghcr buildcache), and `e2e` that `dependsOn` `container`, runs the image, polls `/healthz`, then drives it with vitest. Tags `["rust", "game-server", "agones", "herbmail"]`. Note the repo has **two Rust nx styles**: `axum-herbmail` uses `@monodon/rust:{build,test,lint,run}` executors, while the agones game servers use plain `nx:run-commands` wrapping `cargo ... -p <crate>`. Follow the agones style.
5. **`version.toml`** in the crate dir, and a registration in `.github/ci-dispatch-manifest.json` (`version_toml`, `version_target`, `image`, `deployment_yaml`) alongside the existing `arpg_server` / `cryptothrone_server` / `herbmail` entries. There is also a CI guard for the Dockerfile stub trick: `.github/workflows/ci-cargo-stub-guard.yml`.
6. **Manifests** at `apps/kube/agones/herbmail/manifests`: `namespace.yaml`, `fleet.yaml` (port 7979/TCP only — see §7 on UDP; `portPolicy: None`, `runAsNonRoot`, `readOnlyRootFilesystem: true`, drop ALL caps), `fleet-autoscaler.yaml` (`Buffer`, `minReplicas: 1, maxReplicas: 1`, with an ArgoCD `ignoreDifferences` on `/spec/replicas` since the Fleet declares `replicas: 0`), `game-service.yaml` (ClusterIP, `sessionAffinity: ClientIP`), `game-httproute.yaml` (`/ws` → game service with `backendRequest: 3600s`, `/` → the static client), `external-secrets.yaml` for `SUPABASE_JWT_SECRET` + `SUPABASE_JWKS_URI`, `game-certificate.yaml`, plus `application.yaml` one level up.
7. **Agones integration** is just the health loop — copy `src/agones.rs` unchanged: `agones::Sdk::new(None, None)`, `sdk.ready()`, then a 2 s `health_check()` ping, and `sdk.shutdown()` on SIGTERM. It is deliberately non-fatal: on `Err` it logs "running outside Agones (local dev?)" and returns, so local dev needs no sidecar. The `agones = "1.57"` crate is already in the root `[workspace.dependencies]`.
8. **No allocation path.** One shard, one persistent world, reached by a stable Service. The reason the autoscaler is pinned to 1 is recorded in `apps/kube/agones/cryptothrone/README.md`: *"A Service round-robins; multiple Ready pods would split players across separate worlds."* If herbmail later wants instanced dungeons, `apps/cryptothrone/axum-cryptothrone/src/agones.rs` is the template — `kube::Client::try_default()` + a POST to `/apis/allocation.agones.dev/v1/.../gameserverallocations`, exposed as `POST /api/join`, with `allocator-rbac.yaml` granting `create` on `gameserverallocations`. A richer version with retries and a circuit breaker lives in `apps/rows/src/agones/`. Note that `herbmail-sa` currently sets `automountServiceAccountToken: false`, so an allocator would need that flipped plus RBAC.
9. **Versioning** is MDX-driven in this repo; the Fleet image tag tracks the crate version that the release pipeline publishes. Nothing in this design touches version files.
10. **The Dockerfile must explicitly `COPY` the codegen blobs** it `include_bytes!`s, before `cargo build` — see the corresponding lines in arpg's Dockerfile for itemdb/mapdb/spelldb/npcdb.

The static client already has a home: `astro-herbmail` / `axum-herbmail` serve the site today. The `HTTPRoute` should route `/ws` on the game hostname to the Fleet and everything else to the existing static path, mirroring `arpg-game-route`.

---

## 9. Migration path

The rule for every milestone: **the single-player game keeps working**. Gate the whole thing behind a `?mp=1` / env flag so the offline path is untouched until the last step.

**M0 — Fixed-step the client motor.** No server involved. Move `CharacterMotor.update` behind a 20 Hz accumulator with render interpolation; keep `goblinSim` and `castSystem` on the same clock. This is the only prerequisite refactor and it improves the single-player game on its own (currently a stalled tab silently loses sim time via the 50 ms clamp).

**M1 — Geometry parity harness.** Port `hashInt`/`hash01`/`jitter`, `sectorSeed`, `sector.ts` and `generate.ts` to Rust. Add a pinned parity test in the style of `heightfield.rs::PINNED_BITS`: for a fixed list of `(seed, sx, sy)`, assert a fingerprint of the generated tile grid, and assert the same fingerprint from a TS spec in `herbmail-game`. **Nothing ships until this is green.** No server, no protocol, no client change.

**M2 — Two capsules in one sector.** ← *the recommended first useful milestone.*
Stand up `herbmail-server` with `SimConfig`, a `KindRegistry` containing only `PLAYER_KIND`, and a `WalkableMap` backed by the M1 collision port. Port `motor.rs`. Client: import `GameClient` from `@kbve/laser`, send `Input::Move` at the fixed tick, render remote players from `Snapshot.entities` as capsules with nameplates. No prediction yet — render the local player from the server position with interpolation, accepting the latency, to prove the loop end-to-end. Scope: sector (0,0) only.

**M3 — Prediction and reconciliation.** Local player predicts with `motor.rs`'s TS twin; replay `unackedMoves` on each snapshot. Add the `Blocked` trait generalisation upstream if the local `motor.rs` has stabilised. Raise `AOI_RADIUS` and let players roam across sectors.

**M4 — Combat server-authoritative.** Move `applyDamage` and the cone test server-side. Client predicts the cast phases and shows a provisional hit; server confirms via `EPHEMERAL_COMBAT`. Retire `melee.ts` bone-sampling in favour of the ability cone. PvE only at this point.

**M5 — Goblins server-side.** Rewrite `goblinSim` in Rust with `simgrid::rng::stream(root, domain::WANDER, &[eid, tick])` replacing every `Math.random`. Replace `enemyBudget()`'s session-history budget with a seed-derived per-sector spawn table. Client becomes a pure renderer + interpolator for NPCs.

**M6 — Mining, loot, XP, inventory.** Requires the professiondb Rust decoder from §10 (net-new). `Input::Mine { tile }`; server owns node HP and depletion, recomputes the (already deterministic) drop, grants XP against the professiondb curves, and owns the inventory list. Client predicts the drop — it will always be right, because the roll is a coordinate hash. Wire `PlayerPersistSink` to `jedi`'s Postgres pool so progression finally survives a reload.

**M7 — Doors and placed props.** Door unlock with a real `keyId` check; unlocked doors and placed props enter simgrid's dynamic blocked overlay and `EnvPersistSink`. The FIFO caps in `prop/placed.ts` and `door/doors.ts` are deleted.

**M8 — Deploy.** Fleet, autoscaler pinned to 1, ClusterIP Service, HTTPRoute, external secrets, ArgoCD app, `version.toml` + `ci-dispatch-manifest.json` registration. No UDP Service — the client is a browser (§7).

Auth plumbing (getting a Supabase access token from `astro-herbmail`'s session into `GameClient`) is a prerequisite for M2 and is not currently anywhere in `herbmail-game`. `apps/cryptothrone/astro-cryptothrone/src/components/game/ReactGameGate.tsx` is the template: `initSupa()` → `authBridge.getSession()` → `usernameFromToken(accessToken)` → gate on a missing `kbve_username` → hand `{ jwt, username, wsUrl }` to the client.

---

## 10. Risks and open questions

Separated deliberately from the recommendations above.

### Risks

- **`makeRng` draw-order fragility.** `sector.ts`'s counter-based stream means any refactor of `partition`/`carveCorridor`/`applyLocks` on either side silently changes the world. Mitigation: the M1 fingerprint test, run in CI on both sides. This is the single highest-risk item in the plan.
- **Float parity in doorway widths.** `jitter()` divides by `4294967295` and multiplies by `TILE * 0.28 .. 0.38`. JS uses f64; Rust must too (`f64`, not `f32`) or arch half-widths will differ by ulps and a player could be blocked on one side and not the other. Use `f64` throughout the collision port and compare with a tolerance in tests, not bit-exactly.
- **Two clocks in the client.** `Character.tsx` and `ThirdPersonPlayer.tsx` each run their own `useFrame` with independent 50 ms clamps, and `PropRenderer.tsx` runs `npcSystem` + `castSystem` on a third. M0 has to unify these or prediction will jitter.
- **SAB seqlock has no reader retry.** `packages/npm/laser/src/lib/mecs/sab.ts` exposes `gen()` but no consumer retries on a torn read, and structural ops are non-atomic bit writes. Safe today because each world has exactly one structural writer. If networking introduces a second writer to the props world, this becomes a real bug.
- **Body radius mismatch.** Client radius `0.35` world units = `0.117` tiles; simgrid's `BODY_RADIUS` is `0.34` tiles. Whichever is chosen must be identical on both sides or players will clip differently through the `TILE * 0.28` doorway gaps — the tightest geometry in the game.
- **`herbmail-game` has no auth at all.** Supabase exists at the site level (`astro-herbmail/src/lib/supa.ts`) but the game bundle has zero hooks into it. Getting a JWT into `GameClient` requires plumbing that does not exist yet and is not in any milestone above.
- **No persistence model exists to migrate.** `prop/placed.ts` caps at 24 records; `unlocked` caps at 2048. A server introduces persistent world state for the first time, which means schema design, migration, and a `dbmate` story that this document does not cover.
- **`combat/los.ts` and `flowField.ts` both sample `solidAtWorld` heavily.** Server-side BFS flow fields over a *computed* collision function are more expensive than over a bitset. `WalkableMap::arpg_dungeon` already accepts a `path_window` to bound BFS for this reason (`MAX_PATH_LEN = 64`); herbmail will need the same cap and should measure it.
- **The TS wire mirror is hand-written and is the highest-maintenance surface in the stack.** `packages/npm/laser/src/lib/net/postcard.ts` (a hand-rolled postcard v1 + COBS codec) plus `postcard-wire.ts` (815 lines of field-by-field mirrors of `proto.rs`) plus `protocol.ts` — roughly 1000 lines kept in sync only by byte-exact hex fixtures asserted on both sides (e.g. `assert_eq!(hex, "0e01070301037fff0109180a050d00")` in `proto.rs`, mirrored in `postcard-wire.spec.ts`). Every new `Input` variant or `EntityDelta` field herbmail adds requires a matching hand edit in TS. Postcard is positional, so a mistake here is a silent byte-shift desync, not a type error. Budget for it, and add fixtures for every herbmail-specific message.
- **Hard scaling ceiling: one pod, one world.** `minReplicas: maxReplicas: 1` + `MAX_PLAYERS: 32` + `sessionAffinity: ClientIP`. There is no sharding, no cross-server handoff, no zone service anywhere in this repo. "MMO" in the brief and what this stack can currently deliver are different things — herbmail would be a 32-player shared world, and going beyond that is unsolved here.
- **Snapshot cost is O(connections × entities).** Per-recipient AOI means a fresh postcard allocation per connection per snapshot, 10×/second. Fine at 32 players; measure before assuming more.
- **`simgrid` is structurally agnostic but materially leaky.** `proto.rs` and `sim.rs` have absorbed concrete gameplay from the other two games — blackjack (a full dealer engine), pet/JRPG battles, ship piloting and a "space instance", tree felling. herbmail will link all of it. That is dead weight, not a correctness problem, but it means the crate will keep growing under other games' requirements and herbmail inherits the churn.

### Open questions

- **Shard model.** One global persistent dungeon shared by everyone, or per-party instances? The arpg precedent (Fleet pinned to 1) assumes one world. herbmail's `DUNGEON_SEED = 1337` is a single hardcoded constant, which suggests one world was the intent — but a dungeon crawler usually wants instancing. This decision changes §8 substantially and should be settled before M2.
- **Does herbmail need floors?** simgrid has `Floor`, `Stairs`, `StairLink`, `StairGrace`, and `EntityDelta.z`; arpg uses them. herbmail is currently single-level with pits. If vertical levels are ever wanted, adopting `Floor` from M2 is nearly free; retrofitting it later is not.
- **Player-vs-player.** Is herbmail PvE-only? §6 assumes so. If PvP is wanted, simgrid's `PosHistory` / `LAG_COMP_TICKS = 5` rewind already exists and should be adopted rather than reinvented — but herbmail's hit shapes are cones, not projectiles, so the rewind integration is not a copy-paste.
- **`AOI_RADIUS` as a constant.** Should it be promoted to a `SimConfig` field upstream, or should herbmail just raise the constant and accept the effect on arpg/cryptothrone? Recommend a `SimConfig` field.
- **Where does the `Blocked` trait generalisation land?** Local `motor.rs` forever, or upstreamed into `float_move` at M3? Deferring is cheap; the cost is a permanent second copy of an algorithm simgrid already has.
- **`professiondb` in Rust — this one is confirmed net-new work.** There are Rust consumers of itemdb, mapdb, spelldb and npcdb (`bevy_mapdb::MapDb::from_bytes`, `bevy_items::ItemDb::from_bytes`, `simgrid::NpcDb::from_json`, all via `include_bytes!`), but **no Rust consumer of professiondb exists anywhere in the repo.** `professiondb-data.binpb` (proto wire, `profession.ProfessionRegistry`) is generated and is the cleanest target — a `bevy_professiondb` crate with a `prost`/`prost-build` `build.rs`, mirroring `bevy_mapdb`. Open question: does it live in `simgrid::data`, in a new `bevy_professiondb`, or local to `herbmail-server`?

  **Watch the two views.** `gen-professiondb-data.mjs` emits both `professiondb-data.json` (canonical) and `professiondb-runtime.json` (slimmed, camelCase, Astro-only fields like `title` stripped, enum strings prefixed e.g. `PROFESSION_CATEGORY_`). The herbmail client reads the **runtime** view — `src/game/data/professiondb.ts` imports `@kbve/professiondb-data`, aliased in `tsconfig.json` to `professiondb-runtime.json`. A Rust proto decode of the `.binpb` yields the **canonical** view. Field-name and enum-representation parity must be checked before either side is trusted. Also note `RUNTIME_SYNC_TARGETS` in that generator currently lists only the Unity StreamingAssets dir; herbmail is not in it.

  The join key matters too, and is documented in `professiondb.ts`: `professiondb.resourceNodeRef -> mapdb.objectDefs[].ref`, with `mapdb.professionActionRef` pointing back. The server needs both DBs to resolve a mining action.
- **Kurenai.** `npc/KurenaiNpc.tsx` is 320 lines of retargeted-animation NPC with `NPC_KURENAI { hp: 60, power: 9, defense: 3 }`. Is it a scripted set-piece (stays client-side) or a world NPC (must move server-side in M5)?
- **Nothing currently damages the player.** Grepping `Health.hp[` writes finds only crate DoT, player→NPC casts, crate break and mining. There is no incoming-damage path to port, which means M4 is partly *new feature work*, not migration.
