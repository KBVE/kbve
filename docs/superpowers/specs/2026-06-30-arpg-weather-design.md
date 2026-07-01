# ARPG Server-Driven Weather — Design

Date: 2026-06-30
Scope: `apps/agones/arpg`, `packages/rust/simgrid`, `packages/npm/laser`

## Problem

IsoArpgScene renders an always-on static dust-mote layer (`createDustMoteLayer`, 500 motes, `scrollFactor: 0`). It reads as random static particles on screen with no purpose and looks broken. Game is Agones MMO — visual ambience should be a shared, server-authoritative weather system, not a per-client always-on effect.

## Goal

Replace the always-on dust layer with a **server-driven weather system**. Server picks weather deterministically and broadcasts the resulting state; all clients render the same weather. Late joiners and reconnects get current weather. Clear weather = no particles (fixes the original complaint).

## Non-Goals

- Per-zone / biome weather (single global weather for now; `kind` field leaves room).
- Gameplay effects from weather (no slow, no damage). Purely visual.
- Snow/storm visuals beyond stubs (`kind` reserves them; rain ships first).

## Architecture

### Wire protocol (`packages/rust/simgrid/src/proto.rs`)

New broadcast event + shared state struct.

```rust
pub const EPHEMERAL_WEATHER: u16 = 20;

#[derive(Clone, Copy, Debug, Serialize, Deserialize)]
pub struct WeatherState {
    pub kind: u8,      // 0 clear, 1 rain, 2 snow, 3 storm
    pub intensity: u8, // 0-255, drives particle density
    pub wind: i16,     // horizontal shear, signed
}
```

`Welcome` gains a `weather: WeatherState` field (positional struct — TS decoder updated in lockstep) so late joiners / reconnects render correct weather immediately without waiting for the next change broadcast.

Change broadcasts use the existing Ephemeral path:
`ServerEvent::Ephemeral { kind: EPHEMERAL_WEATHER, to: PLAYER_SLOT_NONE, payload: encode_inner(&WeatherState) }`
— serialized once, delivered to all conns (existing broadcast branch in `net.rs`).

### Server scheduler (`packages/rust/simgrid/src/sim.rs`)

`Weather` Bevy resource holds current `WeatherState` + next-change tick. Seeded RNG derived from world `seed` + a roll counter (deterministic, reproducible, testable — no wall-clock RNG).

System `tick_weather` (runs in `SimSet::Snapshot`, but logic gated on its own interval):

- When `clock.tick >= next_change_tick`: roll next phase.
    - ~70% → clear (`kind=0, intensity=0`).
    - ~30% → rain (`kind=1`), `intensity` rolled in a light→heavy band, bout length 60-120s.
- On any state change, broadcast `EPHEMERAL_WEATHER` and update the resource.
- No broadcast on unchanged ticks (no per-tick spam).

`Welcome` construction reads the `Weather` resource so the seed value is the authoritative current state.

### Client transport (`packages/npm/laser/src/lib/net`)

- `protocol.ts`: `EPHEMERAL_WEATHER = 20`, `WeatherState` interface, add `weather` to `Welcome`.
- `postcard-wire.ts`: `readWeather` / `decodeWeather`; `readWelcome` reads the new field (field order matches Rust exactly).
- `game-client.ts`: `weather: WeatherState` in `GameClientEventMap`; `handleEphemeral` decodes kind 20 → `bus.emit('weather')`; `Welcome` handler also emits initial `weather` so the scene gets state on connect.

### Client visual (`packages/npm/laser/src/lib/phaser/weather-rain.ts` — new)

New layer module mirroring `ambient-dust.ts` (same `gpu-sprite-layer` infra):

- Rain members = thin vertical streaks, falling (downward `y` tween, fast, looping), slight horizontal drift driven by `wind`, `scrollFactor: 0`.
- Particle count + alpha scale off `intensity`.
- `kind=0` (clear) → zero active particles (layer hidden / count 0).
- Storm stub: same as heavy rain + occasional full-screen flash (deferred; reserved by `kind=3`).
- Streak texture generated like `ensureDotTexture` but a short vertical rect.

### Scene wiring (`apps/agones/arpg/web/src/game/IsoArpgScene.ts`)

- Remove the `createDustMoteLayer` call (the static-dust bug source) and its teardown.
- Create a weather rain layer instead; hold handle on the scene; dispose on teardown.
- Subscribe to `gameClient.on('weather', ...)`: update active particle count / intensity / wind on the layer. Apply current weather once on connect (from `Welcome`-emitted weather).

## Data flow

```
seed + tick ──► Weather resource (server) ──► tick_weather rolls
   │                                              │ on change
   │                                              ▼
   └─► Welcome.weather (on connect) ──┐   Ephemeral(kind=20, to=NONE)
                                       ▼          │ broadcast all
                            client decode ◄───────┘
                                       │
                              bus.emit('weather')
                                       ▼
                        IsoArpgScene → rain layer (count/intensity/wind)
```

## Testing

- Rust: unit test `WeatherState` postcard round-trip (encode_inner → decode_inner). Existing proto test fixtures pattern at `proto.rs` tests.
- Rust: deterministic scheduler test — same seed ⇒ same weather sequence over N ticks.
- Rust: `Welcome` round-trip includes weather field.
- TS: `postcard-wire` decode test for `WeatherState` + `Welcome` with weather (cross-language byte-lockstep — matches Rust field order).
- Manual: connect two clients, confirm identical weather; reconnect mid-rain, confirm rain resumes immediately.

## Risks

- **Wire lockstep:** `Welcome` and `WeatherState` field order must match Rust↔TS exactly; positional postcard breaks silently otherwise. Round-trip tests guard.
- **`Welcome` field add** is a protocol change — bump protocol version if a mismatch check exists; old clients won't decode the new tail.
- GPU sprite layer only on WEBGL (`createDustMoteLayer` already returns null on canvas) — rain layer inherits same guard; no weather on canvas fallback (acceptable).
