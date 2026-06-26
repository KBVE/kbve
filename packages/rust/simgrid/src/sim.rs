use std::collections::{HashMap, HashSet};
use std::sync::{Arc, Mutex, RwLock};
use std::time::Duration;

use bevy::app::App;
use bevy::ecs::entity::Entity;
use bevy::ecs::schedule::SystemSet;
use bevy::prelude::{
    Added, Commands, Component, IntoScheduleConfigs, Query, RemovedComponents, Res, ResMut,
    Resource, Update, With, Without,
};
use tokio::sync::mpsc;
use tokio::time;

use crate::blackjack::{self, BjInput, PendingBlackjack, Tables};
use crate::combat;
use crate::data::KindRegistry;
use crate::float_move::FloatBody;
use crate::grid::{
    FloatMove, Floor, GridPos, MoveSpeed, MoveTarget, StairGrace, Stairs, WalkableMap,
};
use crate::net::Roster;
use crate::proto::{self, Dir, Input, ServerEvent, Tile};
use crate::rng::hash3;
use crate::shop::{PendingShop, ShopInput};
use crate::trade::{PendingTrades, TradeInput};

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
    /// Items granted to a brand-new player (no saved state). Returning players
    /// keep their persisted inventory instead.
    pub starting_inventory: Vec<(String, u32)>,
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
            starting_inventory: Vec::new(),
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
    pub by_slot: HashMap<u16, (Entity, String)>,
}

#[derive(Resource, Default)]
pub struct EidIndex {
    pub by_eid: HashMap<u32, Entity>,
}

#[derive(Resource, Default)]
pub struct PendingActions(Vec<(proto::PlayerSlot, u16, Option<proto::EntityId>)>);

/// Items a player dropped this tick, queued for `apply_drops` to spawn as
/// ground loot at the given tile (item already removed from the inventory).
#[derive(Resource, Default)]
pub struct PendingDrops(Vec<(Tile, String, u32)>);

/// How a deployable item (e.g. `campfire-kit`) becomes a placed world object:
/// which env ref to spawn and the behavior to give it. Game-supplied (the sim is
/// content-agnostic); arpg-server inserts the table after `build_app`.
#[derive(Clone)]
pub struct DeployableSpec {
    pub env_ref: String,
    pub opts: EnvOpts,
}

/// item_ref -> how to place it. Empty by default; a game registers its
/// deployables (campfire-kit, etc.). A PlaceItem for an unlisted ref is ignored.
#[derive(Resource, Default)]
pub struct Deployables(pub HashMap<String, DeployableSpec>);

/// A player's placement request this tick, queued for `apply_placements` to spawn
/// the env object (item already removed from the inventory). `floor` pins it to
/// the placer's dungeon level.
#[derive(Resource, Default)]
pub struct PendingPlacements(Vec<(proto::PlayerSlot, String, Tile, i32, u8)>);

/// A player's pickup request this tick, queued for `apply_pickups` to validate
/// (owner + range) and resolve: `(slot, target_tile, floor, player_tile)`.
#[derive(Resource, Default)]
pub struct PendingPickups(Vec<(proto::PlayerSlot, Tile, i32, Tile)>);

/// A player's fell request this tick, queued for `apply_fells` to validate
/// (standing tree on the player's floor + adjacency) and resolve:
/// `(target_tile, floor, player_tile)`.
#[derive(Resource, Default)]
pub struct PendingFells(Vec<(Tile, i32, Tile)>);

/// Deploy/reclaim queues drained in `drain_inputs` — grouped into one
/// `SystemParam` so the input system stays under Bevy's 16-param ceiling.
#[derive(bevy::ecs::system::SystemParam)]
pub struct DeployQueues<'w> {
    placements: ResMut<'w, PendingPlacements>,
    pickups: ResMut<'w, PendingPickups>,
    fells: ResMut<'w, PendingFells>,
    spells: ResMut<'w, crate::spells::PendingSpells>,
}

/// A durably-persisted player-placed env object. Behavior is re-derived from
/// `env_ref` on restore (mapdb), so only placement coordinates are stored.
#[derive(Clone, PartialEq, serde::Serialize, serde::Deserialize)]
pub struct PersistedEnvObject {
    pub env_ref: String,
    pub x: i32,
    pub y: i32,
    pub floor: i32,
    /// Per-instance state byte, mirroring `EntityDelta.sub`. Streamed felled trees
    /// persist their `variant | 0x80` here so a re-spawn returns felled with the
    /// same visual variant. Absent (0) for placed campfires.
    #[serde(default, skip_serializing_if = "is_zero_u8")]
    pub sub: u8,
}

fn is_zero_u8(v: &u8) -> bool {
    *v == 0
}

/// Authoritative set of player-placed env objects to persist across restarts.
/// World fixtures (starter campfire) are re-spawned by the game each boot and
/// are deliberately absent. Mutated by `apply_placements`/`apply_pickups`, which
/// push the snapshot through `EnvPersistSink`.
#[derive(Resource, Default)]
pub struct PersistedEnvLog(pub Vec<PersistedEnvObject>);

/// Optional sink the game wires to a durable store. When present, every change
/// to `PersistedEnvLog` sends the full snapshot; absent in tests / no-DB runs.
#[derive(Resource, Default)]
pub struct EnvPersistSink(pub Option<mpsc::UnboundedSender<Vec<PersistedEnvObject>>>);

pub const COIN_REF: &str = "coin";
pub const GOLD_BAR_REF: &str = "gold-bar";
pub const GOLD_BAR_VALUE: u32 = 100;

/// Per-merchant stock: npc ref -> the item refs that merchant buys/sells.
#[derive(Resource, Default, Clone)]
pub struct ShopStock(pub HashMap<String, Vec<String>>);

/// Item economy: item ref -> (buy_price, sell_price) in coin units.
#[derive(Resource, Default, Clone)]
pub struct ItemPrices(pub HashMap<String, (u32, u32)>);

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
pub const PLAYER_MAX_MP: i32 = 100;
pub const MANA_REGEN_AMOUNT: i32 = 5;

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
    /// Dungeon floor (z) the NPC lives on. 0 = ground/surface; negative = deeper
    /// underground. Spawned as a `Floor` component so collision + per-floor
    /// systems scope it to its level.
    pub floor: i32,
    pub ticks_per_tile: u8,
    pub max_hp: i32,
    pub level: i32,
    pub defense: i32,
    pub wander: Option<(i32, u32)>,
    /// Roam-to-target behavior: (radius, dwell_min_ticks, dwell_max_ticks,
    /// clearance). The mob picks a random tile within `radius` of its origin,
    /// walks the whole path there, then idles a random dwell in [min,max] before
    /// the next trip. `clearance` is the open-space ring a large creature
    /// requires per tile (0 = none) so it stays out of narrow halls.
    pub roam: Option<(i32, u32, u32, i32)>,
    pub aggro: Option<AggroSpec>,
    pub loot: Option<String>,
    pub respawn_ticks: u32,
    /// Opt-in float steering: attaches `FloatMove` + `FloatSteer` so the NPC
    /// banks smoothly toward its Roam waypoints instead of grid-stepping.
    pub float_steer: bool,
    /// Movement feel + locomotion mode for a float-steered NPC (flying vs
    /// ground). Only read when `float_steer` is set; `None` falls back to the
    /// flying preset.
    pub move_profile: Option<MoveProfile>,
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

#[derive(Component, Clone, Copy)]
pub struct Mana {
    pub mp: i32,
    pub max_mp: i32,
}

#[derive(Resource, Default)]
pub struct SpellCooldowns(pub HashMap<(u16, String), u32>);

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

    /// Move the stack at index `from` to index `to`, shifting the rest. Slot
    /// order is authoritative + persisted, so client reorders survive refreshes.
    pub fn reorder(&mut self, from: usize, to: usize) {
        let n = self.slots.len();
        if from >= n || to >= n || from == to {
            return;
        }
        let item = self.slots.remove(from);
        self.slots.insert(to, item);
    }

    /// Remove up to `count` of `item_ref`, returning how many were actually
    /// removed (0 if absent). Empties the slot when it hits zero.
    pub fn remove(&mut self, item_ref: &str, count: u32) -> u32 {
        let Some(idx) = self.slots.iter().position(|(r, _)| r == item_ref) else {
            return 0;
        };
        let taken = self.slots[idx].1.min(count);
        self.slots[idx].1 -= taken;
        if self.slots[idx].1 == 0 {
            self.slots.remove(idx);
        }
        taken
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

/// Roam-to-target wandering: walk the whole path to a random tile within
/// `radius` of `origin`, then idle a random dwell before the next trip. Gives
/// longer, more purposeful movement than `Wander`'s single-tile jitter.
#[derive(Component, Clone, Copy)]
pub struct Roam {
    pub origin: Tile,
    pub radius: i32,
    pub dwell_min: u32,
    pub dwell_max: u32,
    /// Open-space requirement: a large creature only targets/steps onto tiles
    /// whose surrounding `clearance`-ring is fully walkable, so its oversized
    /// sprite never wedges into a narrow hall or overhangs a wall. 0 = no req.
    pub clearance: i32,
    /// Current destination, or None while dwelling/awaiting a new pick.
    pub target: Option<Tile>,
    /// Earliest tick the next trip may begin (set when a trip completes).
    pub resume_tick: u32,
}

/// Opt-in marker: entities carrying it use float steering (`advance_npc_float`)
/// toward their Roam waypoint instead of the grid mover, banking smoothly via
/// `FloatBody`. Predators/goblins/players omit it and stay grid-based.
#[derive(Component, Clone, Copy)]
pub struct FloatSteer;

/// Locomotion mode for a steered entity.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Terrain {
    /// Ground unit: respects walls/trees and is slowed by dense biomes.
    Collide,
    /// Flyer: soars OVER obstacles (no collision) and ignores biome speed.
    Fly,
}

/// Per-entity movement feel for float steering — replaces the old hardcoded NPC
/// turn/arrive consts so locomotion is ECS DATA, not a code branch. The fields
/// are tunable feel knobs (see presets below).
#[derive(Component, Clone, Copy, Debug)]
pub struct MoveProfile {
    /// rad/s heading cap (banking) — how fast the body may turn.
    pub max_turn_rate: f32,
    /// Velocity steer rate toward the target velocity.
    pub accel: f32,
    /// Decel rate when easing in / coming to a stop.
    pub friction: f32,
    /// Slow-down radius (tiles) the arrive behavior eases to a stop within.
    pub arrive_radius: f32,
    /// Cruise speed (tiles/s). Turn radius ≈ cruise_speed / max_turn_rate, so a
    /// faster cruise + lower turn rate = a wider, glidier arc.
    pub cruise_speed: f32,
    /// Collision/biome mode.
    pub terrain: Terrain,
}

impl MoveProfile {
    /// Flyer preset (wyverns): loose banking, no collision, ignores biome.
    /// Tunable feel knobs.
    pub fn flying() -> Self {
        MoveProfile {
            // Lower turn rate + faster cruise = a wide, sweeping glide-arc
            // (radius ~ 4.6/1.4 ≈ 3.3 tiles) instead of a tight pivot.
            max_turn_rate: 1.4,
            accel: 14.0,
            friction: 30.0,
            // Small so a flyer keeps cruise speed through its waypoint and banks
            // toward the next instead of braking to a near-stop at each — birds
            // and planes carve the turn, they don't pivot in place.
            arrive_radius: 0.8,
            cruise_speed: 4.6,
            terrain: Terrain::Fly,
        }
    }

    /// Ground preset: tighter turns, hard collision, biome-slowed.
    /// Tunable feel knobs.
    pub fn ground() -> Self {
        MoveProfile {
            max_turn_rate: 4.5,
            accel: 22.0,
            friction: 70.0,
            arrive_radius: 1.0,
            cruise_speed: crate::float_move::WALK_SPEED,
            terrain: Terrain::Collide,
        }
    }
}

impl Roam {
    pub fn new(origin: Tile, radius: i32, dwell_min: u32, dwell_max: u32, clearance: i32) -> Self {
        let dwell_min = dwell_min.max(1);
        Self {
            origin,
            radius: radius.max(1),
            dwell_min,
            dwell_max: dwell_max.max(dwell_min),
            clearance: clearance.max(0),
            target: None,
            resume_tick: 0,
        }
    }
}

