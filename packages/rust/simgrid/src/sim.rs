use std::collections::HashMap;
use std::sync::{Arc, Mutex, RwLock};
use std::time::Duration;

use bevy::app::App;
use bevy::ecs::entity::Entity;
use bevy::prelude::{
    Commands, Component, IntoScheduleConfigs, Query, Res, ResMut, Resource, Update,
};
use tokio::sync::{broadcast, mpsc};
use tokio::time;

use crate::grid::{GridPos, MoveSpeed, MoveTarget, Occupancy, WalkableMap};
use crate::net::Roster;
use crate::proto::{self, Dir, Input, ServerEvent, Tile};

pub const SIM_TICK_HZ: u32 = 20;
pub const SNAPSHOT_EVERY_N_TICKS: u32 = 2;
pub const SNAPSHOT_BROADCAST_CAPACITY: usize = 256;
pub const KEYFRAME_EVERY_N_TICKS: u32 = SIM_TICK_HZ * 5;

pub const PLAYER_KIND: u16 = 0;

#[derive(Resource, Clone)]
pub struct SimConfig {
    pub player_kind: u16,
    pub player_hp: i32,
    pub spawn: Tile,
    pub ticks_per_tile: u8,
}

impl Default for SimConfig {
    fn default() -> Self {
        Self {
            player_kind: PLAYER_KIND,
            player_hp: 100,
            spawn: Tile::new(0, 0),
            ticks_per_tile: 4,
        }
    }
}

#[derive(Resource, Default)]
pub struct SimClock {
    pub tick: u32,
    pub elapsed_ms: u32,
}

#[derive(Resource, Clone, Copy)]
pub struct SimSeed(pub u64);

#[derive(Resource, Clone)]
pub struct SnapshotBroadcast {
    pub tx: broadcast::Sender<ServerEvent>,
}

#[derive(Resource)]
pub struct InputQueue {
    pub rx: Mutex<mpsc::UnboundedReceiver<(proto::PlayerSlot, Input)>>,
}

#[derive(Resource, Clone)]
pub struct RosterHandle(pub Arc<RwLock<Roster>>);

#[derive(Resource, Default)]
pub struct SpawnedSlots {
    by_slot: HashMap<u16, Entity>,
}

#[derive(Component, Clone, Copy)]
pub struct PlayerSlotTag(pub proto::PlayerSlot);

#[derive(Component, Clone, Copy)]
pub struct EntityKind(pub u16);

#[derive(Component, Clone, Copy)]
pub struct Health {
    pub hp: i32,
    pub max_hp: i32,
}

