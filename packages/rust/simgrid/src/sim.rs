use std::collections::{HashMap, VecDeque};
use std::sync::{Arc, Mutex, RwLock};
use std::time::Duration;

use bevy::app::App;
use bevy::ecs::entity::Entity;
use bevy::ecs::schedule::SystemSet;
use bevy::prelude::{
    Commands, Component, IntoScheduleConfigs, Query, Res, ResMut, Resource, Update, With, Without,
};
use serde_json::json;
use tokio::sync::{broadcast, mpsc};
use tokio::time;

use crate::data::KindRegistry;
use crate::grid::{GridPos, MoveSpeed, MoveTarget, Occupancy, WalkableMap};
use crate::net::Roster;
use crate::proto::{self, Dir, Input, ServerEvent, Tile};

pub const SIM_TICK_HZ: u32 = 20;
pub const SNAPSHOT_EVERY_N_TICKS: u32 = 2;
pub const SNAPSHOT_BROADCAST_CAPACITY: usize = 256;
pub const KEYFRAME_EVERY_N_TICKS: u32 = SIM_TICK_HZ * 5;

pub const PLAYER_KIND: u16 = 0;
pub const MAX_PATH_LEN: usize = 64;

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
    pub player_attack: i32,
    pub spawn: Tile,
    pub ticks_per_tile: u8,
}