/// True when `tile` and every tile within Chebyshev `radius` of it are walkable
/// on floor `z`. The open-space test a large creature uses so it stays in rooms
/// and wide junctions instead of clipping through narrow corridors.
pub fn has_clearance(map: &WalkableMap, z: i32, tile: Tile, radius: i32) -> bool {
    for dy in -radius..=radius {
        for dx in -radius..=radius {
            if !map.is_walkable_z(z, Tile::new(tile.x + dx, tile.y + dy)) {
                return false;
            }
        }
    }
    true
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
    if let Some((radius, dwell_min, dwell_max, clearance)) = spec.roam {
        e.insert(Roam::new(
            spec.origin,
            radius,
            dwell_min,
            dwell_max,
            clearance,
        ));
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
    if spec.float_steer {
        let profile = spec.move_profile.unwrap_or_else(MoveProfile::flying);
        e.insert((FloatMove::at(spec.origin), FloatSteer, profile));
    }
    if spec.floor != 0 {
        e.insert(Floor(spec.floor));
    }
}

/// A placed environment object (campfire, wall, …). `def_ref` is its itemdb ref
/// so systems can resolve data-driven behavior later (#12972); for now the
/// behavior components are attached from spawn-time `EnvOpts`.
#[derive(Component, Clone)]
pub struct EnvObject {
    pub def_ref: String,
}

/// Ownership for a player-placed env object. `owner` is the placer's slot;
/// `kit_ref` is the deployable item refunded when the owner picks it back up.
/// Absent on world-fixture objects (e.g. the starter campfire) — those can't be
/// reclaimed.
#[derive(Component, Clone)]
pub struct PlacedBy {
    pub owner: proto::PlayerSlot,
    pub kit_ref: String,
}

/// Occupies its tile — paired with `WalkableMap::block_tile_z` so movement and
/// pathfinding route around it.
#[derive(Component, Clone, Copy)]
pub struct Blocker;

/// Per-instance state for an env tree. `variant` ∈ 0..=69 selects the client
/// visual; `felled` flips the tile from blocking to walkable. Encoded onto the
/// snapshot's `EntityDelta.sub` as `(variant & 0x7F) | (felled ? 0x80 : 0)`.
#[derive(Component, Clone, Copy)]
pub struct TreeState {
    pub variant: u8,
    pub felled: bool,
}

impl TreeState {
    pub fn sub(self) -> u8 {
        (self.variant & 0x7F) | if self.felled { 0x80 } else { 0 }
    }

    pub fn from_sub(sub: u8) -> Self {
        Self {
            variant: sub & 0x7F,
            felled: sub & 0x80 != 0,
        }
    }
}

/// Per-instance state for an env bush. `variant` ∈ 0..=69 selects the client
/// visual; `harvested` marks it picked. Encoded onto the snapshot's
/// `EntityDelta.sub` as `(variant & 0x7F) | (harvested ? 0x80 : 0)`. Unlike a tree
/// a bush never blocks its tile.
#[derive(Component, Clone, Copy)]
pub struct BushState {
    pub variant: u8,
    pub harvested: bool,
}

impl BushState {
    pub fn sub(self) -> u8 {
        (self.variant & 0x7F) | if self.harvested { 0x80 } else { 0 }
    }

    pub fn from_sub(sub: u8) -> Self {
        Self {
            variant: sub & 0x7F,
            harvested: sub & 0x80 != 0,
        }
    }
}

/// Periodic heal for players within `range` (Chebyshev) of this tile, excluding
/// the unstandable center. `range >= 1` keeps it disjoint from a `HazardZone`.
#[derive(Component, Clone, Copy)]
pub struct HealAura {
    pub range: i32,
    pub magnitude: i32,
    pub period_ticks: u32,
}

/// Facing of a placed rotatable furniture (candelabrum): 0..=3, set from the
/// `PlaceItem` rot byte and streamed verbatim on `EntityDelta.sub` so every client
/// renders the same orientation. Props with no rotation simply never carry it.
#[derive(Component, Clone, Copy)]
pub struct FurnitureRot(pub u8);

/// Periodic mana restore for players within `range` (Chebyshev) of this tile,
/// excluding the unstandable center. The mana counterpart to `HealAura`
/// (candelabrum stand). `range >= 1` keeps it disjoint from a `HazardZone`.
#[derive(Component, Clone, Copy)]
pub struct ManaAura {
    pub range: i32,
    pub magnitude: i32,
    pub period_ticks: u32,
}

/// Periodic burn for any entity standing ON this tile (player or NPC — reached by
/// knockback / forced move since the tile is usually a `Blocker`).
#[derive(Component, Clone, Copy)]
pub struct HazardZone {
    pub magnitude: i32,
    pub period_ticks: u32,
}

/// Spawn-time behavior for an env object. Hardcoded by the caller today; #12972
/// will populate these from the itemdb item def.
#[derive(Clone, Default)]
pub struct EnvOpts {
    pub blocker: bool,
    pub heal_aura: Option<HealAura>,
    pub mana_aura: Option<ManaAura>,
    pub hazard: Option<HazardZone>,
    pub floor: i32,
}

/// Spawn a placed env object with the mandatory snapshot trio
/// (`EntityKind + GridPos + MoveTarget`) plus opted-in behavior components. The
/// caller blocks the tile via `WalkableMap::block_tile_z` when `opts.blocker`.
pub fn spawn_env_object(
    commands: &mut Commands,
    registry: &KindRegistry,
    item_ref: &str,
    tile: Tile,
    opts: EnvOpts,
) -> Option<Entity> {
    let kind = registry.kind_of(item_ref)?;
    let mut e = commands.spawn((
        EntityKind(kind),
        GridPos::at(tile),
        MoveTarget::default(),
        EnvObject {
            def_ref: item_ref.to_string(),
        },
    ));
    if opts.floor != 0 {
        e.insert(Floor(opts.floor));
    }
    if opts.blocker {
        e.insert(Blocker);
    }
    if let Some(a) = opts.heal_aura {
        e.insert(a);
    }
    if let Some(a) = opts.mana_aura {
        e.insert(a);
    }
    if let Some(h) = opts.hazard {
        e.insert(h);
    }
    Some(e.id())
}

/// Kind ref for the surface tree env prop. One ref covers all 70 visual variants;
/// the variant + felled state ride `TreeState` (and `EntityDelta.sub` on the wire).
pub const TREE_REF: &str = "tree";

/// Number of tree visual variants the client ships (0..=TREE_VARIANTS-1).
pub const TREE_VARIANTS: u8 = 70;

/// Per-mille of surface grass tiles that carry a tree. Forest-density knob.
pub const TREE_DENSITY_PER_MILLE: u32 = 22;

/// Deterministic surface tree field: a pure function of (seed, tile), built on the
/// client-mirrorable `stream` so the client reproduces the identical forest. Returns
/// the visual variant for a tile that carries a tree, else `None`. Placement only —
/// callers apply tile exclusions (spawn, stairs) identically on both sides.
pub fn tree_at(seed: u32, x: i32, y: i32) -> Option<u8> {
    let mut s = crate::rng::stream(seed, crate::rng::domain::TREE, &[x as u32, y as u32]);
    if s.next_u32() % 1000 >= TREE_DENSITY_PER_MILLE {
        return None;
    }
    Some((s.next_u32() % TREE_VARIANTS as u32) as u8)
}

/// Spawn a surface tree env entity carrying `TreeState`. A standing tree gets the
/// `Blocker` marker (the caller blocks the tile via `WalkableMap::block_tile_z`);
/// a felled one is walkable. Returns `None` when `tree` isn't registered.
pub fn spawn_tree(
    commands: &mut Commands,
    registry: &KindRegistry,
    tile: Tile,
    floor: i32,
    state: TreeState,
) -> Option<Entity> {
    let kind = registry.kind_of(TREE_REF)?;
    let mut e = commands.spawn((
        EntityKind(kind),
        GridPos::at(tile),
        MoveTarget::default(),
        EnvObject {
            def_ref: TREE_REF.to_string(),
        },
        state,
    ));
    if floor != 0 {
        e.insert(Floor(floor));
    }
    if !state.felled {
        e.insert(Blocker);
    }
    Some(e.id())
}

/// Kind ref for the surface bush env prop. One ref covers all 70 visual variants;
/// the variant + harvested state ride `BushState` (and `EntityDelta.sub` on the wire).
pub const BUSH_REF: &str = "bush";

/// Number of bush visual variants the client ships (0..=BUSH_VARIANTS-1).
pub const BUSH_VARIANTS: u8 = 70;

/// Per-mille of surface grass tiles that carry a bush. Denser than the forest knob.
pub const BUSH_DENSITY_PER_MILLE: i32 = 30;

/// Deterministic surface bush field: a pure function of (seed, tile), built on the
/// client-mirrorable `stream` so the client reproduces the identical scrub. Returns
/// the visual variant for a tile that carries a bush, else `None`. A bush never
/// overlaps a tree tile, so a `tree_at` hit pre-empts placement.
pub fn bush_at(seed: u32, x: i32, y: i32) -> Option<u8> {
    if tree_at(seed, x, y).is_some() {
        return None;
    }
    let mut s = crate::rng::stream(seed, crate::rng::domain::BUSH, &[x as u32, y as u32]);
    if (s.next_u32() % 1000) as i32 >= BUSH_DENSITY_PER_MILLE {
        return None;
    }
    Some((s.next_u32() % BUSH_VARIANTS as u32) as u8)
}

/// Spawn a surface bush env entity carrying `BushState`. A bush is always walkable —
/// it never gets a `Blocker` and the caller never blocks its tile. Returns `None`
/// when `bush` isn't registered.
pub fn spawn_bush(
    commands: &mut Commands,
    registry: &KindRegistry,
    tile: Tile,
    floor: i32,
    state: BushState,
) -> Option<Entity> {
    let kind = registry.kind_of(BUSH_REF)?;
    let mut e = commands.spawn((
        EntityKind(kind),
        GridPos::at(tile),
        MoveTarget::default(),
        EnvObject {
            def_ref: BUSH_REF.to_string(),
        },
        state,
    ));
    if floor != 0 {
        e.insert(Floor(floor));
    }
    Some(e.id())
}

/// Heal players standing in a campfire's aura ring (range >= 1, same floor).
#[allow(clippy::type_complexity)]
fn env_heal_aura(
    clock: Res<SimClock>,
    auras: Query<(&HealAura, &GridPos, Option<&Floor>)>,
    mut players: Query<(&mut Health, &GridPos, Option<&Floor>), With<PlayerSlotTag>>,
) {
    for (aura, apos, afloor) in auras.iter() {
        if aura.period_ticks == 0 || !clock.tick.is_multiple_of(aura.period_ticks) {
            continue;
        }
        let az = afloor.map(|f| f.0).unwrap_or(0);
        for (mut hp, ppos, pfloor) in players.iter_mut() {
            if pfloor.map(|f| f.0).unwrap_or(0) != az || hp.hp <= 0 || hp.hp >= hp.max_hp {
                continue;
            }
            let d = ppos.tile.chebyshev(apos.tile);
            if d >= 1 && d <= aura.range {
                hp.hp = (hp.hp + aura.magnitude).min(hp.max_hp);
            }
        }
    }
}

/// Restore mana to players standing in a candelabrum's aura ring (range >= 1,
/// same floor). The mana counterpart to `env_heal_aura`.
#[allow(clippy::type_complexity)]
fn env_mana_aura(
    clock: Res<SimClock>,
    auras: Query<(&ManaAura, &GridPos, Option<&Floor>)>,
    mut players: Query<(&mut Mana, &GridPos, Option<&Floor>), With<PlayerSlotTag>>,
) {
    for (aura, apos, afloor) in auras.iter() {
        if aura.period_ticks == 0 || !clock.tick.is_multiple_of(aura.period_ticks) {
            continue;
        }
        let az = afloor.map(|f| f.0).unwrap_or(0);
        for (mut mana, ppos, pfloor) in players.iter_mut() {
            if pfloor.map(|f| f.0).unwrap_or(0) != az || mana.mp >= mana.max_mp {
                continue;
            }
            let d = ppos.tile.chebyshev(apos.tile);
            if d >= 1 && d <= aura.range {
                mana.mp = (mana.mp + aura.magnitude).min(mana.max_mp);
            }
        }
    }
}

/// Burn any entity standing on a hazard tile (same floor). Status-bearers refresh a
/// `Burn` effect (ticked by the status system); bare entities take it directly.
#[allow(clippy::type_complexity)]
fn env_hazard_burn(
    clock: Res<SimClock>,
    hazards: Query<(&HazardZone, &GridPos, Option<&Floor>)>,
    mut victims: Query<(
        &mut Health,
        &GridPos,
        Option<&Floor>,
        Option<&mut StatusEffects>,
    )>,
) {
    let now = clock.tick;
    for (hz, hpos, hfloor) in hazards.iter() {
        if hz.period_ticks == 0 || !now.is_multiple_of(hz.period_ticks) {
            continue;
        }
        let hz_z = hfloor.map(|f| f.0).unwrap_or(0);
        for (mut hp, vpos, vfloor, status) in victims.iter_mut() {
            if vfloor.map(|f| f.0).unwrap_or(0) != hz_z || vpos.tile != hpos.tile {
                continue;
            }
            match status {
                Some(mut s) => s.apply(StatusEffect {
                    kind: proto::StatusKind::Burn,
                    magnitude: hz.magnitude,
                    period_ticks: hz.period_ticks,
                    next_tick: now.saturating_add(hz.period_ticks),
                    expires_tick: now.saturating_add(hz.period_ticks.saturating_mul(3)),
                }),
                None => hp.hp -= hz.magnitude,
            }
        }
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
        .insert_resource(PendingDrops::default())
        .insert_resource(Deployables::default())
        .insert_resource(PendingPlacements::default())
        .insert_resource(PendingPickups::default())
        .insert_resource(PendingFells::default())
        .insert_resource(PersistedEnvLog::default())
        .insert_resource(EnvPersistSink::default())
        .insert_resource(ShopStock::default())
        .insert_resource(ItemPrices::default())
        .insert_resource(Tables::default())
        .insert_resource(PlayerStore::default())
        .insert_resource(ConsumableEffects::default())
        .insert_resource(BuffEffects::default())
        .insert_resource(EquipmentEffects::default())
        .insert_resource(RespawnQueue::default())
        .insert_resource(KillCounts::default())
        .insert_resource(crate::spells::PendingSpells::default())
        .insert_resource(SpellCooldowns::default())
        .insert_resource(bevy_spells::SpellDb::default())
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
            (
                drain_inputs,
                apply_drops,
                apply_placements,
                apply_pickups,
                apply_fells,
                apply_actions,
                crate::spells::apply_spells,
                crate::trade::expire_trades,
                crate::trade::apply_trades,
                crate::shop::apply_shop,
                blackjack::apply_blackjack,
            )
                .chain()
                .in_set(SimSet::Input),
        )
        .add_systems(
            Update,
            (hostile_ai, wander_system, roam_system)
                .chain()
                .in_set(SimSet::Ai),
        )
        .add_systems(
            Update,
            (
                advance_float,
                advance_npc_float,
                advance_movement,
                stair_system,
                env_hazard_burn,
                env_heal_aura,
                env_mana_aura,
                tick_status_effects,
                respawn_players,
                regen_players,
            )
                .chain()
                .in_set(SimSet::Movement),
        )
        .add_systems(Update, emit_snapshot.in_set(SimSet::Snapshot));
    blackjack::plugin(&mut app);
    crate::trade::plugin(&mut app);
    crate::shop::plugin(&mut app);
    crate::spells::plugin(&mut app);
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
        let mut slots = saved
            .map(|s| s.slots)
            .unwrap_or_else(|| config.starting_inventory.clone());
        // Top up any starter item the player is entirely missing, so essentials
        // added after a save was created (e.g. a dungeon-key) still reach
        // existing players — only granted when they hold zero of that ref, so a
        // partially-used starter stack is left alone.
        for (item_ref, count) in &config.starting_inventory {
            if !slots.iter().any(|(r, _)| r == item_ref) {
                slots.push((item_ref.clone(), *count));
            }
        }
        let inventory = Inventory { slots };
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
        send_stats(
            &bcast,
            *slot,
            level,
            xp,
            max_hp,
            attack,
            kills,
            PLAYER_MAX_MP,
            PLAYER_MAX_MP,
        );
        let entity = commands
            .spawn((
                PlayerSlotTag(*slot),
                EntityKind(config.player_kind),
                GridPos::at(config.spawn),
                MoveSpeed {
                    ticks_per_tile: config.ticks_per_tile,
                },
                Health { hp, max_hp },
                Mana {
                    mp: PLAYER_MAX_MP,
                    max_mp: PLAYER_MAX_MP,
                },
                CombatStats { attack },
                Defense(defense),
                XpState { level, xp },
                inventory,
                Equipped { weapon, armor },
                StatusEffects::default(),
                FloatMove::at(config.spawn),
                IntentBuffer::default(),
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
fn rebuild_index(
    mut index: ResMut<EidIndex>,
    added: Query<Entity, Added<GridPos>>,
    mut removed: RemovedComponents<GridPos>,
) {
    for entity in removed.read() {
        index.by_eid.remove(&entity.index_u32());
    }
    for entity in added.iter() {
        index.by_eid.insert(entity.index_u32(), entity);
    }
}

/// Per-player movement intents, one per client sim tick, consumed FIFO one per
/// server tick by `advance_float`. Decouples application from network arrival
/// jitter so the server reproduces the client's motion tick-for-tick: the release
/// (stop) is applied in order at the same tick the client stopped, instead of the
/// old "hold last intent until the stop packet lands" model that over-traveled by
/// ~RTT. A small jitter buffer primes before consumption; on starvation the last
/// intent is held a short grace then zeroed so a dropped tail still comes to rest.
#[derive(Component, Default)]
pub struct IntentBuffer {
    pending: std::collections::VecDeque<(i8, i8, bool)>,
    last: (i8, i8, bool),
    primed: bool,
    starve_ticks: u32,
}

/// Inputs to buffer before consumption starts — absorbs network arrival variance
/// so the queue doesn't starve on the first jittery packets.
const INPUT_JITTER_BUFFER: usize = 2;
/// Starved ticks to keep applying the last intent before forcing a stop, so a
/// brief packet gap coasts naturally instead of stuttering to a halt.
const INPUT_STARVE_GRACE: u32 = 2;

impl IntentBuffer {
    /// Queue one client-tick intent.
    fn push(&mut self, mx: i8, my: i8, run: bool) {
        self.pending.push_back((mx, my, run));
    }

    /// Advance one server tick: return the intent to apply. Primes on the jitter
    /// buffer, then pops one per tick; holds (then zeroes) the last on starvation.
    fn next(&mut self) -> (i8, i8, bool) {
        if !self.primed && self.pending.len() >= INPUT_JITTER_BUFFER {
            self.primed = true;
        }
        if self.primed {
            if let Some(i) = self.pending.pop_front() {
                self.last = i;
                self.starve_ticks = 0;
            } else {
                self.starve_ticks += 1;
                if self.starve_ticks > INPUT_STARVE_GRACE {
                    self.last = (0, 0, self.last.2);
                }
                self.primed = false;
            }
        }
        self.last
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
    mut trades: ResMut<PendingTrades>,
    mut shop: ResMut<PendingShop>,
    mut blackjack_inputs: ResMut<PendingBlackjack>,
    mut drops: ResMut<PendingDrops>,
    deployables: Res<Deployables>,
    mut deploy: DeployQueues,
    mut q: Query<(
        Entity,
        &PlayerSlotTag,
        &mut GridPos,
        &mut Health,
        &mut Inventory,
        &mut Equipped,
        &mut CombatStats,
        &mut Defense,
        &XpState,
        &mut StatusEffects,
        Option<&Floor>,
        &mut FloatMove,
        &mut IntentBuffer,
    )>,
) {
    let mut pending: HashMap<u16, Vec<Input>> = HashMap::new();
    {
        let mut guard = match queue.rx.lock() {
            Ok(g) => g,
            Err(p) => p.into_inner(),
        };
        while let Ok((slot, input)) = guard.try_recv() {
            match input {
                Input::Action { id, target } => actions.0.push((slot, id, target)),
                Input::CastSpell { spell_ref, target } => {
                    deploy.spells.0.push((slot, spell_ref, target))
                }
                Input::TradeOffer { target, items } => {
                    trades.0.push((slot, TradeInput::Offer { target, items }));
                }
                Input::TradeAccept => trades.0.push((slot, TradeInput::Accept)),
                Input::TradeCancel => trades.0.push((slot, TradeInput::Cancel)),
                Input::BuyItem { npc, item_ref, qty } => {
                    shop.0.push((slot, ShopInput::Buy { npc, item_ref, qty }))
                }
                Input::SellItem { npc, item_ref, qty } => {
                    shop.0.push((slot, ShopInput::Sell { npc, item_ref, qty }))
                }
                Input::JoinTable { table_ref } => {
                    blackjack_inputs.0.push((slot, BjInput::Join { table_ref }))
                }
                Input::LeaveTable => blackjack_inputs.0.push((slot, BjInput::Leave)),
                Input::PlaceBet { amount } => {
                    blackjack_inputs.0.push((slot, BjInput::Bet { amount }))
                }
                Input::BjAction { kind } => blackjack_inputs.0.push((slot, BjInput::Act { kind })),
                Input::Insure { amount } => {
                    blackjack_inputs.0.push((slot, BjInput::Insure { amount }))
                }
                other => pending.entry(slot.0).or_default().push(other),
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
        mut hp,
        mut inv,
        mut equipped,
        mut stats,
        mut defense,
        xp,
        mut status,
        floor,
        mut fm,
        mut intents,
    ) in q.iter_mut()
    {
        let Some(inputs) = pending.get(&slot.0.0) else {
            continue;
        };
        let z = floor.map(|f| f.0).unwrap_or(0);
        for input in inputs {
            match input {
                Input::Move {
                    seq, mx, my, run, ..
                } => {
                    // Enqueue strictly-newer intents in client-tick order;
                    // advance_float consumes one per server tick. The seq guard
                    // dedupes retransmits/reorders.
                    if *seq > fm.last_seq {
                        fm.last_seq = *seq;
                        intents.push(*mx, *my, *run);
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
                Input::DropItem { item_ref, qty } => {
                    let removed = inv.remove(item_ref, *qty);
                    if removed > 0 {
                        drops.0.push((pos.tile, item_ref.clone(), removed));
                        send_inventory(&bcast, slot.0, &inv);
                    }
                }
                Input::MoveItem { from, to } => {
                    inv.reorder(*from as usize, *to as usize);
                    send_inventory(&bcast, slot.0, &inv);
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
                Input::PlaceItem {
                    item_ref,
                    tile,
                    rot,
                } => {
                    let placed =
                        place_item(&deployables, &map, z, pos.tile, *tile, item_ref, &mut inv);
                    match placed {
                        Ok(()) => {
                            deploy.placements.0.push((
                                slot.0,
                                item_ref.clone(),
                                *tile,
                                z,
                                *rot & 0x03,
                            ));
                            send_inventory(&bcast, slot.0, &inv);
                            send_item_placed(&bcast, slot.0, item_ref, *tile, true, None);
                        }
                        Err(reason) => {
                            send_item_placed(&bcast, slot.0, item_ref, *tile, false, Some(reason));
                        }
                    }
                }
                Input::PickupObject { tile } => {
                    deploy.pickups.0.push((slot.0, *tile, z, pos.tile));
                }
                Input::Fell { tile } => {
                    deploy.fells.0.push((*tile, z, pos.tile));
                }
                Input::Step { .. }
                | Input::MoveTo { .. }
                | Input::Action { .. }
                | Input::CastSpell { .. }
                | Input::Heartbeat { .. }
                | Input::Leave
                | Input::TradeOffer { .. }
                | Input::TradeAccept
                | Input::TradeCancel
                | Input::BuyItem { .. }
                | Input::SellItem { .. }
                | Input::JoinTable { .. }
                | Input::LeaveTable
                | Input::PlaceBet { .. }
                | Input::BjAction { .. }
                | Input::Insure { .. } => {}
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
    let event = proto::ItemUsedEvent {
        item_ref: item_ref.to_string(),
        heal: heal_amt,
    };
    let payload = proto::encode_inner(&event).unwrap_or_default();
    let _ = bcast.tx.send(ServerEvent::Ephemeral {
        kind: proto::EPHEMERAL_ITEM_USED,
        to: slot,
        payload,
    });
    send_inventory(bcast, slot, inv);
}

pub(crate) type AttackPlayerQuery<'w, 's> = Query<
    'w,
    's,
    (
        Entity,
        &'static PlayerSlotTag,
        &'static GridPos,
        &'static mut CombatStats,
        &'static mut Inventory,
        &'static mut Health,
        &'static mut XpState,
        &'static Equipped,
        &'static mut Mana,
        Option<&'static Floor>,
        &'static Defense,
    ),
>;

pub(crate) type AttackMobQuery<'w, 's> = Query<
    'w,
    's,
    (
        &'static GridPos,
        &'static mut Health,
        Option<&'static Loot>,
        Option<&'static RespawnOnDeath>,
        Option<&'static Defense>,
        Option<&'static NpcLevel>,
        &'static EntityKind,
    ),
    (Without<PlayerSlotTag>, Without<GroundItem>),
>;

/// Apply a confirmed hit from `player_entity` to `target_entity`: roll damage
/// (defense + deterministic crit), broadcast the combat event, and on death
/// handle loot, respawn, despawn and XP. Shared by melee and ranged attacks —
/// only target selection differs upstream.
#[allow(clippy::too_many_arguments)]
pub(crate) fn resolve_attack_hit(
    player_entity: Entity,
    target_entity: Entity,
    slot: proto::PlayerSlot,
    attack: i32,
    bcast: &Outbound,
    registry: &KindRegistry,
    clock: &SimClock,
    seed: &SimSeed,
    config: &SimConfig,
    equipment: &EquipmentEffects,
    respawns: &mut RespawnQueue,
    kill_counts: &mut KillCounts,
    commands: &mut Commands,
    q_players: &mut AttackPlayerQuery,
    q_mobs: &mut AttackMobQuery,
) {
    let Ok((mob_pos, mut hp, loot, respawn, mob_defense, mob_level, kind)) =
        q_mobs.get_mut(target_entity)
    else {
        return;
    };
    let base = (attack - mob_defense.map(|d| d.0).unwrap_or(0)).max(1);
    let crit =
        hash3(seed.0, player_entity.index_u32() as u64, clock.tick as u64) % 100 < CRIT_CHANCE_PCT;
    let damage = if crit { base * 2 } else { base };
    let kill_xp = mob_level.map(|l| l.0).unwrap_or(1).max(1) * XP_PER_NPC_LEVEL;
    hp.hp -= damage;
    let died = hp.hp <= 0;
    let drop_tile = mob_pos.tile;
    let event = proto::CombatEvent {
        attacker: player_entity.index_u32(),
        target: target_entity.index_u32(),
        target_ref: registry.ref_of(kind.0).map(|s| s.to_string()),
        dmg: damage,
        crit,
        died,
    };
    let payload = proto::encode_inner(&event).unwrap_or_default();
    let _ = bcast.tx.send(ServerEvent::Ephemeral {
        kind: proto::EPHEMERAL_COMBAT,
        to: proto::PLAYER_SLOT_NONE,
        payload,
    });
    if died {
        let drop_ref = loot.and_then(|l| l.item_ref.clone());
        if let Some(r) = respawn {
            respawns.0.push((
                clock.tick.saturating_add(r.spec.respawn_ticks),
                r.spec.clone(),
            ));
        }
        commands.entity(target_entity).despawn();
        if let Some(item_ref) = drop_ref
            && let Some(bundle) = ground_item_bundle(registry, &item_ref, 1, drop_tile)
        {
            commands.spawn(bundle);
        }
        let kills = {
            let k = kill_counts.0.entry(slot.0).or_default();
            *k += 1;
            *k
        };
        if let Ok((_, _, _, mut stats, _, mut php, mut xp, equipped, mana, _, _)) =
            q_players.get_mut(player_entity)
        {
            let (mp, max_mp) = (mana.mp, mana.max_mp);
            award_xp(
                bcast, slot, config, equipment, kill_xp, &mut xp, &mut php, &mut stats, equipped,
                kills, mp, max_mp,
            );
        }
    }
}

/// PvP is allowed only between two players on the SAME dungeon floor (z < 0). The
/// surface (z >= 0) stays peaceful, and the spawn safe zone (also surface) with it.
pub(crate) fn pvp_allowed(az: i32, tz: i32) -> bool {
    az < 0 && tz < 0 && az == tz
}

/// Apply a confirmed player-vs-player hit. Disjoint mutable access to attacker +
/// target via `get_many_mut`; rolls damage (target defense + deterministic crit)
/// and broadcasts the combat event to ALL clients. A kill (hp <= 0) is picked up
/// by `respawn_players` like any other death. The caller has already range- and
/// hostility-gated; self-targeting fails the disjoint borrow and no-ops.
fn resolve_pvp_hit(
    attacker: Entity,
    target: Entity,
    attack: i32,
    bcast: &Outbound,
    seed: &SimSeed,
    clock: &SimClock,
    q_players: &mut AttackPlayerQuery,
) {
    let Ok([_atk, tgt]) = q_players.get_many_mut([attacker, target]) else {
        return;
    };
    let (_, _, _, _, _, mut t_hp, _, _, _, _, t_def) = tgt;
    let base = (attack - t_def.0).max(1);
    let crit =
        hash3(seed.0, attacker.index_u32() as u64, clock.tick as u64) % 100 < CRIT_CHANCE_PCT;
    let damage = if crit { base * 2 } else { base };
    t_hp.hp -= damage;
    let died = t_hp.hp <= 0;
    let event = proto::CombatEvent {
        attacker: attacker.index_u32(),
        target: target.index_u32(),
        target_ref: None,
        dmg: damage,
        crit,
        died,
    };
    let payload = proto::encode_inner(&event).unwrap_or_default();
    let _ = bcast.tx.send(ServerEvent::Ephemeral {
        kind: proto::EPHEMERAL_COMBAT,
        to: proto::PLAYER_SLOT_NONE,
        payload,
    });
}

fn apply_drops(
    mut drops: ResMut<PendingDrops>,
    registry: Res<KindRegistry>,
    mut commands: Commands,
) {
    for (tile, item_ref, count) in drops.0.drain(..) {
        if let Some(bundle) = ground_item_bundle(&registry, &item_ref, count, tile) {
            commands.spawn(bundle);
        }
    }
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
    map: Res<WalkableMap>,
    mut respawns: ResMut<RespawnQueue>,
    mut kill_counts: ResMut<KillCounts>,
    mut commands: Commands,
    mut q_players: AttackPlayerQuery,
    mut q_mobs: AttackMobQuery,
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

    // Ground items despawn via deferred commands (flushed after this system), so
    // two same-tick pickups of one item would both see it alive and dupe it to
    // both players. Claim the item the first time it is taken; later attempts in
    // this batch find it already claimed and bail.
    let mut claimed_items: HashSet<Entity> = HashSet::new();

    for (slot, action_id, target) in drained {
        let Some(&player_entity) = by_slot.get(&slot.0) else {
            continue;
        };
        let Some(target_entity) = target.and_then(|t| index.by_eid.get(&t.0).copied()) else {
            continue;
        };

        match action_id {
            proto::ACTION_ATTACK => {
                let Ok((_, _, pos, stats, _, _, _, _, _, a_floor, _)) =
                    q_players.get(player_entity)
                else {
                    continue;
                };
                let (attacker_tile, attack) = (pos.tile, stats.attack);
                let az = a_floor.map(|f| f.0).unwrap_or(0);
                // Mob target first; else a PvP player target (dungeon-floor only).
                if let Ok((mob_pos, ..)) = q_mobs.get(target_entity) {
                    if combat::in_range_adjacent(attacker_tile, mob_pos.tile, combat::MELEE_RANGE) {
                        resolve_attack_hit(
                            player_entity,
                            target_entity,
                            proto::PlayerSlot(slot.0),
                            attack,
                            &bcast,
                            &registry,
                            &clock,
                            &seed,
                            &config,
                            &equipment,
                            &mut respawns,
                            &mut kill_counts,
                            &mut commands,
                            &mut q_players,
                            &mut q_mobs,
                        );
                    }
                } else if let Some((target_tile, tz)) = match q_players.get(target_entity) {
                    Ok((_, _, t_pos, _, _, _, _, _, _, t_floor, _)) => {
                        Some((t_pos.tile, t_floor.map(|f| f.0).unwrap_or(0)))
                    }
                    Err(_) => None,
                } {
                    if pvp_allowed(az, tz)
                        && combat::in_range_adjacent(
                            attacker_tile,
                            target_tile,
                            combat::MELEE_RANGE,
                        )
                    {
                        resolve_pvp_hit(
                            player_entity,
                            target_entity,
                            attack,
                            &bcast,
                            &seed,
                            &clock,
                            &mut q_players,
                        );
                    }
                }
            }
            proto::ACTION_SHOOT => {
                let Ok((_, _, pos, stats, _, _, _, _, _, a_floor, _)) =
                    q_players.get(player_entity)
                else {
                    continue;
                };
                let (attacker_tile, attack) = (pos.tile, stats.attack);
                let az = a_floor.map(|f| f.0).unwrap_or(0);
                // Target tile + whether it's a PvP player (Some(z)) or a mob (None).
                let Some((target_tile, target_z)) = (match q_mobs.get(target_entity) {
                    Ok((mob_pos, ..)) => Some((mob_pos.tile, None)),
                    Err(_) => match q_players.get(target_entity) {
                        Ok((_, _, t_pos, _, _, _, _, _, _, t_floor, _)) => {
                            Some((t_pos.tile, Some(t_floor.map(|f| f.0).unwrap_or(0))))
                        }
                        Err(_) => None,
                    },
                }) else {
                    continue;
                };
                let path = combat::line_cast(attacker_tile, target_tile, combat::BOW_RANGE, |t| {
                    !map.is_walkable(t)
                });
                let impact = path.last().copied().unwrap_or(attacker_tile);
                let los_clear = impact == target_tile;
                let event = proto::ProjectileEvent {
                    attacker: player_entity.index_u32(),
                    from: attacker_tile,
                    to: impact,
                    kind: "arrow".into(),
                    hit: los_clear,
                };
                let payload = proto::encode_inner(&event).unwrap_or_default();
                let _ = bcast.tx.send(ServerEvent::Ephemeral {
                    kind: proto::EPHEMERAL_PROJECTILE,
                    to: proto::PLAYER_SLOT_NONE,
                    payload,
                });
                if los_clear {
                    match target_z {
                        None => resolve_attack_hit(
                            player_entity,
                            target_entity,
                            proto::PlayerSlot(slot.0),
                            attack,
                            &bcast,
                            &registry,
                            &clock,
                            &seed,
                            &config,
                            &equipment,
                            &mut respawns,
                            &mut kill_counts,
                            &mut commands,
                            &mut q_players,
                            &mut q_mobs,
                        ),
                        Some(tz) if pvp_allowed(az, tz) => resolve_pvp_hit(
                            player_entity,
                            target_entity,
                            attack,
                            &bcast,
                            &seed,
                            &clock,
                            &mut q_players,
                        ),
                        Some(_) => {}
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
                if !claimed_items.insert(target_entity) {
                    continue;
                }
                inv.add(&item_ref, count);
                commands.entity(target_entity).despawn();
                let event = proto::PickupEvent {
                    item_ref: item_ref.to_string(),
                    count,
                };
                let pickup = proto::encode_inner(&event).unwrap_or_default();
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

pub fn count_ref(inv: &Inventory, item_ref: &str) -> u32 {
    inv.slots
        .iter()
        .find(|(r, _)| r == item_ref)
        .map(|(_, c)| *c)
        .unwrap_or(0)
}

pub fn remove_ref(inv: &mut Inventory, item_ref: &str, qty: u32) -> bool {
    let Some(idx) = inv.slots.iter().position(|(r, _)| r == item_ref) else {
        return false;
    };
    if inv.slots[idx].1 < qty {
        return false;
    }
    inv.slots[idx].1 -= qty;
    if inv.slots[idx].1 == 0 {
        inv.slots.remove(idx);
    }
    true
}

/// Combined spendable coin: loose coins plus gold-bars at GOLD_BAR_VALUE each.
pub fn coin_balance(inv: &Inventory) -> u32 {
    inv.slots.iter().fold(0u32, |acc, (r, c)| {
        if r == COIN_REF {
            acc.saturating_add(*c)
        } else if r == GOLD_BAR_REF {
            acc.saturating_add(c.saturating_mul(GOLD_BAR_VALUE))
        } else {
            acc
        }
    })
}

/// Spend `amount` coin-equivalent, breaking gold-bars into loose coins as needed.
/// Returns false (and leaves the inventory untouched) if the balance is short.
pub fn spend_coins(inv: &mut Inventory, amount: u32) -> bool {
    if coin_balance(inv) < amount {
        return false;
    }
    while count_ref(inv, COIN_REF) < amount {
        if !remove_ref(inv, GOLD_BAR_REF, 1) {
            return false;
        }
        inv.add(COIN_REF, GOLD_BAR_VALUE);
    }
    remove_ref(inv, COIN_REF, amount)
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
    mp: i32,
    max_mp: i32,
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
    send_stats(
        bcast,
        slot,
        xp.level,
        xp.xp,
        hp.max_hp,
        stats.attack,
        kills,
        mp,
        max_mp,
    );
}

fn send_equipped(
    bcast: &Outbound,
    slot: proto::PlayerSlot,
    equip_slot: &str,
    item_ref: Option<&str>,
    attack: i32,
    defense: i32,
) {
    let event = proto::EquippedEvent {
        item_ref: item_ref.map(|s| s.to_string()),
        slot: equip_slot.to_string(),
        attack,
        defense,
    };
    let payload = proto::encode_inner(&event).unwrap_or_default();
    let _ = bcast.tx.send(ServerEvent::Ephemeral {
        kind: proto::EPHEMERAL_EQUIPPED,
        to: slot,
        payload,
    });
}

#[allow(clippy::too_many_arguments)]
fn send_stats(
    bcast: &Outbound,
    slot: proto::PlayerSlot,
    level: i32,
    xp: i32,
    max_hp: i32,
    attack: i32,
    kills: u32,
    mp: i32,
    max_mp: i32,
) {
    let event = proto::StatsEvent {
        level,
        xp,
        xp_next: xp_to_next(level),
        max_hp,
        attack,
        kills,
        mp,
        max_mp,
    };
    let payload = proto::encode_inner(&event).unwrap_or_default();
    let _ = bcast.tx.send(ServerEvent::Ephemeral {
        kind: proto::EPHEMERAL_STATS,
        to: slot,
        payload,
    });
}

#[allow(clippy::too_many_arguments)]
pub(crate) fn broadcast_player_stats(
    bcast: &Outbound,
    slot: proto::PlayerSlot,
    xp: &XpState,
    health: &Health,
    stats: &CombatStats,
    mana: &Mana,
    kills: u32,
) {
    send_stats(
        bcast,
        slot,
        xp.level,
        xp.xp,
        health.max_hp,
        stats.attack,
        kills,
        mana.mp,
        mana.max_mp,
    );
}

pub fn send_inventory(bcast: &Outbound, slot: proto::PlayerSlot, inv: &Inventory) {
    let items = inv
        .slots
        .iter()
        .map(|(r, c)| proto::InventoryItem {
            item_ref: r.clone(),
            count: *c,
        })
        .collect();
    let event = proto::InventorySync { items };
    let payload = proto::encode_inner(&event).unwrap_or_default();
    let _ = bcast.tx.send(ServerEvent::Ephemeral {
        kind: proto::EPHEMERAL_INVENTORY,
        to: slot,
        payload,
    });
}

/// How far (Chebyshev) from the player a deployable may be placed.
pub const PLACE_RANGE: i32 = 4;

/// Validate and consume one deployable item for placement. On success the item is
/// already removed from `inv` and the caller queues the env spawn. Failure leaves
/// the inventory untouched and returns a short reason for the client.
fn place_item(
    deployables: &Deployables,
    map: &WalkableMap,
    z: i32,
    from: Tile,
    tile: Tile,
    item_ref: &str,
    inv: &mut Inventory,
) -> Result<(), &'static str> {
    if !deployables.0.contains_key(item_ref) {
        return Err("not_placeable");
    }
    if !inv.slots.iter().any(|(r, c)| r == item_ref && *c > 0) {
        return Err("not_held");
    }
    if from.chebyshev(tile) > PLACE_RANGE {
        return Err("too_far");
    }
    if !map.is_walkable_z(z, tile) {
        return Err("blocked");
    }
    if inv.remove(item_ref, 1) == 0 {
        return Err("not_held");
    }
    Ok(())
}

fn send_item_placed(
    bcast: &Outbound,
    slot: proto::PlayerSlot,
    item_ref: &str,
    tile: Tile,
    ok: bool,
    reason: Option<&'static str>,
) {
    let event = proto::ItemPlacedEvent {
        item_ref: item_ref.to_string(),
        tile,
        ok,
        reason: reason.map(|s| s.to_string()),
    };
    let payload = proto::encode_inner(&event).unwrap_or_default();
    let _ = bcast.tx.send(ServerEvent::Ephemeral {
        kind: proto::EPHEMERAL_ITEM_PLACED,
        to: slot,
        payload,
    });
}

/// Spawn queued placements as env objects (item already removed from inventory by
/// `place_item`). Mirrors `apply_drops` but reads the game's `Deployables` table
/// for the env ref + behavior, and blocks the tile when the env is a blocker.
fn apply_placements(
    mut placements: ResMut<PendingPlacements>,
    deployables: Res<Deployables>,
    registry: Res<KindRegistry>,
    mut map: ResMut<WalkableMap>,
    mut log: ResMut<PersistedEnvLog>,
    sink: Res<EnvPersistSink>,
    mut commands: Commands,
) {
    let mut changed = false;
    for (slot, item_ref, tile, z, rot) in placements.0.drain(..) {
        let Some(spec) = deployables.0.get(&item_ref) else {
            continue;
        };
        let mut opts = spec.opts.clone();
        opts.floor = z;
        let blocker = opts.blocker;
        if let Some(eid) = spawn_env_object(&mut commands, &registry, &spec.env_ref, tile, opts) {
            commands.entity(eid).insert((
                PlacedBy {
                    owner: slot,
                    kit_ref: item_ref.clone(),
                },
                FurnitureRot(rot),
            ));
            if blocker {
                map.block_tile_z(z, tile);
            }
            log.0.push(PersistedEnvObject {
                env_ref: spec.env_ref.clone(),
                x: tile.x,
                y: tile.y,
                floor: z,
                sub: rot,
            });
            changed = true;
        }
    }
    if changed {
        persist_env_snapshot(&log, &sink);
    }
}

/// Push the current placed-object set to the durable sink, if wired.
fn persist_env_snapshot(log: &PersistedEnvLog, sink: &EnvPersistSink) {
    if let Some(tx) = &sink.0 {
        let _ = tx.send(log.0.clone());
    }
}

/// Resolve queued pickups: the owning player reclaims a placed env object within
/// reach — the kit is refunded, the object despawned, and its tile unblocked. A
/// mismatched owner, out-of-range request, or missing object is dropped silently.
#[allow(clippy::type_complexity, clippy::too_many_arguments)]
fn apply_pickups(
    mut pickups: ResMut<PendingPickups>,
    bcast: Res<Outbound>,
    mut map: ResMut<WalkableMap>,
    mut log: ResMut<PersistedEnvLog>,
    sink: Res<EnvPersistSink>,
    env_q: Query<(Entity, &GridPos, Option<&Floor>, &PlacedBy)>,
    mut players: Query<(&PlayerSlotTag, &mut Inventory)>,
    mut commands: Commands,
) {
    let mut changed = false;
    for (slot, tile, z, from) in pickups.0.drain(..) {
        if from.chebyshev(tile) > PLACE_RANGE {
            continue;
        }
        let Some((eid, _, _, placed)) = env_q.iter().find(|(_, gp, fl, pb)| {
            gp.tile == tile && fl.map(|f| f.0).unwrap_or(0) == z && pb.owner == slot
        }) else {
            continue;
        };
        if let Some((_, mut inv)) = players.iter_mut().find(|(tag, _)| tag.0 == slot) {
            inv.add(&placed.kit_ref, 1);
            send_inventory(&bcast, slot, &inv);
        }
        commands.entity(eid).despawn();
        map.unblock_tile_z(z, tile);
        log.0
            .retain(|o| !(o.x == tile.x && o.y == tile.y && o.floor == z));
        changed = true;
    }
    if changed {
        persist_env_snapshot(&log, &sink);
    }
}

/// Resolve queued tree fellings: a player adjacent (Chebyshev <= 1) to a standing
/// tree on their floor fells it — collision clears, state flips to felled, and the
/// felled instance is persisted so it survives a restart. When no standing tree is
/// found at the tile a standing bush is harvested instead — same adjacency rule, but
/// the bush stays walkable so only its `harvested` flag flips and persists. Invalid,
/// out-of-range, or duplicate requests are dropped silently.
#[allow(clippy::type_complexity)]
fn apply_fells(
    mut fells: ResMut<PendingFells>,
    mut map: ResMut<WalkableMap>,
    mut log: ResMut<PersistedEnvLog>,
    sink: Res<EnvPersistSink>,
    mut trees: Query<(Entity, &GridPos, Option<&Floor>, &mut TreeState)>,
    mut bushes: Query<(Entity, &GridPos, Option<&Floor>, &mut BushState)>,
    mut commands: Commands,
) {
    let mut changed = false;
    for (tile, z, from) in fells.0.drain(..) {
        if from.chebyshev(tile) > 1 {
            continue;
        }
        if let Some((eid, _, _, mut state)) = trees.iter_mut().find(|(_, gp, fl, st)| {
            gp.tile == tile && fl.map(|f| f.0).unwrap_or(0) == z && !st.felled
        }) {
            state.felled = true;
            let sub = state.sub();
            map.unblock_tile_z(z, tile);
            commands.entity(eid).remove::<Blocker>();
            log.0.retain(|o| {
                !(o.env_ref == TREE_REF && o.x == tile.x && o.y == tile.y && o.floor == z)
            });
            log.0.push(PersistedEnvObject {
                env_ref: TREE_REF.to_string(),
                x: tile.x,
                y: tile.y,
                floor: z,
                sub,
            });
            changed = true;
            continue;
        }
        let Some((_, _, _, mut bush)) = bushes.iter_mut().find(|(_, gp, fl, st)| {
            gp.tile == tile && fl.map(|f| f.0).unwrap_or(0) == z && !st.harvested
        }) else {
            continue;
        };
        bush.harvested = true;
        let sub = bush.sub();
        log.0
            .retain(|o| !(o.env_ref == BUSH_REF && o.x == tile.x && o.y == tile.y && o.floor == z));
        log.0.push(PersistedEnvObject {
            env_ref: BUSH_REF.to_string(),
            x: tile.x,
            y: tile.y,
            floor: z,
            sub,
        });
        changed = true;
    }
    if changed {
        persist_env_snapshot(&log, &sink);
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
    mut q_mobs: Query<
        (
            Entity,
            &mut GridPos,
            &mut MoveTarget,
            &mut Aggro,
            Option<&Floor>,
        ),
        Without<PlayerSlotTag>,
    >,
    mut q_players: Query<
        (
            Entity,
            &GridPos,
            &mut Health,
            &Defense,
            &PlayerSlotTag,
            &mut StatusEffects,
            Option<&Floor>,
        ),
        With<PlayerSlotTag>,
    >,
) {
    for (mob, mut pos, mut mv, mut aggro, mob_floor) in q_mobs.iter_mut() {
        let mob_z = mob_floor.map(|f| f.0).unwrap_or(0);
        let mut nearest: Option<(Entity, Tile, i32)> = None;
        for (pe, ppos, hp, _, _, _, pfloor) in q_players.iter() {
            if hp.hp <= 0 {
                continue;
            }
            // A mob only sees players on its own floor.
            if pfloor.map(|f| f.0).unwrap_or(0) != mob_z {
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
            let Ok((_, _, mut hp, defense, slot, mut status, _)) = q_players.get_mut(player_entity)
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
            let event = proto::CombatEvent {
                attacker: mob.index_u32(),
                target: player_entity.index_u32(),
                target_ref: Some("player".to_string()),
                dmg,
                crit: false,
                died,
            };
            let payload = proto::encode_inner(&event).unwrap_or_default();
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
        if !try_move(primary, &map, mob_z, &pos, &mut mv, None) && secondary != primary {
            try_move(secondary, &map, mob_z, &pos, &mut mv, None);
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
    let event = proto::StatusEvent {
        kind: kind as u8,
        magnitude,
        remaining,
    };
    let payload = proto::encode_inner(&event).unwrap_or_default();
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
                    proto::StatusKind::Poison | proto::StatusKind::Burn => hp.hp -= e.magnitude,
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
    bcast: Res<Outbound>,
    kill_counts: Res<KillCounts>,
    mut q: Query<(
        &PlayerSlotTag,
        &mut Health,
        &mut Mana,
        &GridPos,
        &XpState,
        &CombatStats,
    )>,
) {
    if !clock.tick.is_multiple_of(REGEN_PERIOD_TICKS) {
        return;
    }
    for (slot, mut hp, mut mana, pos, xp, stats) in q.iter_mut() {
        if hp.hp > 0 && hp.hp < hp.max_hp {
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
        if hp.hp > 0 && mana.mp < mana.max_mp {
            mana.mp = (mana.mp + MANA_REGEN_AMOUNT).min(mana.max_mp);
            send_stats(
                &bcast,
                slot.0,
                xp.level,
                xp.xp,
                hp.max_hp,
                stats.attack,
                kill_counts.0.get(&slot.0.0).copied().unwrap_or(0),
                mana.mp,
                mana.max_mp,
            );
        }
    }
}

#[allow(clippy::type_complexity)]
fn respawn_players(
    config: Res<SimConfig>,
    mut q: Query<
        (
            &mut GridPos,
            &mut Health,
            &mut StatusEffects,
            &mut MoveSpeed,
            &mut FloatMove,
        ),
        With<PlayerSlotTag>,
    >,
) {
    for (mut pos, mut hp, mut status, mut speed, mut fm) in q.iter_mut() {
        if hp.hp > 0 {
            continue;
        }
        pos.tile = config.spawn;
        fm.body = FloatBody::at(config.spawn.x as f32, config.spawn.y as f32);
        fm.intent_x = 0;
        fm.intent_y = 0;
        fm.run = false;
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
    z: i32,
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
    if !map.is_walkable_z(z, candidate) {
        return false;
    }
    mv.target = Some(candidate);
    mv.progress = 0;
    true
}

/// Queue a one-tile move by an arbitrary (dx,dy) step where each component is
/// -1/0/1 — the 8-way counterpart to `try_move`. A diagonal step also requires
/// both orthogonal neighbors to be open so mobs can't cut through wall corners.
/// `clearance` > 0 additionally requires the destination to have that open ring,
/// so a large creature never steps onto a wall-adjacent or narrow-hall tile.
fn try_step(
    dx: i32,
    dy: i32,
    map: &WalkableMap,
    z: i32,
    pos: &GridPos,
    mv: &mut MoveTarget,
    clearance: i32,
) -> bool {
    if mv.target.is_some() || (dx == 0 && dy == 0) {
        return false;
    }
    let candidate = Tile::new(pos.tile.x + dx, pos.tile.y + dy);
    if !map.is_walkable_z(z, candidate) {
        return false;
    }
    if dx != 0
        && dy != 0
        && (!map.is_walkable_z(z, Tile::new(pos.tile.x + dx, pos.tile.y))
            || !map.is_walkable_z(z, Tile::new(pos.tile.x, pos.tile.y + dy)))
    {
        return false;
    }
    if clearance > 0 && !has_clearance(map, z, candidate, clearance) {
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

fn wander_system(
    clock: Res<SimClock>,
    seed: Res<SimSeed>,
    map: Res<WalkableMap>,
    mut q: Query<(
        Entity,
        &mut GridPos,
        &mut MoveTarget,
        &mut Wander,
        Option<&Floor>,
    )>,
) {
    for (entity, mut pos, mut mv, mut w, floor) in q.iter_mut() {
        if mv.target.is_some() || clock.tick < w.next_tick {
            continue;
        }
        w.next_tick = clock.tick.saturating_add(w.period_ticks);
        let dir = dir_from_u64(hash3(seed.0, entity.index_u32() as u64, clock.tick as u64));
        pos.facing = dir.facing();
        let z = floor.map(|f| f.0).unwrap_or(0);
        try_move(dir, &map, z, &pos, &mut mv, Some((w.origin, w.radius)));
    }
}

/// Roam: greedy-step toward a random target tile within `radius` of the origin,
/// then dwell idle a random span before the next trip. One tile is queued per
/// call (advance_movement walks it); the whole path plays out across ticks, so
/// the mob reads as deliberately travelling rather than jittering in place.
#[allow(clippy::type_complexity)]
fn roam_system(
    clock: Res<SimClock>,
    seed: Res<SimSeed>,
    map: Res<WalkableMap>,
    mut q: Query<(
        Entity,
        &mut GridPos,
        &mut MoveTarget,
        &mut Roam,
        Option<&Floor>,
        Option<&FloatSteer>,
        Option<&FloatMove>,
    )>,
) {
    for (entity, mut pos, mut mv, mut roam, floor, steer, fm) in q.iter_mut() {
        if mv.target.is_some() {
            continue;
        }
        let z = floor.map(|f| f.0).unwrap_or(0);
        match roam.target {
            Some(dest) if dest != pos.tile => {
                // Float-steered mobs (wyverns) follow the waypoint via
                // `advance_npc_float`; roam only owns target selection for them,
                // never the per-tile grid step. Their `arrive()` easing settles
                // within the arrive radius, not on the exact target tile, so count
                // being within a tile as arrival (registered while still moving) —
                // else the body creeps at the waypoint forever, never dwelling.
                if steer.is_some() {
                    if (dest.x - pos.tile.x).abs() <= 1 && (dest.y - pos.tile.y).abs() <= 1 {
                        let span = (roam.dwell_max - roam.dwell_min + 1).max(1) as u64;
                        let dwell = roam.dwell_min
                            + (hash3(seed.0, entity.index_u32() as u64, clock.tick as u64) % span)
                                as u32;
                        roam.target = None;
                        roam.resume_tick = clock.tick.saturating_add(dwell);
                    }
                    continue;
                }
                // 8-way stepping: prefer the diagonal toward the target, then
                // fall back to a single axis. Diagonal tile-steps give the
                // client true diagonal deltas, so all 8 sheet facings surface.
                let sx = (dest.x - pos.tile.x).signum();
                let sy = (dest.y - pos.tile.y).signum();
                let c = roam.clearance;
                pos.facing = facing_from_intent(sx as i8, sy as i8);
                let _ = try_step(sx, sy, &map, z, &pos, &mut mv, c)
                    || (sx != 0 && try_step(sx, 0, &map, z, &pos, &mut mv, c))
                    || (sy != 0 && try_step(0, sy, &map, z, &pos, &mut mv, c));
                // Fully blocked — abandon this trip and dwell briefly.
                if mv.target.is_none() {
                    roam.target = None;
                    roam.resume_tick = clock.tick.saturating_add(roam.dwell_min);
                }
            }
            Some(_) => {
                // Arrived: dwell a random span before picking the next target.
                let span = (roam.dwell_max - roam.dwell_min + 1).max(1) as u64;
                let dwell = roam.dwell_min
                    + (hash3(seed.0, entity.index_u32() as u64, clock.tick as u64) % span) as u32;
                roam.target = None;
                roam.resume_tick = clock.tick.saturating_add(dwell);
            }
            None => {
                if clock.tick < roam.resume_tick {
                    continue;
                }
                let h = hash3(seed.0, entity.index_u32() as u64, clock.tick as u64);
                if steer.is_some() {
                    // Flyer pathing: bias the next waypoint AHEAD of the current
                    // heading (a forward cone), curving back toward home the closer
                    // it is to the roam edge — so flight sweeps long arcs instead of
                    // picking a point behind it and reversing. Flyers ignore terrain,
                    // so any in-bounds tile is a valid target.
                    use core::f32::consts::{PI, TAU};
                    let cx = pos.tile.x as f32;
                    let cy = pos.tile.y as f32;
                    let ox = roam.origin.x as f32;
                    let oy = roam.origin.y as f32;
                    let heading = match fm {
                        Some(f) if f.body.speed() > 0.1 => f.body.vy.atan2(f.body.vx),
                        _ => (h % 6283) as f32 / 1000.0,
                    };
                    let edge =
                        ((cx - ox).hypot(cy - oy) / roam.radius.max(1) as f32).clamp(0.0, 1.0);
                    let mut turn_home = (oy - cy).atan2(ox - cx) - heading;
                    while turn_home > PI {
                        turn_home -= TAU;
                    }
                    while turn_home < -PI {
                        turn_home += TAU;
                    }
                    let spread = (((h >> 20) % 1000) as f32 / 1000.0 - 0.5) * (PI * 0.6);
                    let ang = heading + turn_home * (edge * 0.85) + spread;
                    let dist =
                        roam.radius as f32 * (0.5 + 0.4 * (((h >> 40) % 1000) as f32 / 1000.0));
                    let cand = Tile::new(
                        (cx + ang.cos() * dist).round() as i32,
                        (cy + ang.sin() * dist).round() as i32,
                    );
                    if cand != pos.tile {
                        roam.target = Some(cand);
                    } else {
                        roam.resume_tick = clock.tick.saturating_add(1);
                    }
                    continue;
                }
                let span = (2 * roam.radius + 1) as u64;
                let rx = (h % span) as i32 - roam.radius;
                let ry = ((h >> 20) % span) as i32 - roam.radius;
                let cand = Tile::new(roam.origin.x + rx, roam.origin.y + ry);
                let ok = cand != pos.tile
                    && map.is_walkable_z(z, cand)
                    && (roam.clearance == 0 || has_clearance(&map, z, cand, roam.clearance));
                if ok {
                    roam.target = Some(cand);
                } else {
                    // Bad pick — retry shortly instead of every tick.
                    roam.resume_tick = clock.tick.saturating_add(1);
                }
            }
        }
    }
}

fn facing_from_intent(mx: i8, my: i8) -> proto::Facing {
    if mx.abs() >= my.abs() {
        if mx >= 0 {
            proto::Facing::Right
        } else {
            proto::Facing::Left
        }
    } else if my > 0 {
        proto::Facing::Down
    } else {
        proto::Facing::Up
    }
}

fn advance_float(
    map: Res<WalkableMap>,
    mut q: Query<
        (
            &mut GridPos,
            &mut FloatMove,
            &mut IntentBuffer,
            Option<&Floor>,
        ),
        With<PlayerSlotTag>,
    >,
) {
    let dt_ms = 1000.0 / SIM_TICK_HZ as f32;
    for (mut pos, mut fm, mut intents, floor) in q.iter_mut() {
        let z = floor.map(|f| f.0).unwrap_or(0);
        let is_blocked = |x: i32, y: i32| !map.is_walkable_z(z, Tile::new(x, y));
        // Consume exactly one buffered intent per server tick (FIFO), so the body
        // reproduces the client's tick-by-tick motion — including stopping the
        // same tick the client released, no held-intent over-travel.
        let (mx, my, run) = intents.next();
        fm.intent_x = mx;
        fm.intent_y = my;
        fm.run = run;
        let (ix, iy) = crate::float_move::intent_from_axes(mx, my);
        let speed = if run {
            crate::float_move::RUN_SPEED
        } else {
            crate::float_move::WALK_SPEED
        };
        crate::float_move::step_float(&mut fm.body, ix, iy, speed, &is_blocked, dt_ms);
        let (tx, ty) = fm.body.tile();
        pos.tile = Tile::new(tx, ty);
        if mx != 0 || my != 0 {
            pos.facing = facing_from_intent(mx, my);
        }
    }
}

/// Float steering for opt-in NPCs (wyverns): steer the `FloatBody` toward the
/// current Roam waypoint with a banking turn-rate cap, then sync `GridPos.tile`
/// from the float tile so all grid systems (collision/streaming/aggro/targeting)
/// stay authoritative. Runs in the Movement set alongside the grid mover, which
/// is gated `Without<FloatSteer>` so nothing double-moves.
#[allow(clippy::type_complexity)]
fn advance_npc_float(
    map: Res<WalkableMap>,
    mut q: Query<
        (
            &mut GridPos,
            &mut FloatMove,
            &Roam,
            &MoveProfile,
            Option<&Floor>,
        ),
        With<FloatSteer>,
    >,
) {
    let dt_ms = 1000.0 / SIM_TICK_HZ as f32;
    for (mut pos, mut fm, roam, profile, floor) in q.iter_mut() {
        let z = floor.map(|f| f.0).unwrap_or(0);
        // No waypoint (dwelling): ease to a stop in place.
        let dest = roam.target.unwrap_or_else(|| {
            let (tx, ty) = fm.body.tile();
            Tile::new(tx, ty)
        });
        // Speed: flyers cruise full; ground units are scaled by their biome.
        let speed = match profile.terrain {
            Terrain::Fly => profile.cruise_speed,
            Terrain::Collide => {
                let (tx, ty) = fm.body.tile();
                let biome = crate::biome::biome_at_tile(tx, ty);
                profile.cruise_speed * crate::biome::ground_speed_mult(biome)
            }
        };
        // Flyers soar over everything (no-op blocker); ground units collide.
        let real_blocked = |x: i32, y: i32| !map.is_walkable_z(z, Tile::new(x, y));
        let fly_blocked = |_x: i32, _y: i32| false;
        match profile.terrain {
            Terrain::Fly => crate::float_move::step_steer(
                &mut fm.body,
                dest.x as f32,
                dest.y as f32,
                speed,
                profile.max_turn_rate,
                profile.accel,
                profile.friction,
                profile.arrive_radius,
                &fly_blocked,
                dt_ms,
            ),
            Terrain::Collide => crate::float_move::step_steer(
                &mut fm.body,
                dest.x as f32,
                dest.y as f32,
                speed,
                profile.max_turn_rate,
                profile.accel,
                profile.friction,
                profile.arrive_radius,
                &real_blocked,
                dt_ms,
            ),
        }
        let (tx, ty) = fm.body.tile();
        pos.tile = Tile::new(tx, ty);
        if fm.body.speed() > 0.05 {
            pos.facing = facing_from_vel(fm.body.vx, fm.body.vy);
        }
    }
}

/// Facing from a float velocity — the float counterpart to `facing_from_intent`.
fn facing_from_vel(vx: f32, vy: f32) -> proto::Facing {
    if vx.abs() >= vy.abs() {
        if vx >= 0.0 {
            proto::Facing::Right
        } else {
            proto::Facing::Left
        }
    } else if vy > 0.0 {
        proto::Facing::Down
    } else {
        proto::Facing::Up
    }
}

fn advance_movement(
    mut q: Query<(&mut GridPos, &mut MoveTarget, &MoveSpeed), Without<FloatSteer>>,
) {
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

/// Move players between dungeon floors when they stand on a stair tile. The
/// stair geometry is server-authoritative (seed-derived for the endless
/// dungeon, explicit for hand-placed maps); a locked stair requires the player
/// to hold its key item. On a successful transition the player's `Floor` is set
/// (inserted on first descent), they teleport to the matching stair on the
/// destination floor, any in-flight move is cancelled, and a `FloorChange`
/// ephemeral tells the client to re-stream the new floor. No-op when no
/// `Stairs` resource is registered (single-floor games).
#[allow(clippy::type_complexity)]
fn stair_system(
    stairs: Option<Res<Stairs>>,
    bcast: Res<Outbound>,
    mut commands: Commands,
    mut q: Query<
        (
            Entity,
            &mut GridPos,
            &mut FloatMove,
            &Inventory,
            &PlayerSlotTag,
            Option<&mut Floor>,
            Option<&StairGrace>,
        ),
        With<PlayerSlotTag>,
    >,
) {
    let Some(stairs) = stairs else {
        return;
    };
    for (entity, mut pos, mut fm, inv, slot, floor, grace) in q.iter_mut() {
        // Step-off grace: while still standing on the tile we just arrived at
        // via a stair, don't re-trigger — otherwise a descent that lands on the
        // destination floor's reciprocal stair bounces straight back. Clear the
        // grace once the player has moved off that tile.
        if let Some(g) = grace {
            if g.0 == pos.tile {
                continue;
            }
            commands.entity(entity).remove::<StairGrace>();
        }
        let z = floor.as_ref().map(|f| f.0).unwrap_or(0);
        let Some(link) = stairs.at(z, pos.tile) else {
            continue;
        };
        // Locked stair: need the key item in inventory.
        if let Some(key) = &link.lock
            && count_ref(inv, key) == 0
        {
            continue;
        }

        pos.tile = link.dest_tile;
        fm.body = FloatBody::at(link.dest_tile.x as f32, link.dest_tile.y as f32);
        match floor {
            Some(mut f) => f.0 = link.dest_z,
            None => {
                commands.entity(entity).insert(Floor(link.dest_z));
            }
        }
        // Arm the step-off grace on the arrival tile (the reciprocal stair), so
        // the player must leave it before another transition can fire.
        commands.entity(entity).insert(StairGrace(link.dest_tile));

        let event = proto::FloorChangeEvent {
            z: link.dest_z,
            tile: link.dest_tile,
        };
        let payload = proto::encode_inner(&event).unwrap_or_default();
        let _ = bcast.tx.send(ServerEvent::Ephemeral {
            kind: proto::EPHEMERAL_FLOOR,
            to: slot.0,
            payload,
        });
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
        Option<&MoveTarget>,
        Option<&MoveSpeed>,
        Option<&Health>,
        Option<&StatusEffects>,
        Option<&Floor>,
        Option<&FloatMove>,
        Option<&PlacedBy>,
        Option<&TreeState>,
        Option<&BushState>,
        Option<&FurnitureRot>,
    )>,
) {
    if !clock.tick.is_multiple_of(SNAPSHOT_EVERY_N_TICKS) {
        return;
    }

    let now = clock.tick;
    let entities: Vec<proto::EntityDelta> = q
        .iter()
        .map(
            |(
                entity,
                kind,
                slot,
                pos,
                mv,
                speed,
                hp,
                status,
                floor,
                fm,
                placed,
                tree,
                bush,
                furniture,
            )| {
                let sub = match (tree, bush, furniture) {
                    (Some(t), _, _) => t.sub(),
                    (_, Some(b), _) => b.sub(),
                    (_, _, Some(f)) => f.0,
                    _ => mv
                        .filter(|m| m.target.is_some())
                        .map(|m| {
                            let span = speed.map(|s| s.ticks_per_tile).unwrap_or(1).max(1) as u32;
                            ((m.progress as u32 * 255) / span).min(255) as u8
                        })
                        .unwrap_or(0),
                };
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
                // Float entities (players + steered NPCs) send their sub-tile pos +
                // vel; everything else sends its tile quantized. Always emitted — a
                // per-field skip can't survive the positional postcard wire, and a
                // zero is a single varint byte there anyway.
                let (qx, qy, qvx, qvy, input_ack) = match fm {
                    Some(f) => (
                        proto::quantize_pos(f.body.x),
                        proto::quantize_pos(f.body.y),
                        proto::quantize_vel(f.body.vx),
                        proto::quantize_vel(f.body.vy),
                        f.last_seq,
                    ),
                    None => (
                        proto::quantize_pos(pos.tile.x as f32),
                        proto::quantize_pos(pos.tile.y as f32),
                        0,
                        0,
                        0,
                    ),
                };
                proto::EntityDelta {
                    eid: proto::EntityId(entity.index_u32()),
                    kind: kind.0,
                    owner: slot
                        .map(|s| s.0)
                        .or(placed.map(|p| p.owner))
                        .unwrap_or(proto::PLAYER_SLOT_NONE),
                    tile: pos.tile,
                    facing: pos.facing,
                    sub,
                    qx,
                    qy,
                    qvx,
                    qvy,
                    input_ack,
                    hp: hp.map(|h| h.hp).unwrap_or(0),
                    max_hp: hp.map(|h| h.max_hp).unwrap_or(0),
                    destroyed: false,
                    z: floor.map(|f| f.0).unwrap_or(0),
                    effects,
                }
            },
        )
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
pub(crate) mod test_support {
    use super::*;

    pub(crate) type Harness = (
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

    pub(crate) fn harness(seed: u64) -> Harness {
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

    pub(crate) fn join(roster: &Arc<RwLock<Roster>>, name: &str) -> proto::PlayerSlot {
        roster
            .write()
            .unwrap()
            .claim(name.to_string(), test_ulid(name))
            .expect("slot available")
    }

    pub(crate) fn player_for_slot(app: &mut App, slot: proto::PlayerSlot) -> Entity {
        let mut q = app.world_mut().query::<(Entity, &PlayerSlotTag)>();
        q.iter(app.world())
            .find(|(_, s)| s.0 == slot)
            .map(|(e, _)| e)
            .expect("player for slot")
    }

    pub(crate) fn set_inventory(app: &mut App, entity: Entity, items: &[(&str, u32)]) {
        let mut inv = app.world_mut().get_mut::<Inventory>(entity).unwrap();
        inv.slots = items.iter().map(|(r, c)| (r.to_string(), *c)).collect();
    }

    pub(crate) fn inv_count(app: &App, entity: Entity, item_ref: &str) -> u32 {
        app.world()
            .get::<Inventory>(entity)
            .unwrap()
            .slots
            .iter()
            .find(|(r, _)| r == item_ref)
            .map(|(_, c)| *c)
            .unwrap_or(0)
    }
}

#[cfg(test)]
mod tests {
    use super::test_support::*;
    use super::*;
    use std::collections::HashSet;

    #[test]
    fn drop_item_spawns_ground_loot_and_decrements_inventory() {
        let (mut app, _rx, input_tx, roster) = harness(0x70);
        let slot = join(&roster, "dropper");
        app.update();
        let player = player_entity(&mut app);
        {
            let mut inv = app.world_mut().get_mut::<Inventory>(player).unwrap();
            inv.add("potion", 3);
        }
        input_tx
            .send((
                slot,
                Input::DropItem {
                    item_ref: "potion".into(),
                    qty: 2,
                },
            ))
            .unwrap();
        for _ in 0..3 {
            app.update();
        }
        let inv = app.world().get::<Inventory>(player).unwrap();
        let left = inv
            .slots
            .iter()
            .find(|(r, _)| r == "potion")
            .map(|(_, c)| *c)
            .unwrap_or(0);
        assert_eq!(left, 1, "inventory not decremented to 1 (got {left})");
        let mut q = app.world_mut().query::<&GroundItem>();
        let dropped = q
            .iter(app.world())
            .any(|g| g.item_ref == "potion" && g.count == 2);
        assert!(dropped, "dropped potion did not spawn as ground loot");
    }

    #[test]
    fn move_item_reorders_inventory_slots() {
        let (mut app, _rx, input_tx, roster) = harness(0x71);
        let slot = join(&roster, "organizer");
        app.update();
        let player = player_entity(&mut app);
        {
            let mut inv = app.world_mut().get_mut::<Inventory>(player).unwrap();
            inv.add("potion", 1);
            inv.add("coin", 5);
            inv.add("elixir", 2);
        }
        input_tx
            .send((slot, Input::MoveItem { from: 0, to: 2 }))
            .unwrap();
        for _ in 0..3 {
            app.update();
        }
        let inv = app.world().get::<Inventory>(player).unwrap();
        let order: Vec<&str> = inv.slots.iter().map(|(r, _)| r.as_str()).collect();
        assert_eq!(
            order,
            vec!["coin", "elixir", "potion"],
            "slot order not persisted after MoveItem"
        );
    }

    #[test]
    fn env_hazard_burns_entity_on_tile() {
        let (mut app, _rx, _tx, _roster) = harness(0x111);
        let t = Tile::new(10, 10);
        // Plain Health entity (no PlayerSlotTag → regen/status systems ignore it).
        let victim = app
            .world_mut()
            .spawn((
                EntityKind(1),
                GridPos::at(t),
                MoveTarget::default(),
                Health {
                    hp: 100,
                    max_hp: 100,
                },
            ))
            .id();
        app.world_mut().spawn((
            HazardZone {
                magnitude: 8,
                period_ticks: 1,
            },
            GridPos::at(t),
        ));
        for _ in 0..3 {
            app.update();
        }
        let hp = app.world().get::<Health>(victim).unwrap().hp;
        assert_eq!(hp, 100 - 8 * 3, "burned 8/tick for 3 ticks");
    }

    fn spawn_owned_campfire(app: &mut App, tile: Tile, owner: u16) -> Entity {
        app.world_mut()
            .resource_mut::<WalkableMap>()
            .block_tile_z(0, tile);
        app.world_mut()
            .spawn((
                EntityKind(1),
                GridPos::at(tile),
                MoveTarget::default(),
                Blocker,
                PlacedBy {
                    owner: proto::PlayerSlot(owner),
                    kit_ref: "campfire-kit".to_string(),
                },
            ))
            .id()
    }

    #[test]
    fn owner_pickup_refunds_kit_and_frees_tile() {
        let (mut app, _rx, _tx, _roster) = harness(0x555);
        let tile = Tile::new(9, 9);
        let from = Tile::new(9, 10);
        let env = spawn_owned_campfire(&mut app, tile, 0);
        let player = app
            .world_mut()
            .spawn((
                EntityKind(PLAYER_KIND),
                GridPos::at(from),
                MoveTarget::default(),
                Inventory::default(),
                PlayerSlotTag(proto::PlayerSlot(0)),
            ))
            .id();
        app.world_mut().resource_mut::<PendingPickups>().0.push((
            proto::PlayerSlot(0),
            tile,
            0,
            from,
        ));
        app.update();
        assert!(app.world().get::<GridPos>(env).is_none(), "env despawned");
        assert!(
            app.world().resource::<WalkableMap>().is_walkable_z(0, tile),
            "tile freed"
        );
        let inv = app.world().get::<Inventory>(player).unwrap();
        assert!(
            inv.slots
                .iter()
                .any(|(r, c)| r == "campfire-kit" && *c >= 1),
            "kit refunded"
        );
    }

    #[test]
    fn non_owner_pickup_is_rejected() {
        let (mut app, _rx, _tx, _roster) = harness(0x556);
        let tile = Tile::new(9, 9);
        let from = Tile::new(9, 10);
        let env = spawn_owned_campfire(&mut app, tile, 0);
        app.world_mut().resource_mut::<PendingPickups>().0.push((
            proto::PlayerSlot(1),
            tile,
            0,
            from,
        ));
        app.update();
        assert!(
            app.world().get::<GridPos>(env).is_some(),
            "env survives non-owner pickup"
        );
        assert!(
            !app.world().resource::<WalkableMap>().is_walkable_z(0, tile),
            "tile stays blocked"
        );
    }

    #[test]
    fn placement_persists_and_pickup_clears_snapshot() {
        let (mut app, _rx, _tx, _roster) = harness(0x557);
        let (ptx, mut prx) = mpsc::unbounded_channel::<Vec<PersistedEnvObject>>();
        {
            let w = app.world_mut();
            w.resource_mut::<EnvPersistSink>().0 = Some(ptx);
            w.resource_mut::<KindRegistry>().register_item("test-kit");
            w.resource_mut::<KindRegistry>().register_env("test-env");
            let mut dep = Deployables::default();
            dep.0.insert(
                "test-kit".to_string(),
                DeployableSpec {
                    env_ref: "test-env".to_string(),
                    opts: EnvOpts {
                        blocker: true,
                        ..Default::default()
                    },
                },
            );
            w.insert_resource(dep);
        }
        let tile = Tile::new(5, 5);
        let from = Tile::new(5, 6);
        app.world_mut().spawn((
            EntityKind(PLAYER_KIND),
            GridPos::at(from),
            MoveTarget::default(),
            Inventory {
                slots: vec![("test-kit".to_string(), 1)],
            },
            PlayerSlotTag(proto::PlayerSlot(0)),
        ));

        app.world_mut().resource_mut::<PendingPlacements>().0.push((
            proto::PlayerSlot(0),
            "test-kit".to_string(),
            tile,
            0,
            0,
        ));
        app.update();
        let placed = prx.try_recv().expect("placement snapshot sent");
        assert_eq!(placed.len(), 1);
        assert_eq!(
            (placed[0].x, placed[0].y, placed[0].env_ref.as_str()),
            (5, 5, "test-env")
        );

        app.world_mut().resource_mut::<PendingPickups>().0.push((
            proto::PlayerSlot(0),
            tile,
            0,
            from,
        ));
        app.update();
        let cleared = prx.try_recv().expect("pickup snapshot sent");
        assert!(cleared.is_empty(), "log cleared after pickup");
    }

    #[test]
    fn env_hazard_applies_burn_status_to_player() {
        let (mut app, _rx, _tx, _roster) = harness(0x333);
        let t = Tile::new(12, 12);
        let player = app
            .world_mut()
            .spawn((
                EntityKind(PLAYER_KIND),
                GridPos::at(t),
                MoveTarget::default(),
                MoveSpeed { ticks_per_tile: 4 },
                Health {
                    hp: 100,
                    max_hp: 100,
                },
                StatusEffects::default(),
                PlayerSlotTag(proto::PlayerSlot(0)),
            ))
            .id();
        app.world_mut().spawn((
            HazardZone {
                magnitude: 8,
                period_ticks: 2,
            },
            GridPos::at(t),
        ));
        for _ in 0..6 {
            app.update();
        }
        let hp = app.world().get::<Health>(player).unwrap().hp;
        assert_eq!(hp, 100 - 8 * 2, "burn status ticked 8 twice");
        let status = app.world().get::<StatusEffects>(player).unwrap();
        assert!(
            status.0.iter().any(|e| e.kind == proto::StatusKind::Burn),
            "Burn status present while standing on hazard"
        );
    }

    #[test]
    fn env_heal_aura_heals_adjacent_player() {
        let (mut app, _rx, _tx, _roster) = harness(0x222);
        let center = Tile::new(10, 10);
        let adj = Tile::new(11, 10); // Chebyshev distance 1 from center.
        let player = app
            .world_mut()
            .spawn((
                EntityKind(PLAYER_KIND),
                GridPos::at(adj),
                MoveTarget::default(),
                MoveSpeed { ticks_per_tile: 4 },
                Health {
                    hp: 10,
                    max_hp: 100,
                },
                StatusEffects::default(),
                PlayerSlotTag(proto::PlayerSlot(0)),
            ))
            .id();
        app.world_mut().spawn((
            HealAura {
                range: 2,
                magnitude: 3,
                period_ticks: 1,
            },
            GridPos::at(center),
        ));
        // Fewer ticks than REGEN_PERIOD_TICKS (40) so regen_players never fires —
        // any healing is purely the aura.
        for _ in 0..5 {
            app.update();
        }
        let hp = app.world().get::<Health>(player).unwrap().hp;
        assert_eq!(hp, 10 + 3 * 5, "aura healed 3/tick for 5 ticks");
    }

    #[test]
    fn env_mana_aura_restores_adjacent_player() {
        let (mut app, _rx, _tx, _roster) = harness(0x333);
        let center = Tile::new(10, 10);
        let adj = Tile::new(11, 10); // Chebyshev distance 1 from center.
        let player = app
            .world_mut()
            .spawn((
                EntityKind(PLAYER_KIND),
                GridPos::at(adj),
                MoveTarget::default(),
                MoveSpeed { ticks_per_tile: 4 },
                Mana { mp: 5, max_mp: 100 },
                PlayerSlotTag(proto::PlayerSlot(0)),
            ))
            .id();
        app.world_mut().spawn((
            ManaAura {
                range: 2,
                magnitude: 2,
                period_ticks: 1,
            },
            GridPos::at(center),
        ));
        for _ in 0..5 {
            app.update();
        }
        let mp = app.world().get::<Mana>(player).unwrap().mp;
        assert_eq!(mp, 5 + 2 * 5, "aura restored 2 MP/tick for 5 ticks");
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

    /// Place a joined player at a tile on dungeon floor `z` (None = surface), and
    /// settle the float body there so `advance_float` keeps it put for the test.
    fn place_player(app: &mut App, e: Entity, tile: Tile, z: Option<i32>) {
        {
            let mut fm = app.world_mut().get_mut::<FloatMove>(e).unwrap();
            fm.body = crate::float_move::FloatBody::at(tile.x as f32, tile.y as f32);
            fm.intent_x = 0;
            fm.intent_y = 0;
        }
        app.world_mut().get_mut::<GridPos>(e).unwrap().tile = tile;
        match z {
            Some(z) => {
                app.world_mut().entity_mut(e).insert(Floor(z));
            }
            None => {
                app.world_mut().entity_mut(e).remove::<Floor>();
            }
        }
    }

    #[test]
    fn pvp_melee_damages_player_on_dungeon_floor() {
        let (mut app, _rx, input_tx, roster) = harness(71);
        let a = join(&roster, "alice");
        let b = join(&roster, "bob");
        app.update();
        let ea = player_for_slot(&mut app, a);
        let eb = player_for_slot(&mut app, b);
        place_player(&mut app, ea, Tile::new(5, 5), Some(-1));
        place_player(&mut app, eb, Tile::new(6, 5), Some(-1));
        app.update();

        let hp0 = app.world().get::<Health>(eb).unwrap().hp;
        input_tx
            .send((
                a,
                Input::Action {
                    id: proto::ACTION_ATTACK,
                    target: Some(proto::EntityId(eb.index_u32())),
                },
            ))
            .unwrap();
        for _ in 0..4 {
            app.update();
        }
        let hp1 = app.world().get::<Health>(eb).unwrap().hp;
        assert!(
            hp1 < hp0,
            "PvP melee did not damage target (hp {hp0}->{hp1})"
        );
    }

    #[test]
    fn pvp_blocked_on_surface() {
        let (mut app, _rx, input_tx, roster) = harness(72);
        let a = join(&roster, "carol");
        let b = join(&roster, "dave");
        app.update();
        let ea = player_for_slot(&mut app, a);
        let eb = player_for_slot(&mut app, b);
        place_player(&mut app, ea, Tile::new(5, 5), None);
        place_player(&mut app, eb, Tile::new(6, 5), None);
        app.update();

        let hp0 = app.world().get::<Health>(eb).unwrap().hp;
        input_tx
            .send((
                a,
                Input::Action {
                    id: proto::ACTION_ATTACK,
                    target: Some(proto::EntityId(eb.index_u32())),
                },
            ))
            .unwrap();
        for _ in 0..4 {
            app.update();
        }
        let hp1 = app.world().get::<Health>(eb).unwrap().hp;
        assert_eq!(hp1, hp0, "PvP wrongly allowed on the peaceful surface");
    }

    fn spawn_bow_target(app: &mut App, kind: u16, tile: Tile) -> Entity {
        let m = app
            .world_mut()
            .spawn((
                EntityKind(kind),
                GridPos::at(tile),
                MoveTarget::default(),
                MoveSpeed::default(),
                Health { hp: 50, max_hp: 50 },
            ))
            .id();
        app.update();
        m
    }

    fn run_shoot(
        app: &mut App,
        input_tx: &mpsc::UnboundedSender<(proto::PlayerSlot, Input)>,
        slot: proto::PlayerSlot,
        mob: Entity,
    ) {
        input_tx
            .send((
                slot,
                Input::Action {
                    id: proto::ACTION_SHOOT,
                    target: Some(proto::EntityId(mob.index_u32())),
                },
            ))
            .unwrap();
        for _ in 0..4 {
            app.update();
        }
    }

    fn drain_shot(rx: &mut mpsc::UnboundedReceiver<ServerEvent>) -> (bool, bool) {
        let (mut proj, mut combat) = (false, false);
        while let Ok(evt) = rx.try_recv() {
            if let ServerEvent::Ephemeral { kind, .. } = evt {
                proj |= kind == proto::EPHEMERAL_PROJECTILE;
                combat |= kind == proto::EPHEMERAL_COMBAT;
            }
        }
        (proj, combat)
    }

    #[test]
    fn bow_hits_target_with_clear_los() {
        let (mut app, mut rx, input_tx, roster) = harness(11);
        let slot = join(&roster, "archer");
        let dummy = app
            .world()
            .resource::<KindRegistry>()
            .kind_of("training-dummy")
            .unwrap();
        let mob = spawn_bow_target(&mut app, dummy, Tile::new(8, 13));
        run_shoot(&mut app, &input_tx, slot, mob);
        let (proj, combat) = drain_shot(&mut rx);
        assert!(proj, "no projectile emitted");
        assert!(combat, "clear LoS shot did not hit");
    }

    #[test]
    fn bow_blocked_by_wall_misses() {
        let (mut app, mut rx, input_tx, roster) = harness(11);
        let slot = join(&roster, "archer");
        let dummy = app
            .world()
            .resource::<KindRegistry>()
            .kind_of("training-dummy")
            .unwrap();
        let mob = spawn_bow_target(&mut app, dummy, Tile::new(8, 13));
        app.world_mut()
            .resource_mut::<WalkableMap>()
            .set_blocked(Tile::new(8, 10), true);
        run_shoot(&mut app, &input_tx, slot, mob);
        let (proj, combat) = drain_shot(&mut rx);
        assert!(proj, "no projectile emitted");
        assert!(!combat, "wall did not block the shot");
    }

    fn hostile_spec(kind: u16, origin: Tile) -> NpcSpec {
        NpcSpec {
            kind,
            origin,
            floor: 0,
            ticks_per_tile: 1,
            max_hp: 30,
            level: 1,
            defense: 0,
            wander: None,
            roam: None,
            aggro: Some(AggroSpec {
                range: 8,
                damage: 60,
                period_ticks: 1,
                poison: None,
            }),
            loot: None,
            respawn_ticks: 4,
            float_steer: false,
            move_profile: None,
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
                let ev: proto::CombatEvent = proto::decode_inner(&payload).unwrap();
                if ev.target_ref.as_deref() == Some("player") {
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
                let ev: proto::CombatEvent = proto::decode_inner(&payload).unwrap();
                if ev.target_ref.as_deref() == Some("player") {
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
                let ev: proto::StatsEvent = proto::decode_inner(&payload).unwrap();
                if ev.kills == 1 {
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
                let ev: proto::StatsEvent = proto::decode_inner(&payload).unwrap();
                if ev.level == 2 {
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

        let mut restored: Option<proto::InventorySync> = None;
        while let Ok(evt) = rx.try_recv() {
            if let ServerEvent::Ephemeral { kind, to, payload } = evt
                && kind == proto::EPHEMERAL_INVENTORY
            {
                assert_eq!(to, slot2);
                restored = Some(proto::decode_inner(&payload).unwrap());
            }
        }
        let inv = restored.expect("no inventory restore on rejoin");
        let potion = inv
            .items
            .iter()
            .find(|i| i.item_ref == "potion")
            .expect("potion in inventory");
        assert_eq!(potion.count, 3);
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

        let mut inventory_payload: Option<proto::InventorySync> = None;
        while let Ok(evt) = rx.try_recv() {
            if let ServerEvent::Ephemeral { kind, to, payload } = evt
                && kind == proto::EPHEMERAL_INVENTORY
            {
                assert_eq!(to, slot);
                inventory_payload = Some(proto::decode_inner(&payload).unwrap());
            }
        }
        let inv = inventory_payload.expect("no inventory sync");
        let potion = inv
            .items
            .iter()
            .find(|i| i.item_ref == "potion")
            .expect("potion in inventory");
        assert_eq!(potion.count, 2);
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
