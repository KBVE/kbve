//! Nexus Defense server-side systems (bevy + rapier2d + axum side).
//! Activated by `--features nexus-defense-server`.
//!
//! Hosts the authoritative simulation. The bevy `App` is built by
//! [`build_app`] and driven by [`run_sim_loop`] from a tokio task — no winit,
//! no rendering, just a fixed-cadence scheduler that calls `App::update`.
//!
//! Inputs flow in via an `mpsc::UnboundedReceiver<(PlayerSlot, Input)>` that
//! the axum WS layer feeds; snapshots flow out via a
//! `tokio::sync::broadcast::Sender<ServerEvent>` so each WS connection can
//! subscribe a `Receiver`.
//!
//! Each `Snapshot` carries one `FieldDelta` per active roster slot. Enemies
//! and buildings are owned by a `PlayerSlot` and partitioned into the
//! matching field on the way out — every player gets their own wave + their
//! own placements, which is the parallel-race default per the design tracker.

use std::collections::HashMap;
use std::sync::{Arc, Mutex, RwLock};
use std::time::Duration;

use bevy::app::App;
use bevy::ecs::entity::Entity;
use bevy::ecs::system::Commands;
use bevy::prelude::{
    Component, IntoScheduleConfigs, Query, Res, ResMut, Resource, Update, Without,
};
use tokio::sync::{broadcast, mpsc};
use tokio::time;

use crate::net::server::Roster;
use crate::proto::{self, Input, ServerEvent};

/// Server sim tick rate. 20 Hz matches the design budget in #11294.
pub const SIM_TICK_HZ: u32 = 20;

/// Seconds per tick.
const TICK_DT: f32 = 1.0 / SIM_TICK_HZ as f32;

/// Send a snapshot every `SNAPSHOT_EVERY_N_TICKS` sim ticks (10 Hz at 20 Hz sim).
pub const SNAPSHOT_EVERY_N_TICKS: u32 = 2;

/// Capacity for the broadcast channel — enough headroom for late subscribers
/// to catch up without lagging the producer.
pub const SNAPSHOT_BROADCAST_CAPACITY: usize = 256;

/// Map dimensions used by the placeholder spawner.
const PLAYFIELD_WIDTH: f32 = 800.0;
const SPAWN_X: f32 = 0.0;
const ENEMY_SPEED: f32 = 60.0;
const ENEMY_HP: f32 = 50.0;
const ENEMIES_PER_WAVE: u32 = 10;
/// Ticks between consecutive enemy spawns inside a wave (0.5 s at 20 Hz).
const SPAWN_INTERVAL_TICKS: u32 = 10;
/// Ticks between waves (5 s at 20 Hz).
const WAVE_INTERVAL_TICKS: u32 = SIM_TICK_HZ * 5;
/// Vertical stripe assigned to each slot — slot 0 at y=120, slot 1 at y=280, etc.
const SLOT_STRIPE_BASE: f32 = 120.0;
const SLOT_STRIPE_HEIGHT: f32 = 160.0;

const BUILDING_HP: f32 = 200.0;

/// Starting resources at match boot.
const STARTING_GOLD: i32 = 150;
const STARTING_LIVES: i32 = 20;

/// Hard cap on inputs accepted per slot per sim tick. Anything past this is
/// dropped silently; abusive clients can't stall the sim or flood entity
/// spawns. 8 / tick = 160 inputs / sec at SIM_TICK_HZ=20 — well above any
/// realistic human cadence.
const INPUT_BUDGET_PER_TICK: u32 = 8;

/// Cost lookup matching the catalog in the legacy phaser TD config. Wire-
/// faithful for the placeholder buildings the sim spawns right now; real
/// per-tier costs land alongside the upgrade/tier systems.
fn build_cost(kind: proto::BuildKind) -> i32 {
    match kind {
        proto::BuildKind::Tower => 60,
        proto::BuildKind::Generator => 50,
        proto::BuildKind::Battery => 80,
        proto::BuildKind::Repair => 90,
        proto::BuildKind::Armoury => 120,
        proto::BuildKind::Village => 70,
        // Town/Castle/Nexus aren't placeable via the build bar in v1.
        proto::BuildKind::Town | proto::BuildKind::Castle | proto::BuildKind::Nexus => 0,
    }
}

#[derive(Resource, Default)]
pub struct SimClock {
    pub tick: u32,
    pub elapsed_ms: u32,
}

#[derive(Resource, Clone)]
pub struct SnapshotBroadcast {
    pub tx: broadcast::Sender<ServerEvent>,
}

