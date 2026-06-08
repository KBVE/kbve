use std::collections::HashMap;
use std::sync::{Arc, Mutex, RwLock};
use std::time::Duration;

use bevy::app::App;
use bevy::ecs::entity::Entity;
use bevy::ecs::schedule::SystemSet;
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

#[derive(SystemSet, Clone, Copy, Debug, PartialEq, Eq, Hash)]
pub enum SimSet {
    Tick,
    Spawn,
    Occupancy,
    Input,
    Ai,
    Movement,
    Snapshot,
}

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

#[derive(Component, Clone, Copy)]
pub struct Wander {
    pub origin: Tile,
    pub radius: i32,
    pub period_ticks: u32,
    pub next_tick: u32,
}

impl Wander {
    pub fn new(origin: Tile, radius: i32, period_ticks: u32) -> Self {
        Self {
            origin,
            radius: radius.max(0),
            period_ticks: period_ticks.max(1),
            next_tick: 0,
        }
    }
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
        .configure_sets(
            Update,
            (
                SimSet::Tick,
                SimSet::Spawn,
                SimSet::Occupancy,
                SimSet::Input,
                SimSet::Ai,
                SimSet::Movement,
                SimSet::Snapshot,
            )
                .chain(),
        )
        .add_systems(Update, tick_sim.in_set(SimSet::Tick))
        .add_systems(Update, sync_roster.in_set(SimSet::Spawn))
        .add_systems(Update, rebuild_occupancy.in_set(SimSet::Occupancy))
        .add_systems(Update, drain_inputs.in_set(SimSet::Input))
        .add_systems(Update, wander_system.in_set(SimSet::Ai))
        .add_systems(Update, advance_movement.in_set(SimSet::Movement))
        .add_systems(Update, emit_snapshot.in_set(SimSet::Snapshot));
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
            apply_step(entity, input, &map, &mut occ, &mut pos, &mut mv);
        }
    }
}

fn apply_step(
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
            try_move(entity, *dir, map, occ, pos, mv, None);
        }
        Input::Face { facing } => {
            pos.facing = *facing;
        }
        Input::MoveTo { .. } | Input::Action { .. } | Input::Heartbeat { .. } | Input::Leave => {}
    }
}

fn try_move(
    entity: Entity,
    dir: Dir,
    map: &WalkableMap,
    occ: &mut Occupancy,
    pos: &GridPos,
    mv: &mut MoveTarget,
    bound: Option<(Tile, i32)>,
) -> bool {
    if mv.target.is_some() {
        return false;
    }
    let candidate = step_tile(pos.tile, dir);
    if let Some((origin, radius)) = bound
        && candidate.chebyshev(origin) > radius
    {
        return false;
    }
    if !map.is_walkable(candidate) {
        return false;
    }
    if !occ.is_free(candidate) && occ.occupant(candidate) != Some(entity) {
        return false;
    }
    mv.target = Some(candidate);
    mv.progress = 0;
    occ.set(candidate, entity);
    true
}

fn step_tile(tile: Tile, dir: Dir) -> Tile {
    let (dx, dy) = dir.delta();
    Tile::new(tile.x + dx, tile.y + dy)
}

fn dir_from_u64(v: u64) -> Dir {
    match v & 3 {
        0 => Dir::Up,
        1 => Dir::Down,
        2 => Dir::Left,
        _ => Dir::Right,
    }
}

fn hash3(a: u64, b: u64, c: u64) -> u64 {
    let mut x = a ^ b.rotate_left(17) ^ c.rotate_left(31);
    x = (x ^ (x >> 30)).wrapping_mul(0xbf58_476d_1ce4_e5b9);
    x = (x ^ (x >> 27)).wrapping_mul(0x94d0_49bb_1331_11eb);
    x ^ (x >> 31)
}

