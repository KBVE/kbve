# simgrid

Headless grid-authoritative multiplayer sim core for KBVE games.

bevy ECS (headless) + axum WebSocket transport + postcard wire format + Supabase HS256 JWT admission. No godot, no rapier, no lightyear — collision is tile occupancy, "physics" is integer grid math.

## Layout

- `proto` — postcard (COBS-framed) wire types: `ClientMessage`, `ServerEvent`, `Tile`, `Dir`, `EntityDelta`, `Snapshot`.
- `auth` — Supabase access-token verification (HS256 against `SUPABASE_JWT_SECRET`, trusts the `kbve_username` claim). Behind the `supabase-auth` feature (default on).
- `net` — axum router (`/ws`, `/healthz`), per-connection session loop, shared slot `Roster`.
- `grid` — `WalkableMap`, `Occupancy`, `GridPos` / `MoveTarget` / `MoveSpeed` components.
- `sim` — `build_app` / `run_sim_loop` bevy harness: tick clock, roster sync (spawn/despawn player entities), input drain (validated tile steps), movement advance, snapshot broadcast.

## Usage

Host crates own the tokio runtime and Agones lifecycle; simgrid owns the sim + transport. See `apps/agones/cryptothrone/server` for the reference host.

```rust
let (snap_tx, _) = broadcast::channel(simgrid::SNAPSHOT_BROADCAST_CAPACITY);
let (input_tx, input_rx) = mpsc::unbounded_channel::<simgrid::SlotInput>();
let state = simgrid::ServerState::new(snap_tx.clone(), input_tx, seed, jwt_secret, capacity);
let roster = state.roster.clone();
let app = simgrid::build_app(snap_tx, input_rx, roster, seed, config, map);
// drive run_sim_loop(app) on a blocking thread; serve simgrid::router(state) on axum.
```
