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

use std::sync::Mutex;
use std::time::Duration;

use bevy::app::App;
use bevy::ecs::entity::Entity;
use bevy::ecs::system::Commands;
use bevy::prelude::{
    Component, IntoScheduleConfigs, Query, Res, ResMut, Resource, Update, Without,
};
use tokio::sync::{broadcast, mpsc};
use tokio::time;

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
const SPAWN_Y: f32 = 240.0;
const ENEMY_SPEED: f32 = 60.0;
const ENEMY_HP: f32 = 50.0;
const ENEMIES_PER_WAVE: u32 = 10;
/// Ticks between consecutive enemy spawns inside a wave (0.5 s at 20 Hz).
const SPAWN_INTERVAL_TICKS: u32 = 10;
/// Ticks between waves (5 s at 20 Hz).
const WAVE_INTERVAL_TICKS: u32 = SIM_TICK_HZ * 5;

const BUILDING_HP: f32 = 200.0;

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
/// sole consumer. `Mutex` is only here so bevy can hold the !Send Receiver
/// inside a `Resource` — we never have actual contention.
#[derive(Resource)]
pub struct InputQueue {
    pub rx: Mutex<mpsc::UnboundedReceiver<(proto::PlayerSlot, Input)>>,
}

#[derive(Resource, Default)]
pub struct WaveState {
    pub wave: u16,
    pub spawned_in_wave: u32,
    pub next_spawn_tick: u32,
    pub next_wave_tick: u32,
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
}

#[derive(Component)]
pub struct BuildingTag {
    pub kind: proto::BuildKind,
    pub owner: proto::PlayerSlot,
    pub col: i32,
    pub row: i32,
}

/// Build a headless bevy `App` wired to broadcast snapshots over `tx` and
/// accept inputs from `input_rx`.
pub fn build_app(
    tx: broadcast::Sender<ServerEvent>,
    input_rx: mpsc::UnboundedReceiver<(proto::PlayerSlot, Input)>,
    seed: u64,
) -> App {
    let mut app = App::new();
    app.insert_resource(SimClock::default())
        .insert_resource(SimSeed(seed))
        .insert_resource(SnapshotBroadcast { tx })
        .insert_resource(InputQueue {
            rx: Mutex::new(input_rx),
        })
        .insert_resource(WaveState::default())
        .add_systems(
            Update,
            (
                tick_sim,
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

fn tick_sim(mut clock: ResMut<SimClock>) {
    clock.tick = clock.tick.wrapping_add(1);
    clock.elapsed_ms = clock.elapsed_ms.wrapping_add(1000 / SIM_TICK_HZ);
}

fn drain_inputs(queue: Res<InputQueue>, mut commands: Commands) {
    let mut guard = match queue.rx.lock() {
        Ok(g) => g,
        Err(p) => p.into_inner(),
    };
    while let Ok((slot, input)) = guard.try_recv() {
        apply_input(slot, input, &mut commands);
    }
}

fn apply_input(slot: proto::PlayerSlot, input: Input, commands: &mut Commands) {
    match input {
        Input::PlaceBuilding { col, row, kind } => {
            // Treat (col, row) as a 32-pixel grid; centre the entity in the
            // cell. Real placement validation (cost, collisions, paths) lands
            // alongside the economy + path-gen systems.
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
    if clock.tick >= wave.next_wave_tick && wave.spawned_in_wave >= ENEMIES_PER_WAVE {
        wave.wave = wave.wave.wrapping_add(1);
        wave.spawned_in_wave = 0;
        wave.next_spawn_tick = clock.tick;
        wave.next_wave_tick = clock.tick + WAVE_INTERVAL_TICKS;
    }

    if wave.spawned_in_wave >= ENEMIES_PER_WAVE {
        return;
    }
    if clock.tick < wave.next_spawn_tick {
        return;
    }

    let kind = match wave.spawned_in_wave % 4 {
        0 => proto::EnemyKind::Runner,
        1 => proto::EnemyKind::Scout,
        2 => proto::EnemyKind::Brute,
        _ => proto::EnemyKind::Shielded,
    };

    commands.spawn((
        EnemyTag { kind },
        Position(SPAWN_X, SPAWN_Y + (wave.spawned_in_wave as f32 * 4.0)),
        Velocity(ENEMY_SPEED, 0.0),
        Health {
            hp: ENEMY_HP,
            max_hp: ENEMY_HP,
        },
    ));

    wave.spawned_in_wave += 1;
    wave.next_spawn_tick = clock.tick + SPAWN_INTERVAL_TICKS;
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
    bcast: Res<SnapshotBroadcast>,
    enemies: Query<(Entity, &EnemyTag, &Position, &Health)>,
    buildings: Query<(Entity, &BuildingTag, &Health)>,
) {
    if clock.tick % SNAPSHOT_EVERY_N_TICKS != 0 {
        return;
    }

    let mut enemy_deltas = Vec::with_capacity(enemies.iter().len());
    for (entity, tag, pos, hp) in enemies.iter() {
        enemy_deltas.push(proto::EnemyDelta {
            eid: proto::EntityId(entity.index_u32()),
            kind: tag.kind,
            pos: proto::Vec2 { x: pos.0, y: pos.1 },
            hp: hp.hp,
            max_hp: hp.max_hp,
            status_bits: 0,
            destroyed: false,
        });
    }

    let mut building_deltas = Vec::with_capacity(buildings.iter().len());
    for (entity, tag, hp) in buildings.iter() {
        building_deltas.push(proto::BuildingDelta {
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

    let field = proto::FieldDelta {
        owner: proto::PlayerSlot(0),
        buildings: building_deltas,
        enemies: enemy_deltas,
        projectiles: Vec::new(),
        gold: 150,
        lives: 20,
        wave: wave.wave,
    };

    let snap = proto::Snapshot {
        tick: clock.tick,
        server_time_ms: clock.elapsed_ms,
        input_ack: 0,
        players: Vec::new(),
        fields: vec![field],
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