fn wander_system(
    clock: Res<SimClock>,
    seed: Res<SimSeed>,
    map: Res<WalkableMap>,
    mut occ: ResMut<Occupancy>,
    mut q: Query<(Entity, &mut GridPos, &mut MoveTarget, &mut Wander)>,
) {
    for (entity, mut pos, mut mv, mut w) in q.iter_mut() {
        if mv.target.is_some() || clock.tick < w.next_tick {
            continue;
        }
        w.next_tick = clock.tick.saturating_add(w.period_ticks);
        let dir = dir_from_u64(hash3(seed.0, entity.index_u32() as u64, clock.tick as u64));
        pos.facing = dir.facing();
        try_move(
            entity,
            dir,
            &map,
            &mut occ,
            &pos,
            &mut mv,
            Some((w.origin, w.radius)),
        );
    }
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

#[allow(clippy::type_complexity)]
fn emit_snapshot(
    clock: Res<SimClock>,
    bcast: Res<SnapshotBroadcast>,
    config: Res<SimConfig>,
    q: Query<(
        Entity,
        &EntityKind,
        Option<&PlayerSlotTag>,
        &GridPos,
        &MoveTarget,
        Option<&Health>,
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
                owner: slot.map(|s| s.0).unwrap_or(proto::PLAYER_SLOT_NONE),
                tile: pos.tile,
                facing: pos.facing,
                sub,
                hp: hp.map(|h| h.hp).unwrap_or(0),
                max_hp: hp.map(|h| h.max_hp).unwrap_or(0),
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

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::HashSet;

    fn harness(seed: u64) -> (App, broadcast::Receiver<ServerEvent>) {
        let (tx, rx) = broadcast::channel(SNAPSHOT_BROADCAST_CAPACITY);
        let (_input_tx, input_rx) = mpsc::unbounded_channel();
        let roster = Arc::new(RwLock::new(Roster::new(4)));
        let map = WalkableMap::open(32, 32);
        let app = build_app(tx, input_rx, roster, seed, SimConfig::default(), map);
        (app, rx)
    }

    #[test]
    fn wanderer_relocates_and_emits_snapshots() {
        let (mut app, mut rx) = harness(0xABCDEF);
        let origin = Tile::new(16, 16);
        app.world_mut().spawn((
            EntityKind(2),
            GridPos::at(origin),
            MoveTarget::default(),
            MoveSpeed { ticks_per_tile: 1 },
            Wander::new(origin, 5, 1),
        ));

        for _ in 0..200 {
            app.update();
        }

        let mut snapshots = 0usize;
        let mut tiles: HashSet<(i32, i32)> = HashSet::new();
        while let Ok(evt) = rx.try_recv() {
            if let ServerEvent::Snapshot(snap) = evt {
                snapshots += 1;
                for e in snap.entities {
                    if e.kind == 2 {
                        tiles.insert((e.tile.x, e.tile.y));
                    }
                }
            }
        }

        assert!(snapshots > 0, "no snapshots emitted");
        assert!(
            tiles.len() > 1,
            "wanderer never moved (visited {} tile)",
            tiles.len()
        );
        assert!(
            tiles
                .iter()
                .all(|(x, y)| { Tile::new(*x, *y).chebyshev(origin) <= 5 }),
            "wanderer left its radius"
        );
    }

    #[test]
    fn non_player_entity_snapshots_without_slot() {
        let (mut app, mut rx) = harness(1);
        app.world_mut().spawn((
            EntityKind(7),
            GridPos::at(Tile::new(3, 3)),
            MoveTarget::default(),
            MoveSpeed::default(),
        ));
        for _ in 0..4 {
            app.update();
        }
        let mut saw = false;
        while let Ok(evt) = rx.try_recv() {
            if let ServerEvent::Snapshot(snap) = evt {
                for e in snap.entities {
                    if e.kind == 7 {
                        saw = true;
                        assert_eq!(e.owner, proto::PLAYER_SLOT_NONE);
                    }
                }
            }
        }
        assert!(saw, "non-player entity missing from snapshot");
    }
}