#[derive(Resource, Clone, Copy)]
pub struct SimSeed(pub u64);

/// Mailbox of authenticated inputs (slot + payload) waiting to be applied to
/// the bevy world. The WS handler is the sole producer; `drain_inputs` is the
/// sole consumer.
#[derive(Resource)]
pub struct InputQueue {
    pub rx: Mutex<mpsc::UnboundedReceiver<(proto::PlayerSlot, Input)>>,
}

/// Shared roster handle from `q::net::server::ServerState`. The sim reads it
/// each tick to drive per-player wave spawns + snapshot framing.
#[derive(Resource, Clone)]
pub struct RosterHandle(pub Arc<RwLock<Roster>>);

#[derive(Default, Clone, Copy)]
pub struct SlotWave {
    pub wave: u16,
    pub spawned_in_wave: u32,
    pub next_spawn_tick: u32,
    pub next_wave_tick: u32,
}

/// Stack-allocated per-slot wave bookkeeping. `None` = slot vacant.
#[derive(Resource)]
pub struct WaveState {
    pub slots: [Option<SlotWave>; proto::MAX_PLAYERS],
}

impl Default for WaveState {
    fn default() -> Self {
        Self {
            slots: [None; proto::MAX_PLAYERS],
        }
    }
}

/// Per-slot resources (gold + lives + accumulated kills). Slot index is
/// authoritative; clients never see anyone else's economy beyond what we
/// stamp into the snapshot.
#[derive(Default, Clone, Copy)]
pub struct PlayerEconomyEntry {
    pub gold: i32,
    pub lives: i32,
    pub kills: u32,
}

#[derive(Resource)]
pub struct PlayerEconomy {
    pub slots: [Option<PlayerEconomyEntry>; proto::MAX_PLAYERS],
}

impl Default for PlayerEconomy {
    fn default() -> Self {
        Self {
            slots: [None; proto::MAX_PLAYERS],
        }
    }
}

/// Per-tick input counter, reset by `drain_inputs` each tick.
#[derive(Resource, Default)]
pub struct InputBudget {
    pub consumed: [u32; proto::MAX_PLAYERS],
}

#[derive(Component)]
pub struct Position(pub f32, pub f32);

#[derive(Component)]
pub struct Velocity(pub f32, pub f32);

#[derive(Component)]
pub struct Health {
    pub hp: f32,
    pub max_hp: f32,
}

#[derive(Component)]
pub struct EnemyTag {
    pub kind: proto::EnemyKind,
    pub owner: proto::PlayerSlot,
}

#[derive(Component)]
pub struct BuildingTag {
    pub kind: proto::BuildKind,
    pub owner: proto::PlayerSlot,
    pub col: i32,
    pub row: i32,
}

/// Build a headless bevy `App` wired to broadcast snapshots over `tx`,
/// accept inputs from `input_rx`, and read the shared roster from `roster`.
pub fn build_app(
    tx: broadcast::Sender<ServerEvent>,
    input_rx: mpsc::UnboundedReceiver<(proto::PlayerSlot, Input)>,
    roster: Arc<RwLock<Roster>>,
    seed: u64,
) -> App {
    let mut app = App::new();
    app.insert_resource(SimClock::default())
        .insert_resource(SimSeed(seed))
        .insert_resource(SnapshotBroadcast { tx })
        .insert_resource(InputQueue {
            rx: Mutex::new(input_rx),
        })
        .insert_resource(RosterHandle(roster))
        .insert_resource(WaveState::default())
        .insert_resource(PlayerEconomy::default())
        .insert_resource(InputBudget::default())
        .add_systems(
            Update,
            (
                tick_sim,
                sync_per_slot_state,
                drain_inputs,
                spawn_wave_enemies,
                move_enemies,
                despawn_offscreen,
                emit_snapshot,
            )
                .chain(),
        );
    app
}

fn tick_sim(mut clock: ResMut<SimClock>, mut budget: ResMut<InputBudget>) {
    clock.tick = clock.tick.wrapping_add(1);
    clock.elapsed_ms = clock.elapsed_ms.wrapping_add(1000 / SIM_TICK_HZ);
    // Reset every slot's per-tick input budget.
    for c in budget.consumed.iter_mut() {
        *c = 0;
    }
}