impl Default for SimConfig {
    fn default() -> Self {
        Self {
            player_kind: PLAYER_KIND,
            player_hp: 100,
            player_attack: 5,
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

#[derive(Resource, Default)]
pub struct EidIndex {
    by_eid: HashMap<u32, Entity>,
}

#[derive(Resource, Default)]
pub struct PendingActions(Vec<(proto::PlayerSlot, u16, Option<proto::EntityId>)>);

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
pub struct CombatStats {
    pub attack: i32,
}

#[derive(Component, Clone, Default)]
pub struct Inventory {
    pub slots: Vec<(String, u32)>,
}

impl Inventory {
    pub fn add(&mut self, item_ref: &str, count: u32) {
        if let Some(slot) = self.slots.iter_mut().find(|(r, _)| r == item_ref) {
            slot.1 = slot.1.saturating_add(count);
        } else {
            self.slots.push((item_ref.to_string(), count));
        }
    }
}

#[derive(Component, Clone)]
pub struct GroundItem {
    pub item_ref: String,
    pub count: u32,
}

#[derive(Component, Clone, Default)]
pub struct Loot {
    pub item_ref: Option<String>,
}

#[derive(Component, Clone, Default)]
pub struct Path {
    pub steps: VecDeque<Tile>,
}

#[derive(Component, Clone, Copy, Default)]
pub struct StepBuffer {
    pub dir: Option<Dir>,
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

pub fn ground_item_bundle(
    registry: &KindRegistry,
    item_ref: &str,
    count: u32,
    tile: Tile,
) -> Option<(EntityKind, GridPos, MoveTarget, GroundItem)> {
    let kind = registry.kind_of(item_ref)?;
    Some((
        EntityKind(kind),
        GridPos::at(tile),
        MoveTarget::default(),
        GroundItem {
            item_ref: item_ref.to_string(),
            count,
        },
    ))
}

pub fn build_app(
    tx: broadcast::Sender<ServerEvent>,
    input_rx: mpsc::UnboundedReceiver<(proto::PlayerSlot, Input)>,
    roster: Arc<RwLock<Roster>>,
    seed: u64,
    config: SimConfig,
    map: WalkableMap,
    registry: KindRegistry,
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
        .insert_resource(EidIndex::default())
        .insert_resource(PendingActions::default())
        .insert_resource(Occupancy::default())
        .insert_resource(map)
        .insert_resource(config)
        .insert_resource(registry)
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
        .add_systems(
            Update,
            (drain_inputs, apply_actions).chain().in_set(SimSet::Input),
        )
        .add_systems(
            Update,
            (follow_path, wander_system).chain().in_set(SimSet::Ai),
        )
        .add_systems(
            Update,
            (advance_movement, chain_steps)
                .chain()
                .in_set(SimSet::Movement),
        )
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
                CombatStats {
                    attack: config.player_attack,
                },
                Inventory::default(),
                Path::default(),
                StepBuffer::default(),
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

fn rebuild_occupancy(
    mut occ: ResMut<Occupancy>,
    mut index: ResMut<EidIndex>,
    q: Query<(Entity, &GridPos, Option<&MoveTarget>, Option<&GroundItem>)>,
) {
    occ.clear();
    index.by_eid.clear();
    for (entity, pos, mv, item) in q.iter() {
        index.by_eid.insert(entity.index_u32(), entity);
        if item.is_some() {
            continue;
        }
        occ.set(pos.tile, entity);
        if let Some(t) = mv.and_then(|m| m.target) {
            occ.set(t, entity);
        }
    }
}

#[allow(clippy::type_complexity)]
fn drain_inputs(
    queue: Res<InputQueue>,
    map: Res<WalkableMap>,
    mut occ: ResMut<Occupancy>,
    mut actions: ResMut<PendingActions>,
    mut q: Query<(
        Entity,
        &PlayerSlotTag,
        &mut GridPos,
        &mut MoveTarget,
        &mut Path,
        &mut StepBuffer,
    )>,
) {
    let mut pending: HashMap<u16, Vec<Input>> = HashMap::new();
    {
        let mut guard = match queue.rx.lock() {
            Ok(g) => g,
            Err(p) => p.into_inner(),
        };
        while let Ok((slot, input)) = guard.try_recv() {
            if let Input::Action { id, target } = input {
                actions.0.push((slot, id, target));
            } else {
                pending.entry(slot.0).or_default().push(input);
            }
        }
    }
    if pending.is_empty() {
        return;
    }

    for (entity, slot, mut pos, mut mv, mut path, mut buffer) in q.iter_mut() {
        let Some(inputs) = pending.get(&slot.0.0) else {
            continue;
        };
        for input in inputs {
            match input {
                Input::Step { dir } => {
                    path.steps.clear();
                    pos.facing = dir.facing();
                    if mv.target.is_some() {
                        buffer.dir = Some(*dir);
                    } else if try_move(entity, *dir, &map, &mut occ, &pos, &mut mv, None) {
                        buffer.dir = None;
                    }
                }
                Input::MoveTo { tile } => {
                    buffer.dir = None;
                    let from = mv.target.unwrap_or(pos.tile);
                    match map.find_path(from, *tile, MAX_PATH_LEN) {
                        Some(steps) => path.steps = steps.into(),
                        None => path.steps.clear(),
                    }
                }
                Input::Face { facing } => {
                    pos.facing = *facing;
                }
                Input::Action { .. } | Input::Heartbeat { .. } | Input::Leave => {}
            }
        }
    }
}

#[allow(clippy::type_complexity, clippy::too_many_arguments)]
fn apply_actions(
    mut actions: ResMut<PendingActions>,
    index: Res<EidIndex>,
    registry: Res<KindRegistry>,
    bcast: Res<SnapshotBroadcast>,
    mut commands: Commands,
    mut q_players: Query<(
        Entity,
        &PlayerSlotTag,
        &GridPos,
        &CombatStats,
        &mut Inventory,
    )>,
    mut q_mobs: Query<
        (&GridPos, &mut Health, Option<&Loot>, &EntityKind),
        (Without<PlayerSlotTag>, Without<GroundItem>),
    >,
    q_items: Query<(&GridPos, &GroundItem)>,
) {
    if actions.0.is_empty() {
        return;
    }
    let drained: Vec<_> = actions.0.drain(..).collect();

    let mut by_slot: HashMap<u16, Entity> = HashMap::new();
    for (entity, slot, ..) in q_players.iter() {
        by_slot.insert(slot.0.0, entity);
    }

    for (slot, action_id, target) in drained {
        let Some(&player_entity) = by_slot.get(&slot.0) else {
            continue;
        };
        let Some(target_entity) = target.and_then(|t| index.by_eid.get(&t.0).copied()) else {
            continue;
        };

        match action_id {
            proto::ACTION_ATTACK => {
                let Ok((_, _, pos, stats, _)) = q_players.get(player_entity) else {
                    continue;
                };
                let (attacker_tile, damage) = (pos.tile, stats.attack.max(1));
                let Ok((mob_pos, mut hp, loot, kind)) = q_mobs.get_mut(target_entity) else {
                    continue;
                };
                if attacker_tile.chebyshev(mob_pos.tile) > 1 {
                    continue;
                }
                hp.hp -= damage;
                let died = hp.hp <= 0;
                let payload = json!({
                    "attacker": player_entity.index_u32(),
                    "target": target_entity.index_u32(),
                    "target_ref": registry.ref_of(kind.0),
                    "dmg": damage,
                    "died": died,
                })
                .to_string()
                .into_bytes();
                let _ = bcast.tx.send(ServerEvent::Ephemeral {
                    kind: proto::EPHEMERAL_COMBAT,
                    to: proto::PLAYER_SLOT_NONE,
                    payload,
                });
                if died {
                    let drop_tile = mob_pos.tile;
                    let drop_ref = loot.and_then(|l| l.item_ref.clone());
                    commands.entity(target_entity).despawn();
                    if let Some(item_ref) = drop_ref
                        && let Some(bundle) = ground_item_bundle(&registry, &item_ref, 1, drop_tile)
                    {
                        commands.spawn(bundle);
                    }
                }
            }
            proto::ACTION_PICKUP => {
                let Ok((item_pos, item)) = q_items.get(target_entity) else {
                    continue;
                };
                let (item_ref, count, item_tile) =
                    (item.item_ref.clone(), item.count, item_pos.tile);
                let Ok((_, _, pos, _, mut inv)) = q_players.get_mut(player_entity) else {
                    continue;
                };
                if pos.tile.chebyshev(item_tile) > 1 {
                    continue;
                }
                inv.add(&item_ref, count);
                commands.entity(target_entity).despawn();
                let pickup = json!({
                    "item_ref": item_ref,
                    "count": count,
                })
                .to_string()
                .into_bytes();
                let _ = bcast.tx.send(ServerEvent::Ephemeral {
                    kind: proto::EPHEMERAL_PICKUP,
                    to: proto::PlayerSlot(slot.0),
                    payload: pickup,
                });
                send_inventory(&bcast, slot, &inv);
            }
            _ => {}
        }
    }
}

fn send_inventory(bcast: &SnapshotBroadcast, slot: proto::PlayerSlot, inv: &Inventory) {
    let items: Vec<_> = inv
        .slots
        .iter()
        .map(|(r, c)| json!({ "ref": r, "count": c }))
        .collect();
    let payload = json!({ "items": items }).to_string().into_bytes();
    let _ = bcast.tx.send(ServerEvent::Ephemeral {
        kind: proto::EPHEMERAL_INVENTORY,
        to: slot,
        payload,
    });
}

fn follow_path(
    map: Res<WalkableMap>,
    mut occ: ResMut<Occupancy>,
    mut q: Query<(Entity, &mut GridPos, &mut MoveTarget, &mut Path)>,
) {
    for (entity, mut pos, mut mv, mut path) in q.iter_mut() {
        if mv.target.is_some() {
            continue;
        }
        let Some(&next) = path.steps.front() else {
            continue;
        };
        if pos.tile.manhattan(next) != 1 {
            path.steps.clear();
            continue;
        }
        if !map.is_walkable(next) {
            path.steps.clear();
            continue;
        }
        if !occ.is_free(next) && occ.occupant(next) != Some(entity) {
            continue;
        }
        let dir = dir_between(pos.tile, next);
        if let Some(dir) = dir {
            pos.facing = dir.facing();
        }
        path.steps.pop_front();
        mv.target = Some(next);
        mv.progress = 0;
        occ.set(next, entity);
    }
}

fn dir_between(from: Tile, to: Tile) -> Option<Dir> {
    match (to.x - from.x, to.y - from.y) {
        (0, -1) => Some(Dir::Up),
        (0, 1) => Some(Dir::Down),
        (-1, 0) => Some(Dir::Left),
        (1, 0) => Some(Dir::Right),
        _ => None,
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
fn chain_steps(
    map: Res<WalkableMap>,
    mut occ: ResMut<Occupancy>,
    mut q: Query<(Entity, &mut GridPos, &mut MoveTarget, &mut StepBuffer), With<PlayerSlotTag>>,
) {
    for (entity, mut pos, mut mv, mut buffer) in q.iter_mut() {
        let Some(dir) = buffer.dir else {
            continue;
        };
        if mv.target.is_some() {
            continue;
        }
        buffer.dir = None;
        pos.facing = dir.facing();
        try_move(entity, dir, &map, &mut occ, &pos, &mut mv, None);
    }
}

#[allow(clippy::type_complexity)]
fn emit_snapshot(
    clock: Res<SimClock>,
    bcast: Res<SnapshotBroadcast>,
    q: Query<(
        Entity,
        &EntityKind,
        Option<&PlayerSlotTag>,
        &GridPos,
        &MoveTarget,
        Option<&MoveSpeed>,
        Option<&Health>,
    )>,
) {
    if !clock.tick.is_multiple_of(SNAPSHOT_EVERY_N_TICKS) {
        return;
    }

    let entities: Vec<proto::EntityDelta> = q
        .iter()
        .map(|(entity, kind, slot, pos, mv, speed, hp)| {
            let sub = mv
                .target
                .map(|_| {
                    let span = speed.map(|s| s.ticks_per_tile).unwrap_or(1).max(1) as u32;
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

    type Harness = (
        App,
        broadcast::Receiver<ServerEvent>,
        mpsc::UnboundedSender<(proto::PlayerSlot, Input)>,
        Arc<RwLock<Roster>>,
    );

    fn harness(seed: u64) -> Harness {
        let (tx, rx) = broadcast::channel(SNAPSHOT_BROADCAST_CAPACITY);
        let (input_tx, input_rx) = mpsc::unbounded_channel();
        let roster = Arc::new(RwLock::new(Roster::new(4)));
        let map = WalkableMap::open(32, 32);
        let mut registry = KindRegistry::new();
        registry.register_npc("training-dummy");
        registry.register_item("potion");
        let app = build_app(
            tx,
            input_rx,
            roster.clone(),
            seed,
            SimConfig {
                spawn: Tile::new(8, 8),
                ..SimConfig::default()
            },
            map,
            registry,
        );
        (app, rx, input_tx, roster)
    }

    fn join(roster: &Arc<RwLock<Roster>>, name: &str) -> proto::PlayerSlot {
        roster
            .write()
            .unwrap()
            .claim(name.to_string())
            .expect("slot available")
    }

    #[test]
    fn wanderer_relocates_and_emits_snapshots() {
        let (mut app, mut rx, _tx, _roster) = harness(0xABCDEF);
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
        let (mut app, mut rx, _tx, _roster) = harness(1);
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

    #[test]
    fn move_to_walks_full_path() {
        let (mut app, mut rx, input_tx, roster) = harness(7);
        let slot = join(&roster, "walker");
        app.update();

        input_tx
            .send((
                slot,
                Input::MoveTo {
                    tile: Tile::new(12, 8),
                },
            ))
            .unwrap();

        for _ in 0..80 {
            app.update();
        }

        let mut last_tile = None;
        while let Ok(evt) = rx.try_recv() {
            if let ServerEvent::Snapshot(snap) = evt {
                for e in snap.entities {
                    if e.kind == PLAYER_KIND {
                        last_tile = Some(e.tile);
                    }
                }
            }
        }
        assert_eq!(last_tile, Some(Tile::new(12, 8)), "player did not arrive");
    }

    #[test]
    fn buffered_step_chains_after_move() {
        let (mut app, mut rx, input_tx, roster) = harness(9);
        let slot = join(&roster, "chainer");
        app.update();

        input_tx
            .send((slot, Input::Step { dir: Dir::Right }))
            .unwrap();
        app.update();
        input_tx
            .send((slot, Input::Step { dir: Dir::Right }))
            .unwrap();

        for _ in 0..20 {
            app.update();
        }

        let mut last_tile = None;
        while let Ok(evt) = rx.try_recv() {
            if let ServerEvent::Snapshot(snap) = evt {
                for e in snap.entities {
                    if e.kind == PLAYER_KIND {
                        last_tile = Some(e.tile);
                    }
                }
            }
        }
        assert_eq!(
            last_tile,
            Some(Tile::new(10, 8)),
            "second step was not buffered"
        );
    }

    #[test]
    fn attack_kills_mob_and_drops_loot() {
        let (mut app, mut rx, input_tx, roster) = harness(11);
        let slot = join(&roster, "fighter");
        let registry = app.world().resource::<KindRegistry>().clone();
        let dummy_kind = registry.kind_of("training-dummy").unwrap();
        let potion_kind = registry.kind_of("potion").unwrap();

        let mob = app
            .world_mut()
            .spawn((
                EntityKind(dummy_kind),
                GridPos::at(Tile::new(9, 8)),
                MoveTarget::default(),
                MoveSpeed::default(),
                Health { hp: 5, max_hp: 5 },
                Loot {
                    item_ref: Some("potion".into()),
                },
            ))
            .id();
        app.update();

        input_tx
            .send((
                slot,
                Input::Action {
                    id: proto::ACTION_ATTACK,
                    target: Some(proto::EntityId(mob.index_u32())),
                },
            ))
            .unwrap();
        for _ in 0..6 {
            app.update();
        }

        let mut saw_combat = false;
        let mut saw_potion_drop = false;
        while let Ok(evt) = rx.try_recv() {
            match evt {
                ServerEvent::Ephemeral { kind, .. } if kind == proto::EPHEMERAL_COMBAT => {
                    saw_combat = true;
                }
                ServerEvent::Snapshot(snap) => {
                    if snap.entities.iter().any(|e| e.kind == potion_kind) {
                        saw_potion_drop = true;
                    }
                }
                _ => {}
            }
        }
        assert!(saw_combat, "no combat ephemeral emitted");
        assert!(saw_potion_drop, "loot did not drop");
    }

    #[test]
    fn pickup_adds_to_inventory_and_syncs() {
        let (mut app, mut rx, input_tx, roster) = harness(13);
        let slot = join(&roster, "collector");
        let registry = app.world().resource::<KindRegistry>().clone();

        let bundle = ground_item_bundle(&registry, "potion", 2, Tile::new(9, 8)).unwrap();
        let item = app.world_mut().spawn(bundle).id();
        app.update();

        input_tx
            .send((
                slot,
                Input::Action {
                    id: proto::ACTION_PICKUP,
                    target: Some(proto::EntityId(item.index_u32())),
                },
            ))
            .unwrap();
        for _ in 0..6 {
            app.update();
        }

        let mut inventory_payload = None;
        while let Ok(evt) = rx.try_recv() {
            if let ServerEvent::Ephemeral { kind, to, payload } = evt
                && kind == proto::EPHEMERAL_INVENTORY
            {
                assert_eq!(to, slot);
                inventory_payload = Some(String::from_utf8(payload).unwrap());
            }
        }
        let payload = inventory_payload.expect("no inventory sync");
        assert!(payload.contains("potion"), "payload: {payload}");
        assert!(payload.contains("2"), "payload: {payload}");
    }
}