pub fn build_app(
    tx: broadcast::Sender<ServerEvent>,
    input_rx: mpsc::UnboundedReceiver<(proto::PlayerSlot, Input)>,
    roster: Arc<RwLock<Roster>>,
    seed: u64,
    config: SimConfig,
    map: WalkableMap,
) -> App {
    let mut app = App::new();
    app.insert_resource(SimClock::default())
        .insert_resource(SimSeed(seed))
        .insert_resource(SnapshotBroadcast { tx })
        .insert_resource(InputQueue {
            rx: Mutex::new(input_rx),
        })
        .insert_resource(RosterHandle(roster))
        .insert_resource(SpawnedSlots::default())
        .insert_resource(Occupancy::default())
        .insert_resource(map)
        .insert_resource(config)
        .add_systems(
            Update,
            (
                tick_sim,
                sync_roster,
                rebuild_occupancy,
                drain_inputs,
                advance_movement,
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

fn sync_roster(
    roster: Res<RosterHandle>,
    config: Res<SimConfig>,
    mut spawned: ResMut<SpawnedSlots>,
    mut commands: Commands,
) {
    let active = match roster.0.read() {
        Ok(r) => r.active_slots(),
        Err(p) => p.into_inner().active_slots(),
    };
    let active_keys: Vec<u16> = active.iter().map(|s| s.0).collect();

    for slot in &active {
        if spawned.by_slot.contains_key(&slot.0) {
            continue;
        }
        let entity = commands
            .spawn((
                PlayerSlotTag(*slot),
                EntityKind(config.player_kind),
                GridPos::at(config.spawn),
                MoveTarget::default(),
                MoveSpeed {
                    ticks_per_tile: config.ticks_per_tile,
                },
                Health {
                    hp: config.player_hp,
                    max_hp: config.player_hp,
                },
            ))
            .id();
        spawned.by_slot.insert(slot.0, entity);
    }

    let gone: Vec<u16> = spawned
        .by_slot
        .keys()
        .copied()
        .filter(|k| !active_keys.contains(k))
        .collect();
    for k in gone {
        if let Some(entity) = spawned.by_slot.remove(&k) {
            commands.entity(entity).despawn();
        }
    }
}

fn rebuild_occupancy(mut occ: ResMut<Occupancy>, q: Query<(Entity, &GridPos, &MoveTarget)>) {
    occ.clear();
    for (entity, pos, mv) in q.iter() {
        occ.set(pos.tile, entity);
        if let Some(t) = mv.target {
            occ.set(t, entity);
        }
    }
}

fn drain_inputs(
    queue: Res<InputQueue>,
    map: Res<WalkableMap>,
    mut occ: ResMut<Occupancy>,
    mut q: Query<(Entity, &PlayerSlotTag, &mut GridPos, &mut MoveTarget)>,
) {
    let mut pending: HashMap<u16, Vec<Input>> = HashMap::new();
    {
        let mut guard = match queue.rx.lock() {
            Ok(g) => g,
            Err(p) => p.into_inner(),
        };
        while let Ok((slot, input)) = guard.try_recv() {
            pending.entry(slot.0).or_default().push(input);
        }
    }
    if pending.is_empty() {
        return;
    }

    for (entity, slot, mut pos, mut mv) in q.iter_mut() {
        let Some(inputs) = pending.get(&slot.0.0) else {
            continue;
        };
        for input in inputs {
            apply_input(entity, input, &map, &mut occ, &mut pos, &mut mv);
        }
    }
}

fn apply_input(
    entity: Entity,
    input: &Input,
    map: &WalkableMap,
    occ: &mut Occupancy,
    pos: &mut GridPos,
    mv: &mut MoveTarget,
) {
    match input {
        Input::Step { dir } => {
            pos.facing = dir.facing();
            if mv.target.is_some() {
                return;
            }
            let candidate = step_tile(pos.tile, *dir);
            if !map.is_walkable(candidate) {
                return;
            }
            if !occ.is_free(candidate) && occ.occupant(candidate) != Some(entity) {
                return;
            }
            mv.target = Some(candidate);
            mv.progress = 0;
            occ.set(candidate, entity);
        }
        Input::Face { facing } => {
            pos.facing = *facing;
        }
        Input::MoveTo { .. } | Input::Action { .. } | Input::Heartbeat { .. } | Input::Leave => {}
    }
}

fn step_tile(tile: Tile, dir: Dir) -> Tile {
    let (dx, dy) = dir.delta();
    Tile::new(tile.x + dx, tile.y + dy)
}

fn advance_movement(mut q: Query<(&mut GridPos, &mut MoveTarget, &MoveSpeed)>) {
    for (mut pos, mut mv, speed) in q.iter_mut() {
        let Some(target) = mv.target else {
            continue;
        };
        mv.progress = mv.progress.saturating_add(1);
        if mv.progress >= speed.ticks_per_tile.max(1) {
            pos.tile = target;
            mv.target = None;
            mv.progress = 0;
        }
    }
}

fn emit_snapshot(
    clock: Res<SimClock>,
    bcast: Res<SnapshotBroadcast>,
    config: Res<SimConfig>,
    q: Query<(
        Entity,
        &EntityKind,
        &PlayerSlotTag,
        &GridPos,
        &MoveTarget,
        &Health,
    )>,
) {
    if !clock.tick.is_multiple_of(SNAPSHOT_EVERY_N_TICKS) {
        return;
    }

    let entities: Vec<proto::EntityDelta> = q
        .iter()
        .map(|(entity, kind, slot, pos, mv, hp)| {
            let sub = mv
                .target
                .map(|_| {
                    let span = config.ticks_per_tile.max(1) as u32;
                    ((mv.progress as u32 * 255) / span).min(255) as u8
                })
                .unwrap_or(0);
            proto::EntityDelta {
                eid: proto::EntityId(entity.index_u32()),
                kind: kind.0,
                owner: slot.0,
                tile: pos.tile,
                facing: pos.facing,
                sub,
                hp: hp.hp,
                max_hp: hp.max_hp,
                destroyed: false,
            }
        })
        .collect();

    let snap = proto::Snapshot {
        tick: clock.tick,
        server_time_ms: clock.elapsed_ms,
        input_ack: 0,
        players: Vec::new(),
        entities,
        keyframe: clock.tick.is_multiple_of(KEYFRAME_EVERY_N_TICKS),
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