/// Materialize per-slot state for slots that just joined; tear down state
/// for slots that vacated. One system covers WaveState + PlayerEconomy so
/// they always agree on which slots are alive.
fn sync_per_slot_state(
    roster: Res<RosterHandle>,
    mut wave: ResMut<WaveState>,
    mut economy: ResMut<PlayerEconomy>,
) {
    let active = match roster.0.read() {
        Ok(r) => r.active_slots(),
        Err(p) => p.into_inner().active_slots(),
    };
    let mut active_mask = [false; proto::MAX_PLAYERS];
    for slot in &active {
        let idx = slot.0 as usize;
        if idx >= proto::MAX_PLAYERS {
            continue;
        }
        active_mask[idx] = true;
        if wave.slots[idx].is_none() {
            wave.slots[idx] = Some(SlotWave::default());
        }
        if economy.slots[idx].is_none() {
            economy.slots[idx] = Some(PlayerEconomyEntry {
                gold: STARTING_GOLD,
                lives: STARTING_LIVES,
                kills: 0,
            });
        }
    }
    for idx in 0..proto::MAX_PLAYERS {
        if !active_mask[idx] {
            wave.slots[idx] = None;
            economy.slots[idx] = None;
        }
    }
}

fn drain_inputs(
    queue: Res<InputQueue>,
    mut budget: ResMut<InputBudget>,
    mut economy: ResMut<PlayerEconomy>,
    mut commands: Commands,
) {
    let mut guard = match queue.rx.lock() {
        Ok(g) => g,
        Err(p) => p.into_inner(),
    };
    while let Ok((slot, input)) = guard.try_recv() {
        let idx = slot.0 as usize;
        if idx >= proto::MAX_PLAYERS {
            continue;
        }
        if budget.consumed[idx] >= INPUT_BUDGET_PER_TICK {
            // Drop — slot already spent its budget this tick.
            continue;
        }
        budget.consumed[idx] += 1;
        apply_input(slot, input, &mut economy, &mut commands);
    }
}

fn apply_input(
    slot: proto::PlayerSlot,
    input: Input,
    economy: &mut PlayerEconomy,
    commands: &mut Commands,
) {
    let idx = slot.0 as usize;
    match input {
        Input::PlaceBuilding { col, row, kind } => {
            let cost = build_cost(kind);
            // Reject silently if the slot has no economy entry (vacated mid-flight)
            // or insufficient gold.
            let Some(entry) = economy.slots.get_mut(idx).and_then(|s| s.as_mut()) else {
                return;
            };
            if cost <= 0 || entry.gold < cost {
                return;
            }
            entry.gold -= cost;
            // Treat (col, row) as a 32-pixel grid; centre the entity in the
            // cell. Real collision / path validation lands alongside the
            // path-gen system.
            let x = (col as f32) * 32.0 + 16.0;
            let y = (row as f32) * 32.0 + 16.0;
            commands.spawn((
                BuildingTag {
                    kind,
                    owner: slot,
                    col,
                    row,
                },
                Position(x, y),
                Health {
                    hp: BUILDING_HP,
                    max_hp: BUILDING_HP,
                },
            ));
        }
        Input::Heartbeat { .. } | Input::Leave => {
            // No-op for now; the WS handler tracks lifecycle.
        }
        _ => {
            // SellBuilding / Upgrade / Retarget / UseItem / SkipWave / TogglePause
            // land alongside the matching economy + targeting systems.
        }
    }
}

fn spawn_wave_enemies(clock: Res<SimClock>, mut wave: ResMut<WaveState>, mut commands: Commands) {
    for idx in 0..proto::MAX_PLAYERS {
        let Some(entry) = wave.slots[idx].as_mut() else {
            continue;
        };
        let slot = proto::PlayerSlot(idx as u8);

        if clock.tick >= entry.next_wave_tick && entry.spawned_in_wave >= ENEMIES_PER_WAVE {
            entry.wave = entry.wave.wrapping_add(1);
            entry.spawned_in_wave = 0;
            entry.next_spawn_tick = clock.tick;
            entry.next_wave_tick = clock.tick + WAVE_INTERVAL_TICKS;
        }

        if entry.spawned_in_wave >= ENEMIES_PER_WAVE {
            continue;
        }
        if clock.tick < entry.next_spawn_tick {
            continue;
        }

        let kind = match entry.spawned_in_wave % 4 {
            0 => proto::EnemyKind::Runner,
            1 => proto::EnemyKind::Scout,
            2 => proto::EnemyKind::Brute,
            _ => proto::EnemyKind::Shielded,
        };

        let stripe_y = SLOT_STRIPE_BASE + (idx as f32) * SLOT_STRIPE_HEIGHT;
        commands.spawn((
            EnemyTag { kind, owner: slot },
            Position(SPAWN_X, stripe_y + (entry.spawned_in_wave as f32 * 4.0)),
            Velocity(ENEMY_SPEED, 0.0),
            Health {
                hp: ENEMY_HP,
                max_hp: ENEMY_HP,
            },
        ));

        entry.spawned_in_wave += 1;
        entry.next_spawn_tick = clock.tick + SPAWN_INTERVAL_TICKS;
    }
}

