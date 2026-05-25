//! Nexus Defense server-side systems (bevy + rapier2d + axum side).
//! Activated by `--features nexus-defense-server`.
//!
//! Hosts the authoritative simulation. The bevy `App` is built by
//! [`build_app`] and driven by [`run_sim_loop`] from a tokio task — no winit,
//! no rendering, just a fixed-cadence scheduler that calls `App::update`.
//!
//! Each `Snapshot` carries one `FieldDelta` per active roster slot. Enemies,
//! buildings, and projectiles are owned by a `PlayerSlot` and partitioned
//! into the matching field on the way out.

use std::collections::HashMap;
use std::sync::{Arc, Mutex, RwLock};
use std::time::Duration;

use bevy::app::App;
use bevy::ecs::entity::Entity;
use bevy::ecs::system::Commands;
use bevy::prelude::{
    Component, IntoScheduleConfigs, Query, Res, ResMut, Resource, Update, With, Without,
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

/// Hard cap on inputs accepted per slot per sim tick.
const INPUT_BUDGET_PER_TICK: u32 = 8;

// --- Combat tuning -------------------------------------------------------
const TOWER_RANGE: f32 = 140.0;
const TOWER_RANGE_SQ: f32 = TOWER_RANGE * TOWER_RANGE;
const TOWER_DAMAGE: f32 = 18.0;
/// Ticks between shots — 0.4 s.
const TOWER_FIRE_INTERVAL_TICKS: u32 = 8;
const PROJECTILE_SPEED: f32 = 320.0;
const PROJECTILE_HIT_RADIUS: f32 = 12.0;
const PROJECTILE_HIT_RADIUS_SQ: f32 = PROJECTILE_HIT_RADIUS * PROJECTILE_HIT_RADIUS;
/// Distance a projectile can travel before self-despawn.
const PROJECTILE_MAX_RANGE: f32 = 600.0;
/// Gold awarded per enemy kill (uniform for v1; tier scaling later).
const ENEMY_BOUNTY: i32 = 8;

/// Cost lookup matching the catalog in the legacy phaser TD config.
fn build_cost(kind: proto::BuildKind) -> i32 {
    match kind {
        proto::BuildKind::Tower => 60,
        proto::BuildKind::Generator => 50,
        proto::BuildKind::Battery => 80,
        proto::BuildKind::Repair => 90,
        proto::BuildKind::Armoury => 120,
        proto::BuildKind::Village => 70,
        proto::BuildKind::Town | proto::BuildKind::Castle | proto::BuildKind::Nexus => 0,
    }
}

/// True when the building kind actively targets + fires at enemies.
fn building_is_offensive(kind: proto::BuildKind) -> bool {
    matches!(kind, proto::BuildKind::Tower)
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

/// Mailbox of authenticated inputs (slot + payload).
#[derive(Resource)]
pub struct InputQueue {
    pub rx: Mutex<mpsc::UnboundedReceiver<(proto::PlayerSlot, Input)>>,
}

#[derive(Resource, Clone)]
pub struct RosterHandle(pub Arc<RwLock<Roster>>);

#[derive(Default, Clone, Copy)]
pub struct SlotWave {
    pub wave: u16,
    pub spawned_in_wave: u32,
    pub next_spawn_tick: u32,
    pub next_wave_tick: u32,
}

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

#[derive(Resource, Default)]
pub struct InputBudget {
    pub consumed: [u32; proto::MAX_PLAYERS],
}

/// Tracks which slots have already received a GameOver event so we don't
/// flood the broadcast every tick once lives hit zero.
#[derive(Resource, Default)]
pub struct GameOverFlags {
    pub fired: [bool; proto::MAX_PLAYERS],
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

#[derive(Component)]
pub struct TowerStats {
    pub last_fire_tick: u32,
}

#[derive(Component)]
pub struct ProjectileTag {
    pub owner: proto::PlayerSlot,
    pub damage: f32,
    pub remaining_range: f32,
}

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
        .insert_resource(GameOverFlags::default())
        .add_systems(
            Update,
            (
                tick_sim,
                sync_per_slot_state,
                drain_inputs,
                spawn_wave_enemies,
                move_enemies,
                tower_fire,
                move_projectiles,
                projectile_hits,
                enemies_reach_end,
                check_game_over,
                emit_snapshot,
            )
                .chain(),
        );
    app
}

fn tick_sim(mut clock: ResMut<SimClock>, mut budget: ResMut<InputBudget>) {
    clock.tick = clock.tick.wrapping_add(1);
    clock.elapsed_ms = clock.elapsed_ms.wrapping_add(1000 / SIM_TICK_HZ);
    for c in budget.consumed.iter_mut() {
        *c = 0;
    }
}

fn sync_per_slot_state(
    roster: Res<RosterHandle>,
    mut wave: ResMut<WaveState>,
    mut economy: ResMut<PlayerEconomy>,
    mut over: ResMut<GameOverFlags>,
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
            over.fired[idx] = false;
        }
    }
    for idx in 0..proto::MAX_PLAYERS {
        if !active_mask[idx] {
            wave.slots[idx] = None;
            economy.slots[idx] = None;
            over.fired[idx] = false;
        }
    }
}

