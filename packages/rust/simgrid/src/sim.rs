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
use tokio::sync::mpsc;
use tokio::time;

use crate::data::KindRegistry;
use crate::grid::{GridPos, MoveSpeed, MoveTarget, WalkableMap};
use crate::net::Roster;
use crate::proto::{self, Dir, Input, ServerEvent, Tile};

pub const SIM_TICK_HZ: u32 = 20;
pub const SNAPSHOT_EVERY_N_TICKS: u32 = 2;
pub const KEYFRAME_EVERY_N_TICKS: u32 = SIM_TICK_HZ * 5;

pub const PLAYER_KIND: u16 = 0;
pub const MAX_PATH_LEN: usize = 64;

#[derive(SystemSet, Clone, Copy, Debug, PartialEq, Eq, Hash)]
pub enum SimSet {
    Tick,
    Spawn,
    Index,
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
    /// Hostiles won't target players within this Chebyshev distance of
    /// `spawn` — a safe starting town. 0 disables the safe zone.
    pub safe_radius: i32,
}

impl Default for SimConfig {
    fn default() -> Self {
        Self {
            safe_radius: 0,
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
pub struct Outbound {
    pub tx: mpsc::UnboundedSender<ServerEvent>,
}

#[derive(Resource)]
pub struct InputQueue {
    pub rx: Mutex<mpsc::UnboundedReceiver<(proto::PlayerSlot, Input)>>,
}

#[derive(Resource, Clone)]
pub struct RosterHandle(pub Arc<RwLock<Roster>>);

#[derive(Resource, Default)]
pub struct SpawnedSlots {
    by_slot: HashMap<u16, (Entity, String)>,
}

#[derive(Resource, Default)]
pub struct EidIndex {
    by_eid: HashMap<u32, Entity>,
}

#[derive(Resource, Default)]
pub struct PendingActions(Vec<(proto::PlayerSlot, u16, Option<proto::EntityId>)>);

#[derive(Clone)]
pub struct SavedPlayer {
    pub slots: Vec<(String, u32)>,
    pub hp: i32,
    pub weapon: Option<String>,
    pub armor: Option<String>,
    pub level: i32,
    pub xp: i32,
    pub kills: u32,
}

impl Default for SavedPlayer {
    fn default() -> Self {
        Self {
            slots: Vec::new(),
            hp: 0,
            weapon: None,
            armor: None,
            level: 1,
            xp: 0,
            kills: 0,
        }
    }
}

#[derive(Resource, Default)]
pub struct PlayerStore {
    by_username: HashMap<String, SavedPlayer>,
}

#[derive(Resource, Default, Clone)]
pub struct ConsumableEffects(pub HashMap<String, i32>);

#[derive(Clone, Copy, Default)]
pub struct EquipBonus {
    pub attack: i32,
    pub defense: i32,
}

#[derive(Resource, Default, Clone)]
pub struct EquipmentEffects(pub HashMap<String, EquipBonus>);

#[derive(Component, Clone, Default)]
pub struct Equipped {
    pub weapon: Option<String>,
    pub armor: Option<String>,
}

#[derive(Component, Clone, Copy, Default)]
pub struct Defense(pub i32);

#[derive(Component, Clone, Copy)]
pub struct XpState {
    pub level: i32,
    pub xp: i32,
}

impl Default for XpState {
    fn default() -> Self {
        Self { level: 1, xp: 0 }
    }
}

pub const XP_PER_NPC_LEVEL: i32 = 10;
pub const HP_PER_LEVEL: i32 = 10;
pub const ATTACK_PER_LEVEL: i32 = 1;

pub fn xp_to_next(level: i32) -> i32 {
    level.max(1) * 50
}

pub fn level_max_hp(base_hp: i32, level: i32) -> i32 {
    base_hp + (level.max(1) - 1) * HP_PER_LEVEL
}

pub fn level_attack(base_attack: i32, level: i32) -> i32 {
    base_attack + (level.max(1) - 1) * ATTACK_PER_LEVEL
}

#[derive(Resource, Default)]
pub struct RespawnQueue(Vec<(u32, NpcSpec)>);

#[derive(Resource, Default)]
pub struct KillCounts(pub HashMap<u16, u32>);

pub const REGEN_PERIOD_TICKS: u32 = SIM_TICK_HZ * 2;
pub const REGEN_AMOUNT: i32 = 2;
pub const TOWN_REGEN_AMOUNT: i32 = 6;
pub const CRIT_CHANCE_PCT: u64 = 15;

#[derive(Clone, Copy)]
pub struct StatusEffect {
    pub kind: proto::StatusKind,
    pub magnitude: i32,
    pub period_ticks: u32,
    pub next_tick: u32,
    pub expires_tick: u32,
}

#[derive(Component, Default)]
pub struct StatusEffects(pub Vec<StatusEffect>);

impl StatusEffects {
    /// Add or refresh an effect. Same-kind effects never stack: the stronger
    /// magnitude and later expiry win, so re-applying just tops it up.
    pub fn apply(&mut self, e: StatusEffect) {
        if let Some(existing) = self.0.iter_mut().find(|x| x.kind == e.kind) {
            existing.magnitude = existing.magnitude.max(e.magnitude);
            existing.expires_tick = existing.expires_tick.max(e.expires_tick);
            existing.period_ticks = e.period_ticks.max(1);
            existing.next_tick = existing.next_tick.min(e.next_tick);
        } else {
            self.0.push(e);
        }
    }
}

#[derive(Clone, Copy)]
pub struct BuffSpec {
    pub kind: proto::StatusKind,
    pub magnitude: i32,
    pub period_ticks: u32,
    pub duration_ticks: u32,
}

impl BuffSpec {
    pub fn at(&self, now: u32) -> StatusEffect {
        let period = self.period_ticks.max(1);
        StatusEffect {
            kind: self.kind,
            magnitude: self.magnitude,
            period_ticks: period,
            next_tick: now.saturating_add(period),
            expires_tick: now.saturating_add(self.duration_ticks),
        }
    }
}

#[derive(Resource, Default, Clone)]
pub struct BuffEffects(pub HashMap<String, BuffSpec>);

#[derive(Clone, Copy)]
pub struct AggroSpec {
    pub range: i32,
    pub damage: i32,
    pub period_ticks: u32,
    pub poison: Option<BuffSpec>,
}

#[derive(Clone)]
pub struct NpcSpec {
    pub kind: u16,
    pub origin: Tile,
    pub ticks_per_tile: u8,
    pub max_hp: i32,
    pub level: i32,
    pub defense: i32,
    pub wander: Option<(i32, u32)>,
    pub aggro: Option<AggroSpec>,
    pub loot: Option<String>,
    pub respawn_ticks: u32,
}

#[derive(Component, Clone, Copy)]
pub struct Aggro {
    pub range: i32,
    pub damage: i32,
    pub period_ticks: u32,
    pub next_tick: u32,
    pub poison: Option<BuffSpec>,
}

#[derive(Component, Clone)]
pub struct RespawnOnDeath {
    pub spec: NpcSpec,
}

#[derive(Component, Clone, Copy)]
pub struct NpcLevel(pub i32);

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

pub fn spawn_npc_from_spec(commands: &mut Commands, spec: &NpcSpec) {
    let mut e = commands.spawn((
        EntityKind(spec.kind),
        GridPos::at(spec.origin),
        MoveTarget::default(),
        MoveSpeed {
            ticks_per_tile: spec.ticks_per_tile,
        },
        Health {
            hp: spec.max_hp,
            max_hp: spec.max_hp,
        },
        Defense(spec.defense.max(0)),
        NpcLevel(spec.level.max(1)),
        Loot {
            item_ref: spec.loot.clone(),
        },
    ));
    if let Some((radius, period)) = spec.wander {
        e.insert(Wander::new(spec.origin, radius, period));
    }
    if let Some(a) = spec.aggro {
        e.insert(Aggro {
            range: a.range,
            damage: a.damage,
            period_ticks: a.period_ticks,
            next_tick: 0,
            poison: a.poison,
        });
    }
    if spec.respawn_ticks > 0 {
        e.insert(RespawnOnDeath { spec: spec.clone() });
    }
}

pub fn build_app(
    tx: mpsc::UnboundedSender<ServerEvent>,
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
        .insert_resource(Outbound { tx })
        .insert_resource(InputQueue {
            rx: Mutex::new(input_rx),
        })
        .insert_resource(RosterHandle(roster))
        .insert_resource(SpawnedSlots::default())
        .insert_resource(EidIndex::default())
        .insert_resource(PendingActions::default())
        .insert_resource(PlayerStore::default())
        .insert_resource(ConsumableEffects::default())
        .insert_resource(BuffEffects::default())
        .insert_resource(EquipmentEffects::default())
        .insert_resource(RespawnQueue::default())
        .insert_resource(KillCounts::default())
        .insert_resource(map)
        .insert_resource(config)
        .insert_resource(registry)
        .configure_sets(
            Update,
            (
                SimSet::Tick,
                SimSet::Spawn,
                SimSet::Index,
                SimSet::Input,
                SimSet::Ai,
                SimSet::Movement,
                SimSet::Snapshot,
            )
                .chain(),
        )
        .add_systems(Update, tick_sim.in_set(SimSet::Tick))
        .add_systems(
            Update,
            (sync_roster, respawn_npcs).chain().in_set(SimSet::Spawn),
        )
        .add_systems(Update, rebuild_index.in_set(SimSet::Index))
        .add_systems(
            Update,
            (drain_inputs, apply_actions).chain().in_set(SimSet::Input),
        )
        .add_systems(
            Update,
            (follow_path, hostile_ai, wander_system)
                .chain()
                .in_set(SimSet::Ai),
        )
        .add_systems(
            Update,
            (
                advance_movement,
                chain_steps,
                tick_status_effects,
                respawn_players,
                regen_players,
            )
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

#[allow(clippy::too_many_arguments)]
fn sync_roster(
    roster: Res<RosterHandle>,
    config: Res<SimConfig>,
    bcast: Res<Outbound>,
    mut spawned: ResMut<SpawnedSlots>,
    mut store: ResMut<PlayerStore>,
    mut kill_counts: ResMut<KillCounts>,
    equipment: Res<EquipmentEffects>,
    q_saved: Query<(&Inventory, &Health, &Equipped, &XpState)>,
    mut commands: Commands,
) {
    let active: Vec<(proto::PlayerSlot, String)> = {
        let guard = match roster.0.read() {
            Ok(r) => r,
            Err(p) => p.into_inner(),
        };
        guard
            .active_slots()
            .into_iter()
            .map(|s| (s, guard.username(s).unwrap_or_default()))
            .collect()
    };
    let active_keys: Vec<u16> = active.iter().map(|(s, _)| s.0).collect();

    for (slot, username) in &active {
        if spawned.by_slot.contains_key(&slot.0) {
            continue;
        }
        let saved = store.by_username.get(username).cloned();
        let level = saved.as_ref().map(|s| s.level.max(1)).unwrap_or(1);
        let xp = saved.as_ref().map(|s| s.xp).unwrap_or(0);
        let kills = saved.as_ref().map(|s| s.kills).unwrap_or(0);
        kill_counts.0.insert(slot.0, kills);
        let max_hp = level_max_hp(config.player_hp, level);
        let hp = saved
            .as_ref()
            .map(|s| s.hp)
            .filter(|hp| *hp > 0)
            .unwrap_or(max_hp)
            .min(max_hp);
        let weapon = saved.as_ref().and_then(|s| s.weapon.clone());
        let armor = saved.as_ref().and_then(|s| s.armor.clone());
        let inventory = Inventory {
            slots: saved.map(|s| s.slots).unwrap_or_default(),
        };
        if !inventory.slots.is_empty() {
            send_inventory(&bcast, *slot, &inventory);
        }
        let weapon_bonus = weapon
            .as_deref()
            .and_then(|w| equipment.0.get(w).copied())
            .unwrap_or_default();
        let armor_bonus = armor
            .as_deref()
            .and_then(|a| equipment.0.get(a).copied())
            .unwrap_or_default();
        let attack = level_attack(config.player_attack, level) + weapon_bonus.attack;
        let defense = weapon_bonus.defense + armor_bonus.defense;
        if weapon.is_some() {
            send_equipped(&bcast, *slot, "weapon", weapon.as_deref(), attack, defense);
        }
        if armor.is_some() {
            send_equipped(&bcast, *slot, "armor", armor.as_deref(), attack, defense);
        }
        send_stats(&bcast, *slot, level, xp, max_hp, attack, kills);
        let entity = commands
            .spawn((
                PlayerSlotTag(*slot),
                EntityKind(config.player_kind),
                GridPos::at(config.spawn),
                MoveTarget::default(),
                MoveSpeed {
                    ticks_per_tile: config.ticks_per_tile,
                },
                Health { hp, max_hp },
                CombatStats { attack },
                Defense(defense),
                XpState { level, xp },
                inventory,
                Equipped { weapon, armor },
                Path::default(),
                StepBuffer::default(),
                StatusEffects::default(),
            ))
            .id();
        spawned.by_slot.insert(slot.0, (entity, username.clone()));
    }

    let gone: Vec<u16> = spawned
        .by_slot
        .keys()
        .copied()
        .filter(|k| !active_keys.contains(k))
        .collect();
    for k in gone {
        if let Some((entity, username)) = spawned.by_slot.remove(&k) {
            let kills = kill_counts.0.remove(&k).unwrap_or(0);
            if !username.is_empty()
                && let Ok((inv, hp, equipped, xp)) = q_saved.get(entity)
            {
                store.by_username.insert(
                    username,
                    SavedPlayer {
                        slots: inv.slots.clone(),
                        hp: hp.hp,
                        weapon: equipped.weapon.clone(),
                        armor: equipped.armor.clone(),
                        level: xp.level,
                        xp: xp.xp,
                        kills,
                    },
                );
            }
            commands.entity(entity).despawn();
        }
    }
}

/// Rebuild the eid -> entity lookup each tick. Entities are non-solid — there
/// is deliberately no occupancy grid; players and NPCs pass through each other
/// (terrain in `WalkableMap` is the only movement blocker), matching the
/// client's gridEngine `collides: false`.
fn rebuild_index(mut index: ResMut<EidIndex>, q: Query<Entity, With<GridPos>>) {
    index.by_eid.clear();
    for entity in q.iter() {
        index.by_eid.insert(entity.index_u32(), entity);
    }
}

#[allow(clippy::type_complexity, clippy::too_many_arguments)]
fn drain_inputs(
    queue: Res<InputQueue>,
    map: Res<WalkableMap>,
    effects: Res<ConsumableEffects>,
    buffs: Res<BuffEffects>,
    equipment: Res<EquipmentEffects>,
    config: Res<SimConfig>,
    clock: Res<SimClock>,
    bcast: Res<Outbound>,
    mut actions: ResMut<PendingActions>,
    mut q: Query<(
        Entity,
        &PlayerSlotTag,
        &mut GridPos,
        &mut MoveTarget,
        &mut Path,
        &mut StepBuffer,
        &mut Health,
        &mut Inventory,
        &mut Equipped,
        &mut CombatStats,
        &mut Defense,
        &XpState,
        &mut StatusEffects,
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

    for (
        _entity,
        slot,
        mut pos,
        mut mv,
        mut path,
        mut buffer,
        mut hp,
        mut inv,
        mut equipped,
        mut stats,
        mut defense,
        xp,
        mut status,
    ) in q.iter_mut()
    {
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
                    } else if try_move(*dir, &map, &pos, &mut mv, None) {
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
                Input::UseItem { item_ref } => {
                    use_item(
                        &effects,
                        &buffs,
                        &bcast,
                        slot.0,
                        item_ref,
                        clock.tick,
                        &mut hp,
                        &mut inv,
                        &mut status,
                    );
                }
                Input::EquipItem { item_ref } => {
                    let Some(&bonus) = equipment.0.get(item_ref.as_str()) else {
                        continue;
                    };
                    let is_weapon = bonus.attack > 0;
                    let slot_ref = if is_weapon {
                        &mut equipped.weapon
                    } else {
                        &mut equipped.armor
                    };
                    if slot_ref.as_deref() == Some(item_ref.as_str()) {
                        *slot_ref = None;
                    } else {
                        if !inv.slots.iter().any(|(r, c)| r == item_ref && *c > 0) {
                            continue;
                        }
                        *slot_ref = Some(item_ref.clone());
                    }
                    let weapon_bonus = equipped
                        .weapon
                        .as_deref()
                        .and_then(|w| equipment.0.get(w).copied())
                        .unwrap_or_default();
                    let armor_bonus = equipped
                        .armor
                        .as_deref()
                        .and_then(|a| equipment.0.get(a).copied())
                        .unwrap_or_default();
                    stats.attack =
                        level_attack(config.player_attack, xp.level) + weapon_bonus.attack;
                    defense.0 = weapon_bonus.defense + armor_bonus.defense;
                    let changed = if is_weapon {
                        equipped.weapon.as_deref()
                    } else {
                        equipped.armor.as_deref()
                    };
                    send_equipped(
                        &bcast,
                        slot.0,
                        if is_weapon { "weapon" } else { "armor" },
                        changed,
                        stats.attack,
                        defense.0,
                    );
                }
                Input::Action { .. } | Input::Heartbeat { .. } | Input::Leave => {}
            }
        }
    }
}

#[allow(clippy::too_many_arguments)]
fn use_item(
    effects: &ConsumableEffects,
    buffs: &BuffEffects,
    bcast: &Outbound,
    slot: proto::PlayerSlot,
    item_ref: &str,
    now: u32,
    hp: &mut Health,
    inv: &mut Inventory,
    status: &mut StatusEffects,
) {
    let heal = effects.0.get(item_ref).copied();
    let buff = buffs.0.get(item_ref).copied();
    if heal.is_none() && buff.is_none() {
        return;
    }
    let Some(idx) = inv.slots.iter().position(|(r, c)| r == item_ref && *c > 0) else {
        return;
    };
    inv.slots[idx].1 -= 1;
    if inv.slots[idx].1 == 0 {
        inv.slots.remove(idx);
    }
    let heal_amt = heal.unwrap_or(0);
    if heal_amt != 0 {
        hp.hp = (hp.hp + heal_amt).min(hp.max_hp);
    }
    if let Some(b) = buff {
        status.apply(b.at(now));
        send_status(bcast, slot, b.kind, b.magnitude, b.duration_ticks);
    }
    let payload = json!({ "item_ref": item_ref, "heal": heal_amt })
        .to_string()
        .into_bytes();
    let _ = bcast.tx.send(ServerEvent::Ephemeral {
        kind: proto::EPHEMERAL_ITEM_USED,
        to: slot,
        payload,
    });
    send_inventory(bcast, slot, inv);
}

#[allow(clippy::type_complexity, clippy::too_many_arguments)]
fn apply_actions(
    mut actions: ResMut<PendingActions>,
    index: Res<EidIndex>,
    registry: Res<KindRegistry>,
    bcast: Res<Outbound>,
    clock: Res<SimClock>,
    seed: Res<SimSeed>,
    config: Res<SimConfig>,
    equipment: Res<EquipmentEffects>,
    mut respawns: ResMut<RespawnQueue>,
    mut kill_counts: ResMut<KillCounts>,
    mut commands: Commands,
    mut q_players: Query<(
        Entity,
        &PlayerSlotTag,
        &GridPos,
        &mut CombatStats,
        &mut Inventory,
        &mut Health,
        &mut XpState,
        &Equipped,
    )>,
    mut q_mobs: Query<
        (
            &GridPos,
            &mut Health,
            Option<&Loot>,
            Option<&RespawnOnDeath>,
            Option<&Defense>,
            Option<&NpcLevel>,
            &EntityKind,
        ),
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
                let Ok((_, _, pos, stats, ..)) = q_players.get(player_entity) else {
                    continue;
                };
                let (attacker_tile, attack) = (pos.tile, stats.attack);
                let Ok((mob_pos, mut hp, loot, respawn, mob_defense, mob_level, kind)) =
                    q_mobs.get_mut(target_entity)
                else {
                    continue;
                };
                if attacker_tile.chebyshev(mob_pos.tile) > 1 {
                    continue;
                }
                let base = (attack - mob_defense.map(|d| d.0).unwrap_or(0)).max(1);
                let crit = hash3(seed.0, player_entity.index_u32() as u64, clock.tick as u64) % 100
                    < CRIT_CHANCE_PCT;
                let damage = if crit { base * 2 } else { base };
                let kill_xp = mob_level.map(|l| l.0).unwrap_or(1).max(1) * XP_PER_NPC_LEVEL;
                hp.hp -= damage;
                let died = hp.hp <= 0;
                let payload = json!({
                    "attacker": player_entity.index_u32(),
                    "target": target_entity.index_u32(),
                    "target_ref": registry.ref_of(kind.0),
                    "dmg": damage,
                    "crit": crit,
                    "died": died,
                })
                .to_string()
                .into_bytes();
                let _ = bcast.tx.send(ServerEvent::Ephemeral {
                    kind: proto::EPHEMERAL_COMBAT,
                    to: proto::PlayerSlot(slot.0),
                    payload,
                });
                if died {
                    let drop_tile = mob_pos.tile;
                    let drop_ref = loot.and_then(|l| l.item_ref.clone());
                    if let Some(r) = respawn {
                        respawns.0.push((
                            clock.tick.saturating_add(r.spec.respawn_ticks),
                            r.spec.clone(),
                        ));
                    }
                    commands.entity(target_entity).despawn();
                    if let Some(item_ref) = drop_ref
                        && let Some(bundle) = ground_item_bundle(&registry, &item_ref, 1, drop_tile)
                    {
                        commands.spawn(bundle);
                    }
                    let kills = {
                        let k = kill_counts.0.entry(slot.0).or_default();
                        *k += 1;
                        *k
                    };
                    if let Ok((_, _, _, mut stats, _, mut php, mut xp, equipped)) =
                        q_players.get_mut(player_entity)
                    {
                        award_xp(
                            &bcast, slot, &config, &equipment, kill_xp, &mut xp, &mut php,
                            &mut stats, equipped, kills,
                        );
                    }
                }
            }
            proto::ACTION_PICKUP => {
                let Ok((item_pos, item)) = q_items.get(target_entity) else {
                    continue;
                };
                let (item_ref, count, item_tile) =
                    (item.item_ref.clone(), item.count, item_pos.tile);
                let Ok((_, _, pos, _, mut inv, ..)) = q_players.get_mut(player_entity) else {
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

#[allow(clippy::too_many_arguments)]
fn award_xp(
    bcast: &Outbound,
    slot: proto::PlayerSlot,
    config: &SimConfig,
    equipment: &EquipmentEffects,
    gained: i32,
    xp: &mut XpState,
    hp: &mut Health,
    stats: &mut CombatStats,
    equipped: &Equipped,
    kills: u32,
) {
    xp.xp += gained.max(0);
    let mut leveled = false;
    while xp.xp >= xp_to_next(xp.level) {
        xp.xp -= xp_to_next(xp.level);
        xp.level += 1;
        leveled = true;
    }
    if leveled {
        let weapon_bonus = equipped
            .weapon
            .as_deref()
            .and_then(|w| equipment.0.get(w).copied())
            .unwrap_or_default();
        hp.max_hp = level_max_hp(config.player_hp, xp.level);
        hp.hp = hp.max_hp;
        stats.attack = level_attack(config.player_attack, xp.level) + weapon_bonus.attack;
    }
    send_stats(bcast, slot, xp.level, xp.xp, hp.max_hp, stats.attack, kills);
}

fn send_equipped(
    bcast: &Outbound,
    slot: proto::PlayerSlot,
    equip_slot: &str,
    item_ref: Option<&str>,
    attack: i32,
    defense: i32,
) {
    let payload = json!({
        "item_ref": item_ref,
        "slot": equip_slot,
        "attack": attack,
        "defense": defense,
    })
    .to_string()
    .into_bytes();
    let _ = bcast.tx.send(ServerEvent::Ephemeral {
        kind: proto::EPHEMERAL_EQUIPPED,
        to: slot,
        payload,
    });
}

fn send_stats(
    bcast: &Outbound,
    slot: proto::PlayerSlot,
    level: i32,
    xp: i32,
    max_hp: i32,
    attack: i32,
    kills: u32,
) {
    let payload = json!({
        "level": level,
        "xp": xp,
        "xp_next": xp_to_next(level),
        "max_hp": max_hp,
        "attack": attack,
        "kills": kills,
    })
    .to_string()
    .into_bytes();
    let _ = bcast.tx.send(ServerEvent::Ephemeral {
        kind: proto::EPHEMERAL_STATS,
        to: slot,
        payload,
    });
}

fn send_inventory(bcast: &Outbound, slot: proto::PlayerSlot, inv: &Inventory) {
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

fn follow_path(map: Res<WalkableMap>, mut q: Query<(&mut GridPos, &mut MoveTarget, &mut Path)>) {
    for (mut pos, mut mv, mut path) in q.iter_mut() {
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
        let dir = dir_between(pos.tile, next);
        if let Some(dir) = dir {
            pos.facing = dir.facing();
        }
        path.steps.pop_front();
        mv.target = Some(next);
        mv.progress = 0;
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

#[allow(clippy::type_complexity)]
fn hostile_ai(
    clock: Res<SimClock>,
    config: Res<SimConfig>,
    map: Res<WalkableMap>,
    bcast: Res<Outbound>,
    mut q_mobs: Query<(Entity, &mut GridPos, &mut MoveTarget, &mut Aggro), Without<PlayerSlotTag>>,
    mut q_players: Query<
        (
            Entity,
            &GridPos,
            &mut Health,
            &Defense,
            &PlayerSlotTag,
            &mut StatusEffects,
        ),
        With<PlayerSlotTag>,
    >,
) {
    for (mob, mut pos, mut mv, mut aggro) in q_mobs.iter_mut() {
        let mut nearest: Option<(Entity, Tile, i32)> = None;
        for (pe, ppos, hp, _, _, _) in q_players.iter() {
            if hp.hp <= 0 {
                continue;
            }
            // Players inside the spawn safe zone are untouchable — the
            // starting town stays peaceful so nobody loads into combat.
            if config.safe_radius > 0 && ppos.tile.chebyshev(config.spawn) <= config.safe_radius {
                continue;
            }
            let d = pos.tile.chebyshev(ppos.tile);
            if d <= aggro.range && nearest.is_none_or(|(_, _, nd)| d < nd) {
                nearest = Some((pe, ppos.tile, d));
            }
        }
        let Some((player_entity, player_tile, dist)) = nearest else {
            continue;
        };

        if dist <= 1 {
            if let Some(d) = dir_between(pos.tile, player_tile) {
                pos.facing = d.facing();
            }
            if clock.tick < aggro.next_tick {
                continue;
            }
            aggro.next_tick = clock.tick.saturating_add(aggro.period_ticks);
            let Ok((_, _, mut hp, defense, slot, mut status)) = q_players.get_mut(player_entity)
            else {
                continue;
            };
            let dmg = (aggro.damage - defense.0).max(1);
            hp.hp -= dmg;
            let died = hp.hp <= 0;
            if !died && let Some(p) = aggro.poison {
                status.apply(p.at(clock.tick));
                send_status(&bcast, slot.0, p.kind, p.magnitude, p.duration_ticks);
            }
            let payload = json!({
                "attacker": mob.index_u32(),
                "target": player_entity.index_u32(),
                "target_ref": "player",
                "dmg": dmg,
                "died": died,
            })
            .to_string()
            .into_bytes();
            let _ = bcast.tx.send(ServerEvent::Ephemeral {
                kind: proto::EPHEMERAL_COMBAT,
                to: slot.0,
                payload,
            });
            continue;
        }

        if mv.target.is_some() {
            continue;
        }
        let dx = player_tile.x - pos.tile.x;
        let dy = player_tile.y - pos.tile.y;
        let horizontal = if dx > 0 { Dir::Right } else { Dir::Left };
        let vertical = if dy > 0 { Dir::Down } else { Dir::Up };
        let (primary, secondary) = if dx.abs() >= dy.abs() {
            (horizontal, if dy != 0 { vertical } else { horizontal })
        } else {
            (vertical, if dx != 0 { horizontal } else { vertical })
        };
        pos.facing = primary.facing();
        if !try_move(primary, &map, &pos, &mut mv, None) && secondary != primary {
            try_move(secondary, &map, &pos, &mut mv, None);
        }
    }
}

fn send_status(
    bcast: &Outbound,
    slot: proto::PlayerSlot,
    kind: proto::StatusKind,
    magnitude: i32,
    remaining: u32,
) {
    let payload = json!({
        "kind": kind as u8,
        "magnitude": magnitude,
        "remaining": remaining,
    })
    .to_string()
    .into_bytes();
    let _ = bcast.tx.send(ServerEvent::Ephemeral {
        kind: proto::EPHEMERAL_STATUS,
        to: slot,
        payload,
    });
}

/// Drive timed status effects: periodic Poison damage / Regen healing, expiry,
/// and the Haste movement-speed modifier. Runs before respawn so a poison kill
/// resolves to a respawn on the same tick. Players only — town regen and combat
/// stay independent of this.
fn tick_status_effects(
    clock: Res<SimClock>,
    config: Res<SimConfig>,
    mut q: Query<(&mut StatusEffects, &mut Health, &mut MoveSpeed), With<PlayerSlotTag>>,
) {
    let now = clock.tick;
    for (mut status, mut hp, mut speed) in q.iter_mut() {
        if status.0.is_empty() {
            continue;
        }
        for e in status.0.iter_mut() {
            if e.period_ticks == 0 {
                continue;
            }
            while now >= e.next_tick && e.next_tick <= e.expires_tick {
                match e.kind {
                    proto::StatusKind::Poison => hp.hp -= e.magnitude,
                    proto::StatusKind::Regen => hp.hp = (hp.hp + e.magnitude).min(hp.max_hp),
                    proto::StatusKind::Haste => {}
                }
                e.next_tick = e.next_tick.saturating_add(e.period_ticks);
            }
        }
        status.0.retain(|e| now < e.expires_tick);
        let haste = status
            .0
            .iter()
            .filter(|e| e.kind == proto::StatusKind::Haste)
            .map(|e| e.magnitude)
            .max()
            .unwrap_or(0);
        speed.ticks_per_tile = (config.ticks_per_tile as i32 - haste).max(1) as u8;
    }
}

#[allow(clippy::type_complexity)]
fn regen_players(
    clock: Res<SimClock>,
    config: Res<SimConfig>,
    mut q: Query<(&mut Health, &GridPos), With<PlayerSlotTag>>,
) {
    if !clock.tick.is_multiple_of(REGEN_PERIOD_TICKS) {
        return;
    }
    for (mut hp, pos) in q.iter_mut() {
        if hp.hp <= 0 || hp.hp >= hp.max_hp {
            continue;
        }
        // The town fountain mends faster — return to the plaza to recover.
        let in_town =
            config.safe_radius > 0 && pos.tile.chebyshev(config.spawn) <= config.safe_radius;
        let amount = if in_town {
            TOWN_REGEN_AMOUNT
        } else {
            REGEN_AMOUNT
        };
        hp.hp = (hp.hp + amount).min(hp.max_hp);
    }
}

#[allow(clippy::type_complexity)]
fn respawn_players(
    config: Res<SimConfig>,
    mut q: Query<
        (
            &mut GridPos,
            &mut MoveTarget,
            &mut Path,
            &mut StepBuffer,
            &mut Health,
            &mut StatusEffects,
            &mut MoveSpeed,
        ),
        With<PlayerSlotTag>,
    >,
) {
    for (mut pos, mut mv, mut path, mut buffer, mut hp, mut status, mut speed) in q.iter_mut() {
        if hp.hp > 0 {
            continue;
        }
        pos.tile = config.spawn;
        mv.target = None;
        mv.progress = 0;
        path.steps.clear();
        buffer.dir = None;
        hp.hp = hp.max_hp;
        status.0.clear();
        speed.ticks_per_tile = config.ticks_per_tile;
    }
}

fn respawn_npcs(clock: Res<SimClock>, mut queue: ResMut<RespawnQueue>, mut commands: Commands) {
    if queue.0.is_empty() {
        return;
    }
    let now = clock.tick;
    let mut due = Vec::new();
    queue.0.retain(|(t, spec)| {
        if *t <= now {
            due.push(spec.clone());
            false
        } else {
            true
        }
    });
    for spec in due {
        spawn_npc_from_spec(&mut commands, &spec);
    }
}

fn try_move(
    dir: Dir,
    map: &WalkableMap,
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
    mv.target = Some(candidate);
    mv.progress = 0;
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
    mut q: Query<(Entity, &mut GridPos, &mut MoveTarget, &mut Wander)>,
) {
    for (entity, mut pos, mut mv, mut w) in q.iter_mut() {
        if mv.target.is_some() || clock.tick < w.next_tick {
            continue;
        }
        w.next_tick = clock.tick.saturating_add(w.period_ticks);
        let dir = dir_from_u64(hash3(seed.0, entity.index_u32() as u64, clock.tick as u64));
        pos.facing = dir.facing();
        try_move(dir, &map, &pos, &mut mv, Some((w.origin, w.radius)));
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
    mut q: Query<(&mut GridPos, &mut MoveTarget, &mut StepBuffer), With<PlayerSlotTag>>,
) {
    for (mut pos, mut mv, mut buffer) in q.iter_mut() {
        let Some(dir) = buffer.dir else {
            continue;
        };
        if mv.target.is_some() {
            continue;
        }
        buffer.dir = None;
        pos.facing = dir.facing();
        try_move(dir, &map, &pos, &mut mv, None);
    }
}

#[allow(clippy::type_complexity)]
fn emit_snapshot(
    clock: Res<SimClock>,
    bcast: Res<Outbound>,
    q: Query<(
        Entity,
        &EntityKind,
        Option<&PlayerSlotTag>,
        &GridPos,
        &MoveTarget,
        Option<&MoveSpeed>,
        Option<&Health>,
        Option<&StatusEffects>,
    )>,
) {
    if !clock.tick.is_multiple_of(SNAPSHOT_EVERY_N_TICKS) {
        return;
    }

    let now = clock.tick;
    let entities: Vec<proto::EntityDelta> = q
        .iter()
        .map(|(entity, kind, slot, pos, mv, speed, hp, status)| {
            let sub = mv
                .target
                .map(|_| {
                    let span = speed.map(|s| s.ticks_per_tile).unwrap_or(1).max(1) as u32;
                    ((mv.progress as u32 * 255) / span).min(255) as u8
                })
                .unwrap_or(0);
            let effects = status
                .map(|s| {
                    s.0.iter()
                        .map(|e| proto::StatusView {
                            kind: e.kind,
                            remaining: e.expires_tick.saturating_sub(now).min(u16::MAX as u32)
                                as u16,
                        })
                        .collect()
                })
                .unwrap_or_default();
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
                effects,
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
        mpsc::UnboundedReceiver<ServerEvent>,
        mpsc::UnboundedSender<(proto::PlayerSlot, Input)>,
        Arc<RwLock<Roster>>,
    );

    fn test_ulid(name: &str) -> ulid::Ulid {
        let mut h: u64 = 0xcbf2_9ce4_8422_2325;
        for &b in name.as_bytes() {
            h ^= b as u64;
            h = h.wrapping_mul(0x0100_0000_01b3);
        }
        ulid::Ulid::from(h as u128)
    }

    fn harness(seed: u64) -> Harness {
        let (tx, rx) = mpsc::unbounded_channel();
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
            .claim(name.to_string(), test_ulid(name))
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

    fn hostile_spec(kind: u16, origin: Tile) -> NpcSpec {
        NpcSpec {
            kind,
            origin,
            ticks_per_tile: 1,
            max_hp: 30,
            level: 1,
            defense: 0,
            wander: None,
            aggro: Some(AggroSpec {
                range: 8,
                damage: 60,
                period_ticks: 1,
                poison: None,
            }),
            loot: None,
            respawn_ticks: 4,
        }
    }

    fn player_entity(app: &mut App) -> Entity {
        let mut q = app
            .world_mut()
            .query_filtered::<Entity, With<PlayerSlotTag>>();
        q.iter(app.world()).next().expect("player spawned")
    }

    #[test]
    fn safe_zone_blocks_hostile_aggro() {
        let (tx, mut rx) = mpsc::unbounded_channel();
        let (input_tx, input_rx) = mpsc::unbounded_channel();
        let roster = Arc::new(RwLock::new(Roster::new(4)));
        let map = WalkableMap::open(32, 32);
        let mut registry = KindRegistry::new();
        registry.register_npc("training-dummy");
        let mut app = build_app(
            tx,
            input_rx,
            roster.clone(),
            7,
            SimConfig {
                spawn: Tile::new(8, 8),
                safe_radius: 5,
                ..SimConfig::default()
            },
            map,
            registry,
        );
        let _ = &input_tx;
        join(&roster, "townie");
        app.update();

        let registry = app.world().resource::<KindRegistry>().clone();
        let kind = registry.kind_of("training-dummy").unwrap();
        // Hostile spawns adjacent to the player, well inside the safe zone.
        let spec = hostile_spec(kind, Tile::new(9, 8));
        {
            let mut q = bevy::ecs::world::CommandQueue::default();
            let mut commands = Commands::new(&mut q, app.world());
            spawn_npc_from_spec(&mut commands, &spec);
            q.apply(app.world_mut());
        }
        let player = player_entity(&mut app);
        let hp0 = app.world().get::<Health>(player).unwrap().hp;
        for _ in 0..60 {
            app.update();
        }
        let hp1 = app.world().get::<Health>(player).unwrap().hp;
        assert_eq!(hp1, hp0, "safe-zone player took damage");

        let mut hit = false;
        while let Ok(evt) = rx.try_recv() {
            if let ServerEvent::Ephemeral { kind, payload, .. } = evt
                && kind == proto::EPHEMERAL_COMBAT
            {
                let t = String::from_utf8(payload).unwrap();
                if t.contains("\"target_ref\":\"player\"") {
                    hit = true;
                }
            }
        }
        assert!(!hit, "hostile attacked a player in the safe zone");
    }

    #[test]
    fn hostile_chases_and_damages_player() {
        let (mut app, mut rx, _tx, roster) = harness(21);
        let _slot = join(&roster, "victim");
        app.update();

        let registry = app.world().resource::<KindRegistry>().clone();
        let kind = registry.kind_of("training-dummy").unwrap();
        let spec = hostile_spec(kind, Tile::new(13, 8));
        {
            let mut commands_queue = bevy::ecs::world::CommandQueue::default();
            let mut commands = Commands::new(&mut commands_queue, app.world());
            spawn_npc_from_spec(&mut commands, &spec);
            commands_queue.apply(app.world_mut());
        }

        for _ in 0..120 {
            app.update();
        }

        let mut saw_player_hit = false;
        while let Ok(evt) = rx.try_recv() {
            if let ServerEvent::Ephemeral { kind, payload, .. } = evt
                && kind == proto::EPHEMERAL_COMBAT
            {
                let text = String::from_utf8(payload).unwrap();
                if text.contains("\"target_ref\":\"player\"") {
                    saw_player_hit = true;
                }
            }
        }
        assert!(saw_player_hit, "hostile never reached/attacked the player");
    }

    #[test]
    fn regen_heals_wounded_player_over_time() {
        let (mut app, _rx, _tx, roster) = harness(51);
        let _slot = join(&roster, "wounded");
        app.update();
        let player = player_entity(&mut app);
        {
            let mut hp = app.world_mut().get_mut::<Health>(player).unwrap();
            hp.hp = 40;
        }
        for _ in 0..(REGEN_PERIOD_TICKS as usize * 3 + 2) {
            app.update();
        }
        let hp = app.world().get::<Health>(player).unwrap().hp;
        assert!(hp > 40, "regen did not heal (hp={hp})");
        assert!(hp <= 100, "regen overhealed past max (hp={hp})");
    }

    #[test]
    fn kills_counted_in_stats_payload() {
        let (mut app, mut rx, input_tx, roster) = harness(53);
        let slot = join(&roster, "hunter");
        app.update();
        let registry = app.world().resource::<KindRegistry>().clone();
        let kind = registry.kind_of("training-dummy").unwrap();
        let mut spec = hostile_spec(kind, Tile::new(9, 8));
        spec.aggro = None;
        spec.max_hp = 1;
        spec.respawn_ticks = 0;
        let mob = {
            let mut q = bevy::ecs::world::CommandQueue::default();
            let mut commands = Commands::new(&mut q, app.world());
            spawn_npc_from_spec(&mut commands, &spec);
            q.apply(app.world_mut());
            let mut qq = app
                .world_mut()
                .query_filtered::<(Entity, &EntityKind), Without<PlayerSlotTag>>();
            qq.iter(app.world())
                .find(|(_, k)| k.0 == kind)
                .map(|(e, _)| e)
                .unwrap()
        };
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
        for _ in 0..4 {
            app.update();
        }
        let mut saw = false;
        while let Ok(evt) = rx.try_recv() {
            if let ServerEvent::Ephemeral { kind, payload, .. } = evt
                && kind == proto::EPHEMERAL_STATS
            {
                let t = String::from_utf8(payload).unwrap();
                if t.contains("\"kills\":1") {
                    saw = true;
                }
            }
        }
        assert!(saw, "kills not reflected in stats payload");
    }

    #[test]
    fn dead_player_respawns_at_spawn_with_full_hp() {
        let (mut app, _rx, _tx, roster) = harness(23);
        let _slot = join(&roster, "phoenix");
        app.update();

        let player = player_entity(&mut app);
        {
            let mut pos = app.world_mut().get_mut::<GridPos>(player).unwrap();
            pos.tile = Tile::new(20, 20);
        }
        {
            let mut hp = app.world_mut().get_mut::<Health>(player).unwrap();
            hp.hp = 0;
        }
        for _ in 0..3 {
            app.update();
        }

        let hp = app.world().get::<Health>(player).unwrap();
        let pos = app.world().get::<GridPos>(player).unwrap();
        assert_eq!(hp.hp, hp.max_hp, "hp not restored");
        assert_eq!(pos.tile, Tile::new(8, 8), "not back at spawn");
    }

    #[test]
    fn use_item_heals_and_consumes() {
        let (mut app, mut rx, input_tx, roster) = harness(25);
        let slot = join(&roster, "drinker");
        app.update();

        app.world_mut()
            .insert_resource(ConsumableEffects(HashMap::from([(
                "potion".to_string(),
                25,
            )])));

        let player = player_entity(&mut app);
        {
            let mut inv = app.world_mut().get_mut::<Inventory>(player).unwrap();
            inv.add("potion", 2);
        }
        {
            let mut hp = app.world_mut().get_mut::<Health>(player).unwrap();
            hp.hp = 50;
        }

        input_tx
            .send((
                slot,
                Input::UseItem {
                    item_ref: "potion".into(),
                },
            ))
            .unwrap();
        for _ in 0..3 {
            app.update();
        }

        let hp = app.world().get::<Health>(player).unwrap();
        let inv = app.world().get::<Inventory>(player).unwrap();
        assert_eq!(hp.hp, 75, "potion did not heal");
        assert_eq!(inv.slots, vec![("potion".to_string(), 1)]);

        let mut saw_used = false;
        while let Ok(evt) = rx.try_recv() {
            if let ServerEvent::Ephemeral { kind, .. } = evt
                && kind == proto::EPHEMERAL_ITEM_USED
            {
                saw_used = true;
            }
        }
        assert!(saw_used, "no item-used ephemeral");
    }

    #[test]
    fn equip_weapon_boosts_attack_and_persists() {
        let (mut app, mut rx, input_tx, roster) = harness(33);
        let slot = join(&roster, "knight");
        app.update();

        app.world_mut()
            .insert_resource(EquipmentEffects(HashMap::from([(
                "iron-sword".to_string(),
                EquipBonus {
                    attack: 7,
                    defense: 0,
                },
            )])));

        let player = player_entity(&mut app);
        {
            let mut inv = app.world_mut().get_mut::<Inventory>(player).unwrap();
            inv.add("iron-sword", 1);
        }

        input_tx
            .send((
                slot,
                Input::EquipItem {
                    item_ref: "iron-sword".into(),
                },
            ))
            .unwrap();
        for _ in 0..3 {
            app.update();
        }

        let stats = app.world().get::<CombatStats>(player).unwrap();
        assert_eq!(stats.attack, 5 + 7, "bonus not applied");

        let mut saw_equipped = false;
        while let Ok(evt) = rx.try_recv() {
            if let ServerEvent::Ephemeral { kind, to, .. } = evt
                && kind == proto::EPHEMERAL_EQUIPPED
            {
                assert_eq!(to, slot);
                saw_equipped = true;
            }
        }
        assert!(saw_equipped, "no equipped ephemeral");

        roster.write().unwrap().release(slot);
        app.update();
        let slot2 = join(&roster, "knight");
        for _ in 0..3 {
            app.update();
        }
        let player2 = player_entity(&mut app);
        let stats2 = app.world().get::<CombatStats>(player2).unwrap();
        assert_eq!(stats2.attack, 5 + 7, "weapon not restored on rejoin");

        input_tx
            .send((
                slot2,
                Input::EquipItem {
                    item_ref: "iron-sword".into(),
                },
            ))
            .unwrap();
        for _ in 0..3 {
            app.update();
        }
        let stats3 = app.world().get::<CombatStats>(player2).unwrap();
        assert_eq!(stats3.attack, 5, "re-equip did not toggle off");
    }

    #[test]
    fn armor_equip_reduces_incoming_damage() {
        let (mut app, _rx, input_tx, roster) = harness(41);
        let slot = join(&roster, "tank");
        app.update();

        app.world_mut()
            .insert_resource(EquipmentEffects(HashMap::from([(
                "iron-shield".to_string(),
                EquipBonus {
                    attack: 0,
                    defense: 3,
                },
            )])));

        let player = player_entity(&mut app);
        {
            let mut inv = app.world_mut().get_mut::<Inventory>(player).unwrap();
            inv.add("iron-shield", 1);
        }
        input_tx
            .send((
                slot,
                Input::EquipItem {
                    item_ref: "iron-shield".into(),
                },
            ))
            .unwrap();
        app.update();

        let defense = app.world().get::<Defense>(player).unwrap();
        assert_eq!(defense.0, 3, "shield defense not applied");
        let equipped = app.world().get::<Equipped>(player).unwrap();
        assert_eq!(equipped.armor.as_deref(), Some("iron-shield"));
        assert!(equipped.weapon.is_none(), "shield must not occupy weapon");

        let registry = app.world().resource::<KindRegistry>().clone();
        let kind = registry.kind_of("training-dummy").unwrap();
        let mut spec = hostile_spec(kind, Tile::new(9, 8));
        spec.aggro = Some(AggroSpec {
            range: 8,
            damage: 5,
            period_ticks: 1,
            poison: None,
        });
        {
            let mut commands_queue = bevy::ecs::world::CommandQueue::default();
            let mut commands = Commands::new(&mut commands_queue, app.world());
            spawn_npc_from_spec(&mut commands, &spec);
            commands_queue.apply(app.world_mut());
        }
        let hp_before = app.world().get::<Health>(player).unwrap().hp;
        for _ in 0..40 {
            app.update();
        }
        let hp_after = app.world().get::<Health>(player).unwrap().hp;
        let lost = hp_before - hp_after;
        assert!(lost > 0, "mob never hit");
        let hits = lost / 2;
        assert_eq!(lost % 2, 0, "damage should be (5-3)=2 per hit, lost {lost}");
        assert!(hits > 0);
    }

    #[test]
    fn kills_award_xp_and_level_up_grows_stats() {
        let (mut app, mut rx, input_tx, roster) = harness(43);
        let slot = join(&roster, "grinder");
        app.update();

        let registry = app.world().resource::<KindRegistry>().clone();
        let kind = registry.kind_of("training-dummy").unwrap();
        let player = player_entity(&mut app);

        for _ in 0..5 {
            let mut spec = hostile_spec(kind, Tile::new(9, 8));
            spec.aggro = None;
            spec.max_hp = 1;
            spec.level = 1;
            spec.respawn_ticks = 0;
            let mob = {
                let mut commands_queue = bevy::ecs::world::CommandQueue::default();
                let mut commands = Commands::new(&mut commands_queue, app.world());
                spawn_npc_from_spec(&mut commands, &spec);
                commands_queue.apply(app.world_mut());
                let mut q = app
                    .world_mut()
                    .query_filtered::<(Entity, &EntityKind), Without<PlayerSlotTag>>();
                q.iter(app.world())
                    .find(|(_, k)| k.0 == kind)
                    .map(|(e, _)| e)
                    .expect("mob spawned")
            };
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
            for _ in 0..3 {
                app.update();
            }
        }

        let xp = app.world().get::<XpState>(player).unwrap();
        assert_eq!(xp.level, 2, "5 level-1 kills (50xp) should reach level 2");
        assert_eq!(xp.xp, 0);
        let hp = app.world().get::<Health>(player).unwrap();
        assert_eq!(hp.max_hp, 110, "level 2 max hp");
        assert_eq!(hp.hp, 110, "level-up heals to full");
        let stats = app.world().get::<CombatStats>(player).unwrap();
        assert_eq!(stats.attack, 6, "level 2 attack");

        let mut saw_stats = false;
        while let Ok(evt) = rx.try_recv() {
            if let ServerEvent::Ephemeral { kind, to, payload } = evt
                && kind == proto::EPHEMERAL_STATS
            {
                assert_eq!(to, slot);
                let text = String::from_utf8(payload).unwrap();
                if text.contains("\"level\":2") {
                    saw_stats = true;
                }
            }
        }
        assert!(saw_stats, "no level-2 stats ephemeral");
    }

    #[test]
    fn level_persists_across_rejoin() {
        let (mut app, _rx, _tx, roster) = harness(45);
        let slot = join(&roster, "veteran");
        app.update();
        let player = player_entity(&mut app);
        {
            let mut xp = app.world_mut().get_mut::<XpState>(player).unwrap();
            xp.level = 3;
            xp.xp = 20;
        }
        roster.write().unwrap().release(slot);
        app.update();
        let _slot2 = join(&roster, "veteran");
        for _ in 0..2 {
            app.update();
        }
        let player2 = player_entity(&mut app);
        let xp = app.world().get::<XpState>(player2).unwrap();
        assert_eq!((xp.level, xp.xp), (3, 20), "level/xp not restored");
        let hp = app.world().get::<Health>(player2).unwrap();
        assert_eq!(hp.max_hp, 120, "level 3 max hp not derived on restore");
        let stats = app.world().get::<CombatStats>(player2).unwrap();
        assert_eq!(stats.attack, 7, "level 3 attack not derived on restore");
    }

    #[test]
    fn inventory_persists_across_rejoin() {
        let (mut app, mut rx, _tx, roster) = harness(27);
        let slot = join(&roster, "returning");
        app.update();

        let player = player_entity(&mut app);
        {
            let mut inv = app.world_mut().get_mut::<Inventory>(player).unwrap();
            inv.add("potion", 3);
        }

        roster.write().unwrap().release(slot);
        app.update();
        while rx.try_recv().is_ok() {}

        let slot2 = join(&roster, "returning");
        for _ in 0..3 {
            app.update();
        }

        let mut restored = None;
        while let Ok(evt) = rx.try_recv() {
            if let ServerEvent::Ephemeral { kind, to, payload } = evt
                && kind == proto::EPHEMERAL_INVENTORY
            {
                assert_eq!(to, slot2);
                restored = Some(String::from_utf8(payload).unwrap());
            }
        }
        let payload = restored.expect("no inventory restore on rejoin");
        assert!(payload.contains("potion"), "payload: {payload}");
        assert!(payload.contains("3"), "payload: {payload}");
    }

    #[test]
    fn slain_npc_respawns_after_delay() {
        let (mut app, mut rx, input_tx, roster) = harness(31);
        let slot = join(&roster, "slayer");
        app.update();

        let registry = app.world().resource::<KindRegistry>().clone();
        let kind = registry.kind_of("training-dummy").unwrap();
        let mut spec = hostile_spec(kind, Tile::new(9, 8));
        spec.aggro = None;
        spec.max_hp = 1;
        spec.respawn_ticks = 4;
        let mob = {
            let mut commands_queue = bevy::ecs::world::CommandQueue::default();
            let mut commands = Commands::new(&mut commands_queue, app.world());
            spawn_npc_from_spec(&mut commands, &spec);
            commands_queue.apply(app.world_mut());
            let mut q = app
                .world_mut()
                .query_filtered::<(Entity, &EntityKind), Without<PlayerSlotTag>>();
            q.iter(app.world())
                .find(|(_, k)| k.0 == kind)
                .map(|(e, _)| e)
                .expect("mob spawned")
        };
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
        for _ in 0..12 {
            app.update();
        }
        while rx.try_recv().is_ok() {}

        let mut q = app
            .world_mut()
            .query_filtered::<&EntityKind, Without<PlayerSlotTag>>();
        let alive = q.iter(app.world()).filter(|k| k.0 == kind).count();
        assert_eq!(alive, 1, "npc did not respawn");
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

    #[test]
    fn poison_damages_over_time_then_expires() {
        let (mut app, _rx, _tx, roster) = harness(61);
        let _slot = join(&roster, "envenomed");
        app.update();
        let player = player_entity(&mut app);
        let now = app.world().resource::<SimClock>().tick;
        {
            let mut se = app.world_mut().get_mut::<StatusEffects>(player).unwrap();
            se.apply(StatusEffect {
                kind: proto::StatusKind::Poison,
                magnitude: 5,
                period_ticks: 2,
                next_tick: now + 2,
                expires_tick: now + 8,
            });
        }
        for _ in 0..10 {
            app.update();
        }
        let hp_after = app.world().get::<Health>(player).unwrap().hp;
        assert!(hp_after < 100, "poison dealt no damage (hp={hp_after})");
        assert!(
            app.world()
                .get::<StatusEffects>(player)
                .unwrap()
                .0
                .is_empty(),
            "poison never expired"
        );
        for _ in 0..6 {
            app.update();
        }
        let hp_settled = app.world().get::<Health>(player).unwrap().hp;
        assert_eq!(hp_settled, hp_after, "poison kept ticking after expiry");
    }

    #[test]
    fn regen_buff_heals_and_shows_in_snapshot() {
        let (mut app, mut rx, input_tx, roster) = harness(62);
        let slot = join(&roster, "mender");
        app.update();
        app.world_mut().insert_resource(BuffEffects(HashMap::from([(
            "elixir".to_string(),
            BuffSpec {
                kind: proto::StatusKind::Regen,
                magnitude: 4,
                period_ticks: 2,
                duration_ticks: 8,
            },
        )])));
        let player = player_entity(&mut app);
        {
            let mut inv = app.world_mut().get_mut::<Inventory>(player).unwrap();
            inv.add("elixir", 1);
        }
        {
            let mut hp = app.world_mut().get_mut::<Health>(player).unwrap();
            hp.hp = 50;
        }
        input_tx
            .send((
                slot,
                Input::UseItem {
                    item_ref: "elixir".into(),
                },
            ))
            .unwrap();
        for _ in 0..10 {
            app.update();
        }
        let hp = app.world().get::<Health>(player).unwrap().hp;
        assert!(hp > 50, "regen buff did not heal (hp={hp})");

        let mut saw_effect = false;
        let mut saw_status_ephemeral = false;
        while let Ok(evt) = rx.try_recv() {
            match evt {
                ServerEvent::Snapshot(snap) => {
                    for e in snap.entities {
                        if e.effects.iter().any(|s| s.kind == proto::StatusKind::Regen) {
                            saw_effect = true;
                        }
                    }
                }
                ServerEvent::Ephemeral { kind, .. } if kind == proto::EPHEMERAL_STATUS => {
                    saw_status_ephemeral = true;
                }
                _ => {}
            }
        }
        assert!(saw_effect, "regen effect missing from snapshot");
        assert!(saw_status_ephemeral, "no status ephemeral emitted");
    }

    #[test]
    fn haste_buff_speeds_movement_then_restores() {
        let (mut app, _rx, input_tx, roster) = harness(63);
        let slot = join(&roster, "sprinter");
        app.update();
        app.world_mut().insert_resource(BuffEffects(HashMap::from([(
            "swift-tonic".to_string(),
            BuffSpec {
                kind: proto::StatusKind::Haste,
                magnitude: 1,
                period_ticks: 0,
                duration_ticks: 5,
            },
        )])));
        let player = player_entity(&mut app);
        let base = app.world().get::<MoveSpeed>(player).unwrap().ticks_per_tile;
        {
            let mut inv = app.world_mut().get_mut::<Inventory>(player).unwrap();
            inv.add("swift-tonic", 1);
        }
        input_tx
            .send((
                slot,
                Input::UseItem {
                    item_ref: "swift-tonic".into(),
                },
            ))
            .unwrap();
        for _ in 0..2 {
            app.update();
        }
        let hasted = app.world().get::<MoveSpeed>(player).unwrap().ticks_per_tile;
        assert_eq!(hasted, base - 1, "haste did not speed movement");
        for _ in 0..8 {
            app.update();
        }
        let restored = app.world().get::<MoveSpeed>(player).unwrap().ticks_per_tile;
        assert_eq!(restored, base, "speed not restored after haste expired");
    }

    #[test]
    fn venomous_mob_poisons_player_on_hit() {
        let (mut app, mut rx, _tx, roster) = harness(64);
        let _slot = join(&roster, "bitten");
        app.update();
        let registry = app.world().resource::<KindRegistry>().clone();
        let kind = registry.kind_of("training-dummy").unwrap();
        let mut spec = hostile_spec(kind, Tile::new(9, 8));
        spec.aggro = Some(AggroSpec {
            range: 8,
            damage: 3,
            period_ticks: 2,
            poison: Some(BuffSpec {
                kind: proto::StatusKind::Poison,
                magnitude: 2,
                period_ticks: 1,
                duration_ticks: 6,
            }),
        });
        {
            let mut q = bevy::ecs::world::CommandQueue::default();
            let mut commands = Commands::new(&mut q, app.world());
            spawn_npc_from_spec(&mut commands, &spec);
            q.apply(app.world_mut());
        }
        let player = player_entity(&mut app);
        for _ in 0..30 {
            app.update();
        }
        let poisoned = app
            .world()
            .get::<StatusEffects>(player)
            .unwrap()
            .0
            .iter()
            .any(|e| e.kind == proto::StatusKind::Poison);
        let mut saw_status = false;
        while let Ok(evt) = rx.try_recv() {
            if let ServerEvent::Ephemeral { kind, .. } = evt
                && kind == proto::EPHEMERAL_STATUS
            {
                saw_status = true;
            }
        }
        assert!(
            poisoned || saw_status,
            "venomous mob never poisoned the player"
        );
    }
}