fn move_enemies(mut q: Query<(&Velocity, &mut Position)>) {
    for (vel, mut pos) in q.iter_mut() {
        pos.0 += vel.0 * TICK_DT;
        pos.1 += vel.1 * TICK_DT;
    }
}

fn despawn_offscreen(mut commands: Commands, q: Query<(Entity, &Position), Without<BuildingTag>>) {
    for (entity, pos) in q.iter() {
        if pos.0 > PLAYFIELD_WIDTH {
            commands.entity(entity).despawn();
        }
    }
}

fn emit_snapshot(
    clock: Res<SimClock>,
    wave: Res<WaveState>,
    economy: Res<PlayerEconomy>,
    bcast: Res<SnapshotBroadcast>,
    roster: Res<RosterHandle>,
    enemies: Query<(Entity, &EnemyTag, &Position, &Health)>,
    buildings: Query<(Entity, &BuildingTag, &Health)>,
) {
    if clock.tick % SNAPSHOT_EVERY_N_TICKS != 0 {
        return;
    }

    let active = match roster.0.read() {
        Ok(r) => r.active_slots(),
        Err(p) => p.into_inner().active_slots(),
    };

    // Bin entities by owner slot so the per-field loop is one pass.
    let mut enemy_bins: HashMap<u8, Vec<proto::EnemyDelta>> = HashMap::new();
    for (entity, tag, pos, hp) in enemies.iter() {
        enemy_bins
            .entry(tag.owner.0)
            .or_default()
            .push(proto::EnemyDelta {
                eid: proto::EntityId(entity.index_u32()),
                kind: tag.kind,
                pos: proto::Vec2 { x: pos.0, y: pos.1 },
                hp: hp.hp,
                max_hp: hp.max_hp,
                status_bits: 0,
                destroyed: false,
            });
    }
    let mut building_bins: HashMap<u8, Vec<proto::BuildingDelta>> = HashMap::new();
    for (entity, tag, hp) in buildings.iter() {
        building_bins
            .entry(tag.owner.0)
            .or_default()
            .push(proto::BuildingDelta {
                eid: proto::EntityId(entity.index_u32()),
                kind: tag.kind,
                col: tag.col,
                row: tag.row,
                hp: hp.hp,
                max_hp: hp.max_hp,
                online: true,
                destroyed: false,
            });
    }

    let fields: Vec<proto::FieldDelta> = active
        .iter()
        .map(|slot| {
            let idx = slot.0 as usize;
            let slot_wave = wave
                .slots
                .get(idx)
                .and_then(|w| w.as_ref())
                .map(|w| w.wave)
                .unwrap_or(0);
            let econ = economy
                .slots
                .get(idx)
                .and_then(|s| s.as_ref())
                .copied()
                .unwrap_or(PlayerEconomyEntry {
                    gold: STARTING_GOLD,
                    lives: STARTING_LIVES,
                    kills: 0,
                });
            proto::FieldDelta {
                owner: *slot,
                buildings: building_bins.remove(&slot.0).unwrap_or_default(),
                enemies: enemy_bins.remove(&slot.0).unwrap_or_default(),
                projectiles: Vec::new(),
                gold: econ.gold,
                lives: econ.lives,
                wave: slot_wave,
            }
        })
        .collect();

    let snap = proto::Snapshot {
        tick: clock.tick,
        server_time_ms: clock.elapsed_ms,
        input_ack: 0,
        players: Vec::new(),
        fields,
        keyframe: clock.tick % (SIM_TICK_HZ * 5) == 0,
    };
    let _ = bcast.tx.send(ServerEvent::Snapshot(snap));
}

/// Drive `App::update` on a tokio task at `SIM_TICK_HZ`. Loops until the
/// surrounding task is aborted.
pub async fn run_sim_loop(mut app: App) {
    let mut ticker = time::interval(Duration::from_millis(1000 / SIM_TICK_HZ as u64));
    ticker.set_missed_tick_behavior(time::MissedTickBehavior::Skip);
    loop {
        ticker.tick().await;
        app.update();
    }
}