fn drain_inputs(
    queue: Res<InputQueue>,
    mut budget: ResMut<InputBudget>,
    mut economy: ResMut<PlayerEconomy>,
    clock: Res<SimClock>,
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
            continue;
        }
        budget.consumed[idx] += 1;
        apply_input(slot, input, &mut economy, clock.tick, &mut commands);
    }
}

fn apply_input(
    slot: proto::PlayerSlot,
    input: Input,
    economy: &mut PlayerEconomy,
    tick: u32,
    commands: &mut Commands,
) {
    let idx = slot.0 as usize;
    match input {
        Input::PlaceBuilding { col, row, kind } => {
            let cost = build_cost(kind);
            let Some(entry) = economy.slots.get_mut(idx).and_then(|s| s.as_mut()) else {
                return;
            };
            if cost <= 0 || entry.gold < cost {
                return;
            }
            entry.gold -= cost;
            let x = (col as f32) * 32.0 + 16.0;
            let y = (row as f32) * 32.0 + 16.0;
            let mut spawn = commands.spawn((
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
            if building_is_offensive(kind) {
                spawn.insert(TowerStats {
                    last_fire_tick: tick,
                });
            }
        }
        Input::Heartbeat { .. } | Input::Leave => {}
        _ => {}
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

fn move_enemies(mut q: Query<(&Velocity, &mut Position), With<EnemyTag>>) {
    for (vel, mut pos) in q.iter_mut() {
        pos.0 += vel.0 * TICK_DT;
        pos.1 += vel.1 * TICK_DT;
    }
}

fn tower_fire(
    clock: Res<SimClock>,
    mut towers: Query<(&BuildingTag, &Position, &mut TowerStats)>,
    enemies: Query<(Entity, &EnemyTag, &Position)>,
    mut commands: Commands,
) {
    for (tag, tower_pos, mut stats) in towers.iter_mut() {
        if !building_is_offensive(tag.kind) {
            continue;
        }
        if clock.tick.wrapping_sub(stats.last_fire_tick) < TOWER_FIRE_INTERVAL_TICKS {
            continue;
        }

        // Pick the closest enemy belonging to the same slot, within range.
        let mut best: Option<(Entity, f32, f32, f32)> = None;
        for (e_entity, e_tag, e_pos) in enemies.iter() {
            if e_tag.owner.0 != tag.owner.0 {
                continue;
            }
            let dx = e_pos.0 - tower_pos.0;
            let dy = e_pos.1 - tower_pos.1;
            let dist_sq = dx * dx + dy * dy;
            if dist_sq > TOWER_RANGE_SQ {
                continue;
            }
            if best.map(|(_, b, _, _)| dist_sq < b).unwrap_or(true) {
                best = Some((e_entity, dist_sq, dx, dy));
            }
        }
        let Some((_target_entity, dist_sq, dx, dy)) = best else {
            continue;
        };

        let dist = dist_sq.sqrt().max(0.001);
        let vx = dx / dist * PROJECTILE_SPEED;
        let vy = dy / dist * PROJECTILE_SPEED;

        commands.spawn((
            ProjectileTag {
                owner: tag.owner,
                damage: TOWER_DAMAGE,
                remaining_range: PROJECTILE_MAX_RANGE,
            },
            Position(tower_pos.0, tower_pos.1),
            Velocity(vx, vy),
        ));
        stats.last_fire_tick = clock.tick;
    }
}

fn move_projectiles(
    mut commands: Commands,
    mut q: Query<(Entity, &Velocity, &mut Position, &mut ProjectileTag)>,
) {
    for (entity, vel, mut pos, mut proj) in q.iter_mut() {
        let step_dx = vel.0 * TICK_DT;
        let step_dy = vel.1 * TICK_DT;
        pos.0 += step_dx;
        pos.1 += step_dy;
        let travelled = (step_dx * step_dx + step_dy * step_dy).sqrt();
        proj.remaining_range -= travelled;
        if proj.remaining_range <= 0.0 {
            commands.entity(entity).despawn();
        }
    }
}

fn projectile_hits(
    mut commands: Commands,
    mut economy: ResMut<PlayerEconomy>,
    projectiles: Query<(Entity, &Position, &ProjectileTag)>,
    mut enemies: Query<(Entity, &EnemyTag, &Position, &mut Health), Without<ProjectileTag>>,
) {
    for (p_entity, p_pos, p_tag) in projectiles.iter() {
        // Find first enemy of the same owner within hit radius.
        let mut hit: Option<(Entity, bool)> = None;
        for (e_entity, e_tag, e_pos, mut e_hp) in enemies.iter_mut() {
            if e_tag.owner.0 != p_tag.owner.0 {
                continue;
            }
            let dx = e_pos.0 - p_pos.0;
            let dy = e_pos.1 - p_pos.1;
            if dx * dx + dy * dy > PROJECTILE_HIT_RADIUS_SQ {
                continue;
            }
            e_hp.hp -= p_tag.damage;
            let killed = e_hp.hp <= 0.0;
            hit = Some((e_entity, killed));
            break;
        }
        if let Some((enemy_entity, killed)) = hit {
            commands.entity(p_entity).despawn();
            if killed {
                commands.entity(enemy_entity).despawn();
                let idx = p_tag.owner.0 as usize;
                if let Some(entry) = economy.slots.get_mut(idx).and_then(|s| s.as_mut()) {
                    entry.gold = entry.gold.saturating_add(ENEMY_BOUNTY);
                    entry.kills = entry.kills.wrapping_add(1);
                }
            }
        }
    }
}

fn enemies_reach_end(
    mut commands: Commands,
    mut economy: ResMut<PlayerEconomy>,
    q: Query<(Entity, &EnemyTag, &Position)>,
) {
    for (entity, tag, pos) in q.iter() {
        if pos.0 <= PLAYFIELD_WIDTH {
            continue;
        }
        commands.entity(entity).despawn();
        let idx = tag.owner.0 as usize;
        if let Some(entry) = economy.slots.get_mut(idx).and_then(|s| s.as_mut()) {
            entry.lives = entry.lives.saturating_sub(1).max(0);
        }
    }
}

fn check_game_over(
    economy: Res<PlayerEconomy>,
    bcast: Res<SnapshotBroadcast>,
    mut flags: ResMut<GameOverFlags>,
) {
    for idx in 0..proto::MAX_PLAYERS {
        if flags.fired[idx] {
            continue;
        }
        let Some(entry) = economy.slots.get(idx).and_then(|s| s.as_ref()) else {
            continue;
        };
        if entry.lives <= 0 {
            flags.fired[idx] = true;
            let _ = bcast.tx.send(ServerEvent::GameOver {
                winner: Some(proto::PlayerSlot(idx as u8)),
            });
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
    projectiles: Query<(Entity, &Position, &Velocity, &ProjectileTag)>,
) {
    if clock.tick % SNAPSHOT_EVERY_N_TICKS != 0 {
        return;
    }

    let active = match roster.0.read() {
        Ok(r) => r.active_slots(),
        Err(p) => p.into_inner().active_slots(),
    };

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
    let mut projectile_bins: HashMap<u8, Vec<proto::ProjectileDelta>> = HashMap::new();
    for (entity, pos, vel, tag) in projectiles.iter() {
        projectile_bins
            .entry(tag.owner.0)
            .or_default()
            .push(proto::ProjectileDelta {
                eid: proto::EntityId(entity.index_u32()),
                pos: proto::Vec2 { x: pos.0, y: pos.1 },
                vel: proto::Vec2 { x: vel.0, y: vel.1 },
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
                projectiles: projectile_bins.remove(&slot.0).unwrap_or_default(),
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

pub async fn run_sim_loop(mut app: App) {
    let mut ticker = time::interval(Duration::from_millis(1000 / SIM_TICK_HZ as u64));
    ticker.set_missed_tick_behavior(time::MissedTickBehavior::Skip);
    loop {
        ticker.tick().await;
        app.update();
    }
}
