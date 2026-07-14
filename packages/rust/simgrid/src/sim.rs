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
use crate::pets::{PetBank, PetRoster, PetSnapshot};
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
    /// Kind to spawn for a dead player's lootable corpse (game-registered, since
    /// the sim is content-agnostic). `None` disables corpses — death just respawns.
    pub corpse_kind: Option<u16>,
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
            corpse_kind: None,
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
pub struct PendingDrops(Vec<(Tile, ItemStack)>);

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

/// Corpse loot-panel ops this tick: `(looter, corpse, slot)` where `slot` is None
/// for an OPEN (just send contents) and `Some(idx)` to TAKE that slot. Drained by
/// `handle_corpse_ops`.
#[derive(Resource, Default)]
pub struct PendingCorpseOps(Vec<(proto::PlayerSlot, proto::EntityId, Option<u32>)>);

/// A board/leave request this tick. Drained by the ARPG `apply_pilot_ops` system —
/// the pilot logic needs the arpg ship-footprint table, so it lives in the game
/// crate, not here. `Enter` carries the target ship eid; `Exit` leaves the current.
#[derive(Clone, Copy, Debug)]
pub enum PilotOp {
    Enter(proto::EntityId),
    Exit,
    /// Launch the flying ship off-planet into the solo space instance.
    Launch,
    /// Re-materialise the ship + pilot at the launch tile, back into flight.
    Return,
}

#[derive(Resource, Default)]
pub struct PendingPilotOps(pub Vec<(proto::PlayerSlot, PilotOp)>);

/// Slots that requested a debug pet-battle simulation this frame. Drained by the
/// game-server `apply_pet_battles` system (which owns the npcdb species data).
#[derive(Resource, Default)]
pub struct PendingPetBattles(pub Vec<proto::PlayerSlot>);

/// Player actions committed for an in-progress interactive pet battle this frame:
/// `(slot, action, arg)` where `action` is a `proto::PET_ACT_*` code. Drained by the
/// game-server `apply_pet_turns` system alongside the live `BattleState`.
#[derive(Resource, Default)]
pub struct PendingPetTurns(pub Vec<(proto::PlayerSlot, u8, u8)>);

/// Slots that challenged a world trainer NPC this frame: `(slot, npc)`. Drained
/// by the game-server system that validates range and starts the pet duel.
#[derive(Resource, Default)]
pub struct PendingNpcChallenges(pub Vec<(proto::PlayerSlot, proto::EntityId)>);

/// Duel challenge/response inputs queued this frame. Combined into one resource
/// (rather than two) so `DeployQueues` stays under Bevy's 16-param ceiling.
#[derive(Resource, Default)]
pub struct PendingDuelOps {
    pub challenges: Vec<(proto::PlayerSlot, proto::PlayerSlot)>,
    pub responses: Vec<(proto::PlayerSlot, bool)>,
}

/// Deploy/reclaim queues drained in `drain_inputs` — grouped into one
/// `SystemParam` so the input system stays under Bevy's 16-param ceiling.
#[derive(bevy::ecs::system::SystemParam)]
pub struct DeployQueues<'w> {
    placements: ResMut<'w, PendingPlacements>,
    pickups: ResMut<'w, PendingPickups>,
    fells: ResMut<'w, PendingFells>,
    spells: ResMut<'w, crate::spells::PendingSpells>,
    corpse_ops: ResMut<'w, PendingCorpseOps>,
    pilot_ops: ResMut<'w, PendingPilotOps>,
    pet_battles: ResMut<'w, PendingPetBattles>,
    pet_turns: ResMut<'w, PendingPetTurns>,
    npc_challenges: ResMut<'w, PendingNpcChallenges>,
    duel_ops: ResMut<'w, PendingDuelOps>,
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
    pub slots: Vec<ItemStack>,
    pub hp: i32,
    /// Equipped gear as detached stacks (id + ref preserved), re-materialised into item
    /// entities on rejoin.
    pub weapon: Option<ItemStack>,
    pub armor: Option<ItemStack>,
    pub level: i32,
    pub xp: i32,
    pub kills: u32,
    /// The player disconnected INTO a solo client-side instance (the 3D space scene),
    /// not a real logout — on their next join the game layer should re-materialise them
    /// mid-activity (e.g. drop their ship from orbit + auto-board) instead of a plain
    /// on-foot spawn. Set by the game layer via [`InSpaceFlag`]; consumed on respawn.
    pub in_space: bool,
    pub mp: i32,
    pub ep: i32,
    pub sp: i32,
    /// Last known tile + facing. `None` (or a tile no longer walkable on `floor`)
    /// falls back to the configured spawn point.
    pub pos: Option<(Tile, proto::Facing)>,
    /// Floor the player was on; `None` = topside (z 0, no `Floor` component).
    pub floor: Option<i32>,
    /// Detached pet roster in slot order; re-materialised into pet entities on rejoin.
    pub pets: Vec<PetSnapshot>,
    /// Active pet index into `pets`.
    pub pet_active: Option<usize>,
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
            in_space: false,
            mp: PLAYER_MAX_MP,
            ep: PLAYER_MAX_ENERGY,
            sp: PLAYER_MAX_STAMINA,
            pos: None,
            floor: None,
            pets: Vec::new(),
            pet_active: None,
        }
    }
}

/// Game-layer marker: this player left for a solo client-side instance, so the next
/// disconnect-save records `in_space` (a re-materialise on return) rather than a logout.
#[derive(Component, Default)]
pub struct InSpaceFlag;

/// Added by the spawn system to a player whose save had `in_space` set — the game layer
/// reacts (e.g. spawns + boards their ship) then removes it. Generic so simgrid stays
/// agnostic about ships.
#[derive(Component, Default)]
pub struct ReturnedFromInstance;

#[derive(Resource, Default)]
pub struct PlayerStore {
    by_username: HashMap<String, SavedPlayer>,
}

impl PlayerStore {
    /// Pre-fill a player's save before their slot activates (the admit-time DB load).
    /// A no-op when an entry already exists — live in-memory state is always fresher
    /// than whatever the durable store returned.
    pub fn seed(&mut self, username: impl Into<String>, saved: SavedPlayer) {
        self.by_username.entry(username.into()).or_insert(saved);
    }

    pub fn contains(&self, username: &str) -> bool {
        self.by_username.contains_key(username)
    }
}

/// Optional sink the game wires to a durable store. Every save harvest (disconnect +
/// periodic autosave) sends the username + detached snapshot; absent in tests /
/// no-DB runs. Bounded: a full channel drops the send — the next autosave retries.
#[derive(Resource, Default)]
pub struct PlayerPersistSink(pub Option<mpsc::Sender<(String, SavedPlayer)>>);

#[derive(Resource, Default, Clone)]
pub struct ConsumableEffects(pub HashMap<String, i32>);

#[derive(Clone, Copy, Default)]
pub struct EquipBonus {
    pub attack: i32,
    pub defense: i32,
}

#[derive(Resource, Default, Clone)]
pub struct EquipmentEffects(pub HashMap<String, EquipBonus>);

/// Worn gear: handles to the equipped item entities (not in the owner's [`Inventory`]
/// while worn, no `GridPos`). `None` = slot empty. The item entity keeps its instance id
/// plus (later) durability/affix components while equipped. The per-slot bonus is cached so
/// the combat hot path reads it without touching the item entities.
#[derive(Component, Clone, Default)]
pub struct Equipped {
    pub weapon: Option<Entity>,
    pub armor: Option<Entity>,
    pub weapon_bonus: EquipBonus,
    pub armor_bonus: EquipBonus,
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
pub const PLAYER_MAX_ENERGY: i32 = 100;
pub const ENERGY_REGEN_AMOUNT: i32 = 4;
pub const PLAYER_MAX_STAMINA: i32 = 100;
pub const STAMINA_REGEN_AMOUNT: i32 = 6;

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

/// Marker: this entity ignores all damage — player attacks and hazard/status
/// ticks skip it outright. For non-combat NPCs (e.g. duel trainers) that must
/// persist for server lifetime.
#[derive(Component, Clone, Copy)]
pub struct Invulnerable;

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

#[derive(Component, Clone, Copy)]
pub struct Energy {
    pub ep: i32,
    pub max_ep: i32,
}

#[derive(Component, Clone, Copy)]
pub struct Stamina {
    pub sp: i32,
    pub max_sp: i32,
}

#[derive(Resource, Default)]
pub struct SpellCooldowns(pub HashMap<(u16, String), u32>);

/// A unique instance identity for an item stack. A ULID — globally unique without a
/// counter and lexicographically sortable, with the mint timestamp embedded (the first
/// 48 bits are the creation epoch-ms), so every item carries its own birth time for
/// economy auditing. Minted only on TRUE creation (starting kit, loot, shop buy, coin
/// grant); preserved across every move (drop → ground → pickup, equip, trade, corpse
/// loot); a fungible-stack split mints a fresh id for the detached portion.
pub fn mint_item_id() -> String {
    ulid::Ulid::new().to_string()
}

/// One inventory stack: a stable instance `id`, the item `item_ref`, and how many of it.
/// Fungible refs (no per-item state yet) merge by ref, so the `id` tracks the STACK
/// lineage; a `count == 1` unique item is a 1:1 stable identity.
#[derive(Clone, Debug, PartialEq, serde::Serialize, serde::Deserialize)]
pub struct ItemStack {
    pub id: String,
    pub item_ref: String,
    pub count: u32,
}

impl ItemStack {
    /// A freshly-minted stack (new instance id + birth timestamp).
    pub fn mint(item_ref: &str, count: u32) -> Self {
        Self {
            id: mint_item_id(),
            item_ref: item_ref.to_string(),
            count,
        }
    }
}

// --- Item instances are ECS entities ---------------------------------------------
// Every item is its own entity carrying [`Item`] + [`ItemId`] + [`ItemRef`] +
// [`StackCount`] (and, later, `Durability`/`Affix`/`EnchantTimer` as plain components).
// Location is expressed by which components it ALSO has:
//   - held    : referenced by an owner's [`Inventory::slots`] (no `GridPos`, off-grid →
//               never streamed, so inventories don't leak into the spatial snapshot)
//   - ground  : has `GridPos` + [`GroundItem`] (streams + renders + is pickup-able)
//   - equipped: referenced by an [`Equipped`] slot
// All inventory mutation goes through [`ItemBank`], which spawns/merges/despawns the
// backing entities. [`ItemStack`] is the detached DTO form for the wire + persistence.

/// Marker: this entity is an item instance.
#[derive(Component)]
pub struct Item;

/// Stable ULID instance identity (mint timestamp embedded). On an item entity.
#[derive(Component, Clone)]
pub struct ItemId(pub String);

/// The item definition ref (`"potion"`, `"iron-sword"`). On an item entity.
#[derive(Component, Clone)]
pub struct ItemRef(pub String);

/// How many fungible units this stack holds (`1` for a unique item). On an item entity.
#[derive(Component, Clone, Copy)]
pub struct StackCount(pub u32);

/// Spawn a HELD item entity (no location component) from a stack DTO. `EntityKind` is
/// attached only when the ref maps to a registered kind (needed to render once dropped to
/// the ground); a held item doesn't otherwise need it, so this always produces an entity.
/// Callers add `GridPos` + [`GroundItem`] to drop it, or push it into an [`Inventory`].
pub fn spawn_item(commands: &mut Commands, registry: &KindRegistry, stack: ItemStack) -> Entity {
    let mut e = commands.spawn((
        Item,
        ItemId(stack.id),
        ItemRef(stack.item_ref.clone()),
        StackCount(stack.count),
    ));
    if let Some(kind) = registry.kind_of(&stack.item_ref) {
        e.insert(EntityKind(kind));
    }
    e.id()
}

#[derive(Component, Clone, Default)]
pub struct Inventory {
    /// Ordered handles to the owner's item entities. Order is authoritative + persisted
    /// so client reorders survive refreshes. Mutate via [`ItemBank`].
    pub slots: Vec<Entity>,
}

impl Inventory {
    /// Move the slot at `from` to `to`, shifting the rest (reorders entity handles only —
    /// no entity access needed).
    pub fn reorder(&mut self, from: usize, to: usize) {
        let n = self.slots.len();
        if from >= n || to >= n || from == to {
            return;
        }
        let item = self.slots.remove(from);
        self.slots.insert(to, item);
    }
}

/// Item entities spawned THIS frame whose components aren't queryable yet (Bevy applies
/// `Commands` spawns at the next sync point). [`ItemBank`] reads + mutates this overlay so
/// a spawn → read / spawn → re-stack within one frame stays consistent; a `StackCount`
/// change on an overlay entry is also re-issued to the (deferred) real entity so it
/// converges. Cleared each frame by [`clear_pending_items`].
#[derive(Resource, Default)]
pub struct PendingItems(pub HashMap<Entity, ItemStack>);

/// Drop the per-frame just-spawned-item overlay; by the next frame those entities are real
/// and queryable.
fn clear_pending_items(mut pending: ResMut<PendingItems>) {
    pending.0.clear();
}

/// The one chokepoint for item-instance mutation: bundles `Commands` + the item-entity
/// query + the kind registry + the just-spawned overlay so inventory ops can spawn (mint),
/// merge, split, and despawn (burn) the backing entities and read them back the same frame.
#[derive(bevy::ecs::system::SystemParam)]
pub struct ItemBank<'w, 's> {
    pub commands: Commands<'w, 's>,
    registry: Res<'w, KindRegistry>,
    items: Query<'w, 's, (&'static ItemRef, &'static mut StackCount, &'static ItemId)>,
    pending: ResMut<'w, PendingItems>,
}

impl ItemBank<'_, '_> {
    /// (ref, count) for an item entity — the real component if queryable, else the
    /// just-spawned overlay.
    fn read(&self, e: Entity) -> Option<(String, u32)> {
        if let Ok((r, c, _)) = self.items.get(e) {
            return Some((r.0.clone(), c.0));
        }
        self.pending
            .0
            .get(&e)
            .map(|s| (s.item_ref.clone(), s.count))
    }

    /// Full stack DTO for an item entity (query or overlay).
    fn read_stack(&self, e: Entity) -> Option<ItemStack> {
        if let Ok((r, c, id)) = self.items.get(e) {
            return Some(ItemStack {
                id: id.0.clone(),
                item_ref: r.0.clone(),
                count: c.0,
            });
        }
        self.pending.0.get(&e).cloned()
    }

    /// Set an item entity's stack count (real component, or overlay + a re-issued
    /// `StackCount` so the deferred real entity converges).
    fn set_count(&mut self, e: Entity, n: u32) {
        if let Ok((_, mut c, _)) = self.items.get_mut(e) {
            c.0 = n;
        } else if let Some(s) = self.pending.0.get_mut(&e) {
            s.count = n;
            self.commands.entity(e).try_insert(StackCount(n));
        }
    }

    /// Spawn a held item entity from a DTO, recording it in the per-frame overlay so it
    /// reads back this frame. `EntityKind` is attached only for a registered ref (held
    /// items like coins don't need a render kind), so this always yields an entity.
    fn spawn_stack(&mut self, stack: ItemStack) -> Option<Entity> {
        let e = spawn_item(&mut self.commands, &self.registry, stack.clone());
        self.pending.0.insert(e, stack);
        Some(e)
    }

    fn forget(&mut self, e: Entity) {
        self.pending.0.remove(&e);
        self.commands.entity(e).despawn();
    }

    /// Add `count` of a ref, MINTING a fresh stack (id + birth timestamp) when no matching
    /// ref is already held. True creation: loot, shop buy, coin grant.
    pub fn add(&mut self, inv: &mut Inventory, item_ref: &str, count: u32) {
        self.add_stack(inv, ItemStack::mint(item_ref, count));
    }

    /// Merge a stack DTO in, preserving its id when it lands in a new ref (a move); a merge
    /// into a held ref folds the count under the existing stack's id.
    pub fn add_stack(&mut self, inv: &mut Inventory, stack: ItemStack) {
        if stack.count == 0 {
            return;
        }
        for i in 0..inv.slots.len() {
            let e = inv.slots[i];
            if let Some((r, c)) = self.read(e)
                && r == stack.item_ref
            {
                self.set_count(e, c.saturating_add(stack.count));
                return;
            }
        }
        if let Some(e) = self.spawn_stack(stack) {
            inv.slots.push(e);
        }
    }

    /// Absorb an EXISTING item entity (e.g. one just picked up off the ground) into the
    /// inventory, preserving its instance id: merge into a held stack of the same ref (and
    /// despawn the absorbed entity), else strip its ground components and adopt it as a
    /// held slot.
    pub fn absorb(&mut self, inv: &mut Inventory, item_entity: Entity) {
        let Some((item_ref, count)) = self.read(item_entity) else {
            return;
        };
        for i in 0..inv.slots.len() {
            let e = inv.slots[i];
            if let Some((r, c)) = self.read(e)
                && r == item_ref
            {
                self.set_count(e, c.saturating_add(count));
                self.forget(item_entity);
                return;
            }
        }
        self.commands
            .entity(item_entity)
            .remove::<GroundItem>()
            .remove::<GridPos>()
            .remove::<Floor>()
            .remove::<MoveTarget>();
        inv.slots.push(item_entity);
    }

    /// Remove up to `count` of `item_ref` (true consumption — burns the stack entity when
    /// it empties). Returns how many were actually removed.
    pub fn remove(&mut self, inv: &mut Inventory, item_ref: &str, count: u32) -> u32 {
        let mut hit = None;
        for (i, &e) in inv.slots.iter().enumerate() {
            if let Some((r, c)) = self.read(e)
                && r == item_ref
            {
                hit = Some((i, e, c));
                break;
            }
        }
        let Some((i, e, avail)) = hit else {
            return 0;
        };
        let taken = avail.min(count);
        let remaining = avail - taken;
        if remaining == 0 {
            inv.slots.remove(i);
            self.forget(e);
        } else {
            self.set_count(e, remaining);
        }
        taken
    }

    /// Detach up to `count` of `item_ref` as a standalone item entity (no location) for
    /// relocation — a drop, trade move, or equip. A whole-stack take hands back the
    /// EXISTING entity (id preserved); a partial take mints a fresh split entity and
    /// leaves the remainder. Returns the detached entity, or `None` if the ref isn't held.
    pub fn detach(&mut self, inv: &mut Inventory, item_ref: &str, count: u32) -> Option<Entity> {
        let mut hit = None;
        for (i, &e) in inv.slots.iter().enumerate() {
            if let Some((r, c)) = self.read(e)
                && r == item_ref
            {
                hit = Some((i, e, c));
                break;
            }
        }
        let (idx, e, avail) = hit?;
        let take = avail.min(count);
        if take == 0 {
            return None;
        }
        if take == avail {
            inv.slots.remove(idx);
            Some(e)
        } else {
            self.set_count(e, avail - take);
            self.spawn_stack(ItemStack::mint(item_ref, take))
        }
    }

    /// Despawn (burn) an item entity outright — for a consumed/destroyed item that isn't
    /// going anywhere.
    pub fn burn(&mut self, entity: Entity) {
        self.forget(entity);
    }

    /// Total count of a ref across the inventory's stacks.
    pub fn count(&self, inv: &Inventory, item_ref: &str) -> u32 {
        inv.slots
            .iter()
            .filter_map(|&e| self.read(e))
            .filter(|(r, _)| r == item_ref)
            .map(|(_, c)| c)
            .sum()
    }

    /// The detached DTO form of an inventory, in slot order — for the wire + persistence.
    pub fn snapshot(&self, inv: &Inventory) -> Vec<ItemStack> {
        inv.slots
            .iter()
            .filter_map(|&e| self.read_stack(e))
            .collect()
    }

    /// Read one item entity's stack DTO (id/ref/count), if it's a live item.
    pub fn stack_of(&self, entity: Entity) -> Option<ItemStack> {
        self.read_stack(entity)
    }
}

/// Marker: this item entity is lying on the ground (paired with `GridPos`, so it streams,
/// renders, and can be picked up). Removed when the item is absorbed into an inventory.
#[derive(Component)]
pub struct GroundItem;

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

type GroundItemBundle = (
    Item,
    ItemId,
    ItemRef,
    StackCount,
    EntityKind,
    GridPos,
    MoveTarget,
    GroundItem,
);

pub fn ground_item_bundle(
    registry: &KindRegistry,
    item_ref: &str,
    count: u32,
    tile: Tile,
) -> Option<GroundItemBundle> {
    ground_item_bundle_stack(registry, ItemStack::mint(item_ref, count), tile)
}

/// As [`ground_item_bundle`] but for an EXISTING instance stack — preserves its id so a
/// dropped item keeps its identity on the ground (and through a later pickup). The spawned
/// entity is a full item entity (Item/ItemId/ItemRef/StackCount) tagged on-ground.
pub fn ground_item_bundle_stack(
    registry: &KindRegistry,
    stack: ItemStack,
    tile: Tile,
) -> Option<GroundItemBundle> {
    let kind = registry.kind_of(&stack.item_ref)?;
    Some((
        Item,
        ItemId(stack.id),
        ItemRef(stack.item_ref),
        StackCount(stack.count),
        EntityKind(kind),
        GridPos::at(tile),
        MoveTarget::default(),
        GroundItem,
    ))
}

pub fn spawn_npc_from_spec(commands: &mut Commands, spec: &NpcSpec) -> Entity {
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
        PosHistory::at(spec.origin),
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
    e.id()
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

/// A dead player's lootable corpse. Holds the dropped inventory (an `Inventory`
/// component) and carries `PlacedBy { owner }` so the client labels it
/// "Graveyard of <name>". Walkable (no `Blocker`) — loot it from an adjacent
/// tile via `ACTION_LOOT`, which transfers everything and despawns it.
#[derive(Component)]
pub struct Corpse;

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

/// Links a player to the ship entity it is piloting. While present, the player rides
/// the ship (position bound server-side) and its snapshot delta carries the ship eid
/// in `piloting`, so every client hides the body and floats the nameplate over the
/// ship — that is how other players see who is flying it. Removed on exit. The
/// counterpart `Piloted` (game.rs) marks the ship as occupied.
#[derive(Component, Clone, Copy)]
pub struct Piloting(pub Entity);

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
    mut victims: Query<
        (
            &mut Health,
            &GridPos,
            Option<&Floor>,
            Option<&mut StatusEffects>,
        ),
        Without<Invulnerable>,
    >,
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
        .insert_resource(PendingItems::default())
        .insert_resource(crate::pets::PendingPets::default())
        .insert_resource(PendingPetBattles::default())
        .insert_resource(PendingPetTurns::default())
        .insert_resource(PendingNpcChallenges::default())
        .insert_resource(PendingDuelOps::default())
        .insert_resource(PendingDrops::default())
        .insert_resource(Deployables::default())
        .insert_resource(PendingPlacements::default())
        .insert_resource(PendingPickups::default())
        .insert_resource(PendingFells::default())
        .insert_resource(PendingCorpseOps::default())
        .insert_resource(PendingPilotOps::default())
        .insert_resource(PersistedEnvLog::default())
        .insert_resource(EnvPersistSink::default())
        .insert_resource(ShopStock::default())
        .insert_resource(ItemPrices::default())
        .insert_resource(Tables::default())
        .insert_resource(PlayerStore::default())
        .insert_resource(PlayerPersistSink::default())
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
                handle_corpse_ops,
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
                record_pos_history,
                stair_system,
                env_hazard_burn,
                env_heal_aura,
                env_mana_aura,
                tick_status_effects,
                handle_death_and_respawn,
                regen_players,
            )
                .chain()
                .in_set(SimSet::Movement),
        )
        .add_systems(
            Update,
            (autosave_players, emit_snapshot)
                .chain()
                .in_set(SimSet::Snapshot),
        );
    // Clear the per-frame just-spawned-item overlay after everything has run + the
    // commands that spawned them flush, so next frame those entities are real.
    app.add_systems(bevy::prelude::Last, clear_pending_items);
    app.add_systems(bevy::prelude::Last, crate::pets::clear_pending_pets);
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
    registry: Res<KindRegistry>,
    map: Res<WalkableMap>,
    persist: Res<PlayerPersistSink>,
    q_saved: Query<SavedQuery>,
    item_q: Query<(&ItemRef, &StackCount, &ItemId)>,
    mut pet_bank: PetBank,
    mut commands: Commands,
) {
    // Read one item entity into its detached stack DTO (for persistence on save).
    let dto = |e: Entity| -> Option<ItemStack> {
        item_q.get(e).ok().map(|(r, c, id)| ItemStack {
            id: id.0.clone(),
            item_ref: r.0.clone(),
            count: c.0,
        })
    };
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
        // Returning from a solo instance (the 3D space scene) → the game layer should
        // re-materialise them in-activity. Consume the one-shot flag now.
        let was_in_space = saved.as_ref().map(|s| s.in_space).unwrap_or(false);
        if was_in_space && let Some(s) = store.by_username.get_mut(username) {
            s.in_space = false;
        }
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
        let mp = saved
            .as_ref()
            .map(|s| s.mp.clamp(0, PLAYER_MAX_MP))
            .unwrap_or(PLAYER_MAX_MP);
        let ep = saved
            .as_ref()
            .map(|s| s.ep.clamp(0, PLAYER_MAX_ENERGY))
            .unwrap_or(PLAYER_MAX_ENERGY);
        let sp = saved
            .as_ref()
            .map(|s| s.sp.clamp(0, PLAYER_MAX_STAMINA))
            .unwrap_or(PLAYER_MAX_STAMINA);
        let saved_floor = saved.as_ref().and_then(|s| s.floor);
        let (spawn_tile, spawn_facing, spawn_floor) = saved
            .as_ref()
            .and_then(|s| s.pos)
            .filter(|(tile, _)| map.is_walkable_z(saved_floor.unwrap_or(0), *tile))
            .map(|(tile, facing)| (tile, facing, saved_floor))
            .unwrap_or((config.spawn, proto::Facing::Down, None));
        let saved_pets = saved.as_ref().map(|s| s.pets.clone()).unwrap_or_default();
        let pet_active = saved.as_ref().and_then(|s| s.pet_active);
        // Restore the saved instance stacks (ids + birth timestamps intact), or mint a
        // fresh starter kit on a first join.
        let mut slots = saved.map(|s| s.slots).unwrap_or_else(|| {
            config
                .starting_inventory
                .iter()
                .map(|(r, c)| ItemStack::mint(r, *c))
                .collect()
        });
        // Top up any starter item the player is entirely missing, so essentials
        // added after a save was created (e.g. a dungeon-key) still reach
        // existing players — only granted when they hold zero of that ref, so a
        // partially-used starter stack is left alone. A topped-up stack is freshly
        // minted (new instance id).
        for (item_ref, count) in &config.starting_inventory {
            if !slots.iter().any(|s| &s.item_ref == item_ref) {
                slots.push(ItemStack::mint(item_ref, *count));
            }
        }
        if !slots.is_empty() {
            send_inventory(&bcast, *slot, &slots);
        }
        let weapon_ref = weapon.as_ref().map(|s| s.item_ref.clone());
        let armor_ref = armor.as_ref().map(|s| s.item_ref.clone());
        let weapon_bonus = weapon_ref
            .as_deref()
            .and_then(|w| equipment.0.get(w).copied())
            .unwrap_or_default();
        let armor_bonus = armor_ref
            .as_deref()
            .and_then(|a| equipment.0.get(a).copied())
            .unwrap_or_default();
        let attack = level_attack(config.player_attack, level) + weapon_bonus.attack;
        let defense = weapon_bonus.defense + armor_bonus.defense;
        if weapon_ref.is_some() {
            send_equipped(
                &bcast,
                *slot,
                "weapon",
                weapon_ref.as_deref(),
                attack,
                defense,
            );
        }
        if armor_ref.is_some() {
            send_equipped(
                &bcast,
                *slot,
                "armor",
                armor_ref.as_deref(),
                attack,
                defense,
            );
        }
        // Materialise the stacks into held item entities, plus any worn gear, then build
        // the inventory + equipped slots from the entity handles.
        let item_entities: Vec<Entity> = slots
            .into_iter()
            .map(|st| spawn_item(&mut commands, &registry, st))
            .collect();
        let inventory = Inventory {
            slots: item_entities,
        };
        let weapon = weapon.map(|st| spawn_item(&mut commands, &registry, st));
        let armor = armor.map(|st| spawn_item(&mut commands, &registry, st));
        send_stats(
            &bcast,
            *slot,
            level,
            xp,
            max_hp,
            attack,
            kills,
            mp,
            PLAYER_MAX_MP,
        );
        let mut pet_roster = PetRoster::default();
        for snap in saved_pets {
            pet_bank.add(&mut pet_roster, snap);
        }
        if !pet_roster.slots.is_empty() {
            pet_roster.active = pet_active
                .filter(|a| *a < pet_roster.slots.len())
                .or(pet_roster.active);
            let sync =
                crate::pets::to_roster_sync(&pet_bank.snapshot(&pet_roster), pet_roster.active);
            let payload = proto::encode_inner(&sync).unwrap_or_default();
            let _ = bcast.tx.send(ServerEvent::Ephemeral {
                kind: proto::EPHEMERAL_PET_ROSTER,
                to: *slot,
                payload,
            });
        }
        let entity = commands
            .spawn((
                PlayerSlotTag(*slot),
                EntityKind(config.player_kind),
                GridPos {
                    tile: spawn_tile,
                    facing: spawn_facing,
                },
                MoveSpeed {
                    ticks_per_tile: config.ticks_per_tile,
                },
                Health { hp, max_hp },
                Mana {
                    mp,
                    max_mp: PLAYER_MAX_MP,
                },
                CombatStats { attack },
                Defense(defense),
                XpState { level, xp },
                inventory,
                Equipped {
                    weapon,
                    armor,
                    weapon_bonus,
                    armor_bonus,
                },
                StatusEffects::default(),
                FloatMove::at(spawn_tile),
                IntentBuffer::default(),
            ))
            .insert(PosHistory::default())
            .insert((
                Energy {
                    ep,
                    max_ep: PLAYER_MAX_ENERGY,
                },
                Stamina {
                    sp,
                    max_sp: PLAYER_MAX_STAMINA,
                },
                pet_roster,
            ))
            .id();
        if let Some(f) = spawn_floor {
            commands.entity(entity).insert(Floor(f));
        }
        if was_in_space {
            commands.entity(entity).insert(ReturnedFromInstance);
        }
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
                && let Ok((inv, hp, equipped, xp, in_space, vitals, pos, roster)) =
                    q_saved.get(entity)
            {
                // Dematerialise the held + worn item entities into stack DTOs for the save,
                // then despawn them (they re-materialise on the next join).
                let saved = harvest_saved(
                    (inv, hp, equipped, xp, in_space, vitals, pos, roster),
                    kills,
                    &dto,
                    &pet_bank,
                );
                if let Some(tx) = &persist.0 {
                    let _ = tx.try_send((username.clone(), saved.clone()));
                }
                store.by_username.insert(username, saved);
                for &e in &inv.slots {
                    commands.entity(e).despawn();
                }
                if let Some(e) = equipped.weapon {
                    commands.entity(e).despawn();
                }
                if let Some(e) = equipped.armor {
                    commands.entity(e).despawn();
                }
                if let Some(r) = roster {
                    for &e in &r.slots {
                        commands.entity(e).despawn();
                    }
                }
            }
            commands.entity(entity).despawn();
        }
    }
}

type SavedQuery = (
    &'static Inventory,
    &'static Health,
    &'static Equipped,
    &'static XpState,
    Option<&'static InSpaceFlag>,
    (&'static Mana, &'static Energy, &'static Stamina),
    (&'static GridPos, Option<&'static Floor>),
    Option<&'static PetRoster>,
);

type SavedRow<'a> = (
    &'a Inventory,
    &'a Health,
    &'a Equipped,
    &'a XpState,
    Option<&'a InSpaceFlag>,
    (&'a Mana, &'a Energy, &'a Stamina),
    (&'a GridPos, Option<&'a Floor>),
    Option<&'a PetRoster>,
);

fn harvest_saved(
    row: SavedRow<'_>,
    kills: u32,
    dto: &dyn Fn(Entity) -> Option<ItemStack>,
    pet_bank: &PetBank,
) -> SavedPlayer {
    let (inv, hp, equipped, xp, in_space, (mana, energy, stamina), (grid, floor), roster) = row;
    SavedPlayer {
        slots: inv.slots.iter().filter_map(|&e| dto(e)).collect(),
        hp: hp.hp,
        weapon: equipped.weapon.and_then(dto),
        armor: equipped.armor.and_then(dto),
        level: xp.level,
        xp: xp.xp,
        kills,
        in_space: in_space.is_some(),
        mp: mana.mp,
        ep: energy.ep,
        sp: stamina.sp,
        pos: Some((grid.tile, grid.facing)),
        floor: floor.map(|f| f.0),
        pets: roster.map(|r| pet_bank.snapshot(r)).unwrap_or_default(),
        pet_active: roster.and_then(|r| r.active),
    }
}

pub const AUTOSAVE_PERIOD_TICKS: u32 = SIM_TICK_HZ * 60;

/// Periodic harvest of every online player into [`PlayerStore`], so a crash loses at
/// most one period of progress instead of everything since the last clean disconnect.
/// The future DB write-behind taps the store after this runs.
#[allow(clippy::too_many_arguments)]
fn autosave_players(
    clock: Res<SimClock>,
    spawned: Res<SpawnedSlots>,
    mut store: ResMut<PlayerStore>,
    kill_counts: Res<KillCounts>,
    persist: Res<PlayerPersistSink>,
    q_saved: Query<SavedQuery>,
    item_q: Query<(&ItemRef, &StackCount, &ItemId)>,
    pet_bank: PetBank,
) {
    if clock.tick == 0 || !clock.tick.is_multiple_of(AUTOSAVE_PERIOD_TICKS) {
        return;
    }
    let dto = |e: Entity| -> Option<ItemStack> {
        item_q.get(e).ok().map(|(r, c, id)| ItemStack {
            id: id.0.clone(),
            item_ref: r.0.clone(),
            count: c.0,
        })
    };
    for (slot, (entity, username)) in spawned.by_slot.iter() {
        if username.is_empty() {
            continue;
        }
        if let Ok(row) = q_saved.get(*entity) {
            let kills = kill_counts.0.get(slot).copied().unwrap_or(0);
            let saved = harvest_saved(row, kills, &dto, &pet_bank);
            if let Some(tx) = &persist.0 {
                let _ = tx.try_send((username.clone(), saved.clone()));
            }
            store.by_username.insert(username.clone(), saved);
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
    pending: std::collections::VecDeque<(u32, i8, i8, bool)>,
    last: (i8, i8, bool),
    primed: bool,
    starve_ticks: u32,
    debt: u32,
    consumed_seq: u32,
}

/// Recent server-tick positions per player, for lag-compensated PvP hit checks:
/// the shooter sees remote players ~INTERP_DELAY + RTT in the past, so on a hit we
/// rewind the TARGET to where the shooter saw it instead of its live position.
const POS_HISTORY_LEN: usize = 16;
/// Ticks to rewind a player target on a hit check — covers the client interp
/// delay (200ms = 4 ticks @ 20Hz) plus a nominal RTT. Fixed for now; per-client
/// RTT precision is a refinement.
const LAG_COMP_TICKS: usize = 5;

#[derive(Component)]
pub struct PosHistory {
    ring: [Tile; POS_HISTORY_LEN],
    head: usize,
    len: usize,
}

impl Default for PosHistory {
    fn default() -> Self {
        Self {
            ring: [Tile::new(0, 0); POS_HISTORY_LEN],
            head: 0,
            len: 0,
        }
    }
}

impl PosHistory {
    /// History pre-filled at `tile`, so rewinds before the first recorded tick
    /// resolve to the spawn position instead of a zeroed ring.
    fn at(tile: Tile) -> Self {
        let mut h = Self::default();
        h.record(tile);
        h
    }

    /// Record this tick's tile in the most-recent slot.
    fn record(&mut self, tile: Tile) {
        if self.len == 0 {
            self.ring = [tile; POS_HISTORY_LEN];
            self.head = 0;
            self.len = POS_HISTORY_LEN;
            return;
        }
        self.head = (self.head + 1) % POS_HISTORY_LEN;
        self.ring[self.head] = tile;
    }

    /// Tile `ticks` ago (0 = most recent), clamped to the recorded window.
    fn ago(&self, ticks: usize) -> Tile {
        let back = ticks.min(self.len.saturating_sub(1));
        let idx = (self.head + POS_HISTORY_LEN - back) % POS_HISTORY_LEN;
        self.ring[idx]
    }
}

/// Inputs to buffer before consumption starts — absorbs network arrival variance
/// so the queue doesn't starve on the first jittery packets.
const INPUT_JITTER_BUFFER: usize = 2;
/// Starved ticks to keep applying the last intent before forcing a stop, so a
/// brief packet gap coasts naturally instead of stuttering to a halt.
const INPUT_STARVE_GRACE: u32 = 2;

impl IntentBuffer {
    /// Queue one client-tick intent. Intents arriving while starve-hold debt is
    /// outstanding were already played via the hold, so they retroactively become
    /// the held intent instead of queueing — displacement is conserved and a late
    /// stop takes effect on the next tick instead of replaying the burst.
    fn push(&mut self, seq: u32, mx: i8, my: i8, run: bool) {
        if self.debt > 0 {
            self.debt -= 1;
            self.last = (mx, my, run);
            self.consumed_seq = seq;
            return;
        }
        self.pending.push_back((seq, mx, my, run));
    }

    /// Seq of the last intent actually applied to the body — the ack clients
    /// replay their unacked inputs against.
    pub fn consumed_seq(&self) -> u32 {
        self.consumed_seq
    }

    /// Drop all buffered motion and come to rest. Used when control is taken over
    /// (boarding a ship) so leftover walk intents don't keep driving the body.
    pub fn clear(&mut self) {
        self.pending.clear();
        self.last = (0, 0, false);
        self.primed = false;
        self.starve_ticks = 0;
        self.debt = 0;
    }

    /// Advance one server tick: return the intent to apply. Primes on the jitter
    /// buffer, then pops one per tick. On starvation the last moving intent is
    /// held for a short grace (counted as debt repaid by `push`), then zeroed so
    /// a dropped tail still comes to rest without over-travelling.
    fn next(&mut self) -> (i8, i8, bool) {
        if !self.primed && self.pending.len() >= INPUT_JITTER_BUFFER {
            self.primed = true;
        }
        let popped = if self.primed {
            self.pending.pop_front()
        } else {
            None
        };
        match popped {
            Some((seq, mx, my, run)) => {
                self.last = (mx, my, run);
                self.consumed_seq = seq;
                self.starve_ticks = 0;
            }
            None => {
                if self.last.0 != 0 || self.last.1 != 0 {
                    self.starve_ticks += 1;
                    if self.starve_ticks > INPUT_STARVE_GRACE {
                        self.last = (0, 0, self.last.2);
                        self.debt = 0;
                    } else {
                        self.debt += 1;
                    }
                }
                self.primed = false;
            }
        }
        self.last
    }
}

#[allow(clippy::type_complexity, clippy::too_many_arguments)]
/// Item definition tables bundled into one `SystemParam` so big systems stay under Bevy's
/// 16-param ceiling.
#[derive(bevy::ecs::system::SystemParam)]
pub struct ItemDefs<'w> {
    pub effects: Res<'w, ConsumableEffects>,
    pub buffs: Res<'w, BuffEffects>,
    pub equipment: Res<'w, EquipmentEffects>,
}

#[allow(clippy::too_many_arguments)]
#[allow(clippy::type_complexity)]
fn drain_inputs(
    queue: Res<InputQueue>,
    map: Res<WalkableMap>,
    defs: ItemDefs,
    config: Res<SimConfig>,
    clock: Res<SimClock>,
    bcast: Res<Outbound>,
    mut bank: ItemBank,
    mut actions: ResMut<PendingActions>,
    mut trades: ResMut<PendingTrades>,
    mut shop: ResMut<PendingShop>,
    mut blackjack_inputs: ResMut<PendingBlackjack>,
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
                Input::SimPetBattle => deploy.pet_battles.0.push(slot),
                Input::PetTurn { action, arg } => deploy.pet_turns.0.push((slot, action, arg)),
                Input::ChallengeNpc { npc } => deploy.npc_challenges.0.push((slot, npc)),
                Input::DuelChallenge { target } => deploy.duel_ops.challenges.push((slot, target)),
                Input::DuelRespond { accept } => deploy.duel_ops.responses.push((slot, accept)),
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
                        intents.push(*seq, *mx, *my, *run);
                    }
                }
                Input::Face { facing } => {
                    pos.facing = *facing;
                }
                Input::UseItem { item_ref } => {
                    use_item(
                        &defs.effects,
                        &defs.buffs,
                        &bcast,
                        &mut bank,
                        slot.0,
                        item_ref,
                        clock.tick,
                        &mut hp,
                        &mut inv,
                        &mut status,
                    );
                }
                Input::DropItem { item_ref, qty } => {
                    // Detach the stack as an item entity (id preserved on a whole drop,
                    // split mints a fresh id) and drop it onto the tile by giving it
                    // ground components — the SAME entity moves, no re-mint.
                    if let Some(e) = bank.detach(&mut inv, item_ref, *qty) {
                        bank.commands.entity(e).insert((
                            GridPos::at(pos.tile),
                            MoveTarget::default(),
                            GroundItem,
                        ));
                        let items = bank.snapshot(&inv);
                        send_inventory(&bcast, slot.0, &items);
                    }
                }
                Input::MoveItem { from, to } => {
                    inv.reorder(*from as usize, *to as usize);
                    let items = bank.snapshot(&inv);
                    send_inventory(&bcast, slot.0, &items);
                }
                Input::EquipItem { item_ref } => {
                    let Some(&bonus) = defs.equipment.0.get(item_ref.as_str()) else {
                        continue;
                    };
                    let is_weapon = bonus.attack > 0;
                    let cur = if is_weapon {
                        equipped.weapon
                    } else {
                        equipped.armor
                    };
                    let cur_ref = cur.and_then(|e| bank.stack_of(e)).map(|s| s.item_ref);
                    if cur_ref.as_deref() == Some(item_ref.as_str()) {
                        // Toggle off: the worn instance returns to the inventory.
                        if let Some(e) = cur {
                            bank.absorb(&mut inv, e);
                        }
                        if is_weapon {
                            equipped.weapon = None;
                        } else {
                            equipped.armor = None;
                        }
                    } else {
                        // Equip one instance from the inventory; any item already in the
                        // slot returns to the inventory.
                        let Some(ne) = bank.detach(&mut inv, item_ref, 1) else {
                            continue;
                        };
                        if let Some(old) = cur {
                            bank.absorb(&mut inv, old);
                        }
                        if is_weapon {
                            equipped.weapon = Some(ne);
                        } else {
                            equipped.armor = Some(ne);
                        }
                    }
                    let bonus_of = |slot: Option<Entity>, bank: &ItemBank| {
                        slot.and_then(|e| bank.stack_of(e))
                            .and_then(|s| defs.equipment.0.get(&s.item_ref).copied())
                            .unwrap_or_default()
                    };
                    let weapon_bonus = bonus_of(equipped.weapon, &bank);
                    let armor_bonus = bonus_of(equipped.armor, &bank);
                    equipped.weapon_bonus = weapon_bonus;
                    equipped.armor_bonus = armor_bonus;
                    stats.attack =
                        level_attack(config.player_attack, xp.level) + weapon_bonus.attack;
                    defense.0 = weapon_bonus.defense + armor_bonus.defense;
                    let changed = if is_weapon {
                        equipped.weapon
                    } else {
                        equipped.armor
                    };
                    let changed_ref = changed.and_then(|e| bank.stack_of(e)).map(|s| s.item_ref);
                    send_equipped(
                        &bcast,
                        slot.0,
                        if is_weapon { "weapon" } else { "armor" },
                        changed_ref.as_deref(),
                        stats.attack,
                        defense.0,
                    );
                    let items = bank.snapshot(&inv);
                    send_inventory(&bcast, slot.0, &items);
                }
                Input::PlaceItem {
                    item_ref,
                    tile,
                    rot,
                } => {
                    let placed = place_item(
                        &deployables,
                        &map,
                        &mut bank,
                        z,
                        pos.tile,
                        *tile,
                        item_ref,
                        &mut inv,
                    );
                    match placed {
                        Ok(()) => {
                            deploy.placements.0.push((
                                slot.0,
                                item_ref.clone(),
                                *tile,
                                z,
                                *rot & 0x03,
                            ));
                            let items = bank.snapshot(&inv);
                            send_inventory(&bcast, slot.0, &items);
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
                Input::EnterShip { ship } => {
                    deploy.pilot_ops.0.push((slot.0, PilotOp::Enter(*ship)));
                }
                Input::ExitShip => {
                    deploy.pilot_ops.0.push((slot.0, PilotOp::Exit));
                }
                Input::LaunchSpace => {
                    deploy.pilot_ops.0.push((slot.0, PilotOp::Launch));
                }
                Input::ReturnSpace => {
                    deploy.pilot_ops.0.push((slot.0, PilotOp::Return));
                }
                Input::OpenCorpse { corpse } => {
                    deploy.corpse_ops.0.push((slot.0, *corpse, None));
                }
                Input::TakeFromCorpse { corpse, slot: idx } => {
                    deploy.corpse_ops.0.push((slot.0, *corpse, Some(*idx)));
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
                | Input::Insure { .. }
                | Input::SimPetBattle
                | Input::PetTurn { .. }
                | Input::ChallengeNpc { .. }
                | Input::DuelChallenge { .. }
                | Input::DuelRespond { .. } => {}
            }
        }
    }
}

#[allow(clippy::too_many_arguments)]
fn use_item(
    effects: &ConsumableEffects,
    buffs: &BuffEffects,
    bcast: &Outbound,
    bank: &mut ItemBank,
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
    if bank.remove(inv, item_ref, 1) == 0 {
        return; // none held
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
    let items = bank.snapshot(inv);
    send_inventory(bcast, slot, &items);
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
    (
        Without<PlayerSlotTag>,
        Without<GroundItem>,
        Without<Invulnerable>,
    ),
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
    for (tile, stack) in drops.0.drain(..) {
        if let Some(bundle) = ground_item_bundle_stack(&registry, stack, tile) {
            commands.spawn(bundle);
        }
    }
}

/// Read-only-ish target queries for `apply_actions`, grouped into one `SystemParam`
/// so the system stays under Bevy's 16-param ceiling: ground items (pickup),
/// position history (lag-comp), and corpses (loot).
#[derive(bevy::ecs::system::SystemParam)]
pub struct ActionTargets<'w, 's> {
    items: Query<'w, 's, (&'static GridPos, &'static GroundItem)>,
    history: Query<'w, 's, &'static PosHistory>,
    profiles: Query<'w, 's, &'static MoveProfile>,
    #[allow(clippy::type_complexity)]
    corpses: Query<
        'w,
        's,
        (&'static GridPos, &'static mut Inventory),
        (With<Corpse>, Without<PlayerSlotTag>),
    >,
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
    mut bank: ItemBank,
    mut q_players: AttackPlayerQuery,
    mut q_mobs: AttackMobQuery,
    mut targets: ActionTargets,
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
                    // Lag-comp: adjudicate against where the attacker SAW the mob.
                    let target_tile = targets
                        .history
                        .get(target_entity)
                        .map(|h| h.ago(LAG_COMP_TICKS))
                        .unwrap_or(mob_pos.tile);
                    if combat::in_range_adjacent(attacker_tile, target_tile, combat::MELEE_RANGE) {
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
                } else if let Some((live_tile, tz)) = match q_players.get(target_entity) {
                    Ok((_, _, t_pos, _, _, _, _, _, _, t_floor, _)) => {
                        Some((t_pos.tile, t_floor.map(|f| f.0).unwrap_or(0)))
                    }
                    Err(_) => None,
                } {
                    // Lag-comp: adjudicate against where the shooter SAW the target.
                    let target_tile = targets
                        .history
                        .get(target_entity)
                        .map(|h| h.ago(LAG_COMP_TICKS))
                        .unwrap_or(live_tile);
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
                let Some((mut target_tile, target_z)) = (match q_mobs.get(target_entity) {
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
                // Lag-comp any target with history (players and mobs): adjudicate the
                // arrow against where the shooter SAW it, not its live position.
                if let Ok(h) = targets.history.get(target_entity) {
                    target_tile = h.ago(LAG_COMP_TICKS);
                }
                // A flyer soars over ground obstacles, so ground walkability must
                // not occlude the shot — only range gates it.
                let target_flies = targets
                    .profiles
                    .get(target_entity)
                    .map(|p| p.terrain == Terrain::Fly)
                    .unwrap_or(false);
                let path = combat::line_cast(attacker_tile, target_tile, combat::BOW_RANGE, |t| {
                    !target_flies && !map.is_walkable(t)
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
                // Target must be a ground item; confirm + read its tile for the range check.
                let Ok((item_pos, _)) = targets.items.get(target_entity) else {
                    continue;
                };
                let item_tile = item_pos.tile;
                let Some(stack) = bank.stack_of(target_entity) else {
                    continue;
                };
                let Ok((_, _, pos, _, mut inv, ..)) = q_players.get_mut(player_entity) else {
                    continue;
                };
                if pos.tile.chebyshev(item_tile) > 1 {
                    continue;
                }
                if !claimed_items.insert(target_entity) {
                    continue;
                }
                let event = proto::PickupEvent {
                    item_ref: stack.item_ref.clone(),
                    count: stack.count,
                };
                // Move the ground item ENTITY into the inventory (id preserved; merges +
                // despawns into a held stack of the same ref).
                bank.absorb(&mut inv, target_entity);
                let pickup = proto::encode_inner(&event).unwrap_or_default();
                let _ = bcast.tx.send(ServerEvent::Ephemeral {
                    kind: proto::EPHEMERAL_PICKUP,
                    to: proto::PlayerSlot(slot.0),
                    payload: pickup,
                });
                let items = bank.snapshot(&inv);
                send_inventory(&bcast, slot, &items);
            }
            proto::ACTION_LOOT => {
                let Ok((corpse_pos, mut corpse_inv)) = targets.corpses.get_mut(target_entity)
                else {
                    continue;
                };
                let corpse_tile = corpse_pos.tile;
                let Ok((_, _, pos, _, mut inv, ..)) = q_players.get_mut(player_entity) else {
                    continue;
                };
                if pos.tile.chebyshev(corpse_tile) > 1 {
                    continue;
                }
                // Transfer every item ENTITY from the corpse to the player, then despawn
                // the empty corpse.
                let items = std::mem::take(&mut corpse_inv.slots);
                if items.is_empty() {
                    commands.entity(target_entity).despawn();
                    continue;
                }
                for e in items {
                    bank.absorb(&mut inv, e);
                }
                commands.entity(target_entity).despawn();
                let items = bank.snapshot(&inv);
                send_inventory(&bcast, slot, &items);
            }
            _ => {}
        }
    }
}

/// Send a corpse's current loot to one player (the looter who has it open). Re-sent
/// after each take so the open dual-inventory panel stays live.
fn send_corpse_contents(
    bcast: &Outbound,
    slot: proto::PlayerSlot,
    corpse: proto::EntityId,
    items: &[ItemStack],
) {
    let event = proto::CorpseContents {
        corpse: corpse.0,
        items: items
            .iter()
            .map(|s| (s.item_ref.clone(), s.count))
            .collect(),
    };
    let payload = proto::encode_inner(&event).unwrap_or_default();
    let _ = bcast.tx.send(ServerEvent::Ephemeral {
        kind: proto::EPHEMERAL_CORPSE,
        to: slot,
        payload,
    });
}

/// Drive the corpse loot panel: OPEN sends the corpse's contents to the looter;
/// TAKE moves one slot to the looter, re-sends the contents + the looter's
/// inventory, and despawns the corpse once empty. Adjacency-gated.
#[allow(clippy::type_complexity)]
fn handle_corpse_ops(
    mut ops: ResMut<PendingCorpseOps>,
    bcast: Res<Outbound>,
    index: Res<EidIndex>,
    mut commands: Commands,
    mut bank: ItemBank,
    mut q_corpses: Query<(&GridPos, &mut Inventory), (With<Corpse>, Without<PlayerSlotTag>)>,
    mut q_players: Query<(Entity, &PlayerSlotTag, &GridPos, &mut Inventory)>,
) {
    if ops.0.is_empty() {
        return;
    }
    for (slot, corpse_id, take) in ops.0.drain(..) {
        let Some(&corpse_e) = index.by_eid.get(&corpse_id.0) else {
            continue;
        };
        let Ok((corpse_pos, mut corpse_inv)) = q_corpses.get_mut(corpse_e) else {
            continue;
        };
        let corpse_tile = corpse_pos.tile;
        let Some((player_e, player_tile)) = q_players
            .iter()
            .find(|(_, s, _, _)| s.0 == slot)
            .map(|(e, _, gp, _)| (e, gp.tile))
        else {
            continue;
        };
        if player_tile.chebyshev(corpse_tile) > 1 {
            continue;
        }
        match take {
            None => {
                let items = bank.snapshot(&corpse_inv);
                send_corpse_contents(&bcast, slot, corpse_id, &items);
            }
            Some(idx) => {
                let idx = idx as usize;
                if idx >= corpse_inv.slots.len() {
                    let items = bank.snapshot(&corpse_inv);
                    send_corpse_contents(&bcast, slot, corpse_id, &items);
                    continue;
                }
                // Move the chosen item ENTITY from the corpse to the looter (id preserved).
                let e = corpse_inv.slots.remove(idx);
                if let Ok((_, _, _, mut p_inv)) = q_players.get_mut(player_e) {
                    bank.absorb(&mut p_inv, e);
                    let items = bank.snapshot(&p_inv);
                    send_inventory(&bcast, slot, &items);
                }
                let items = bank.snapshot(&corpse_inv);
                send_corpse_contents(&bcast, slot, corpse_id, &items);
                if corpse_inv.slots.is_empty() {
                    commands.entity(corpse_e).despawn();
                }
            }
        }
    }
}

pub fn count_ref(bank: &ItemBank, inv: &Inventory, item_ref: &str) -> u32 {
    bank.count(inv, item_ref)
}

/// All-or-nothing removal of exactly `qty` of a ref. Returns false (untouched) if short.
pub fn remove_ref(bank: &mut ItemBank, inv: &mut Inventory, item_ref: &str, qty: u32) -> bool {
    if bank.count(inv, item_ref) < qty {
        return false;
    }
    bank.remove(inv, item_ref, qty) == qty
}

/// Combined spendable coin: loose coins plus gold-bars at GOLD_BAR_VALUE each.
pub fn coin_balance(bank: &ItemBank, inv: &Inventory) -> u32 {
    bank.count(inv, COIN_REF)
        .saturating_add(bank.count(inv, GOLD_BAR_REF).saturating_mul(GOLD_BAR_VALUE))
}

/// Spend `amount` coin-equivalent, breaking gold-bars into loose coins as needed.
/// Returns false (and leaves the inventory untouched) if the balance is short.
pub fn spend_coins(bank: &mut ItemBank, inv: &mut Inventory, amount: u32) -> bool {
    if coin_balance(bank, inv) < amount {
        return false;
    }
    while bank.count(inv, COIN_REF) < amount {
        if !remove_ref(bank, inv, GOLD_BAR_REF, 1) {
            return false;
        }
        bank.add(inv, COIN_REF, GOLD_BAR_VALUE);
    }
    remove_ref(bank, inv, COIN_REF, amount)
}

#[allow(clippy::too_many_arguments)]
fn award_xp(
    bcast: &Outbound,
    slot: proto::PlayerSlot,
    config: &SimConfig,
    // Equipped bonus is now read from the cached `Equipped` fields on level-up, not a
    // ref lookup; kept in the signature so callers (which hold the table) stay unchanged.
    _equipment: &EquipmentEffects,
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
        hp.max_hp = level_max_hp(config.player_hp, xp.level);
        hp.hp = hp.max_hp;
        stats.attack = level_attack(config.player_attack, xp.level) + equipped.weapon_bonus.attack;
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

/// Push an inventory snapshot to the client. Callers materialise the stack DTOs from the
/// owner's item entities first (`bank.snapshot(&inv)`), since the live inventory is a list
/// of entity handles.
pub fn send_inventory(bcast: &Outbound, slot: proto::PlayerSlot, items: &[ItemStack]) {
    let items = items
        .iter()
        .map(|s| proto::InventoryItem {
            id: s.id.clone(),
            item_ref: s.item_ref.clone(),
            count: s.count,
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
#[allow(clippy::too_many_arguments)]
fn place_item(
    deployables: &Deployables,
    map: &WalkableMap,
    bank: &mut ItemBank,
    z: i32,
    from: Tile,
    tile: Tile,
    item_ref: &str,
    inv: &mut Inventory,
) -> Result<(), &'static str> {
    if !deployables.0.contains_key(item_ref) {
        return Err("not_placeable");
    }
    if bank.count(inv, item_ref) == 0 {
        return Err("not_held");
    }
    if from.chebyshev(tile) > PLACE_RANGE {
        return Err("too_far");
    }
    if !map.is_walkable_z(z, tile) {
        return Err("blocked");
    }
    if bank.remove(inv, item_ref, 1) == 0 {
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
    mut bank: ItemBank,
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
            bank.add(&mut inv, &placed.kit_ref, 1);
            let items = bank.snapshot(&inv);
            send_inventory(&bcast, slot, &items);
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
        Option<&mut Energy>,
        Option<&mut Stamina>,
        &GridPos,
        &XpState,
        &CombatStats,
    )>,
) {
    if !clock.tick.is_multiple_of(REGEN_PERIOD_TICKS) {
        return;
    }
    for (slot, mut hp, mut mana, energy, stamina, pos, xp, stats) in q.iter_mut() {
        if hp.hp > 0 {
            if let Some(mut e) = energy {
                e.ep = (e.ep + ENERGY_REGEN_AMOUNT).min(e.max_ep);
            }
            if let Some(mut s) = stamina {
                s.sp = (s.sp + STAMINA_REGEN_AMOUNT).min(s.max_sp);
            }
        }
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
/// On death (hp <= 0): drop the player's entire inventory into a lootable corpse
/// at the death spot (PvE + PvP), then respawn them at the SURFACE spawn with full
/// HP — dropping any dungeon `Floor` so they come back up top, not on the floor
/// they died on. Corpses are disabled (items just clear) when no `corpse_kind` is
/// configured.
fn handle_death_and_respawn(
    config: Res<SimConfig>,
    mut commands: Commands,
    mut q: Query<
        (
            Entity,
            &PlayerSlotTag,
            &mut GridPos,
            &mut Health,
            &mut StatusEffects,
            &mut MoveSpeed,
            &mut FloatMove,
            &mut Inventory,
            Option<&Floor>,
        ),
        With<PlayerSlotTag>,
    >,
) {
    for (entity, slot, mut pos, mut hp, mut status, mut speed, mut fm, mut inv, floor) in
        q.iter_mut()
    {
        if hp.hp > 0 {
            continue;
        }
        let death_tile = pos.tile;
        let death_floor = floor.map(|f| f.0).unwrap_or(0);

        // Drop everything into a corpse where they fell.
        if let Some(corpse_kind) = config.corpse_kind
            && !inv.slots.is_empty()
        {
            let items = std::mem::take(&mut inv.slots);
            let mut e = commands.spawn((
                EntityKind(corpse_kind),
                GridPos::at(death_tile),
                MoveTarget::default(),
                Inventory { slots: items },
                Corpse,
                PlacedBy {
                    owner: slot.0,
                    kit_ref: String::new(),
                },
            ));
            if death_floor != 0 {
                e.insert(Floor(death_floor));
            }
        }

        // Respawn topside.
        if death_floor != 0 {
            commands.entity(entity).remove::<Floor>();
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

#[allow(clippy::type_complexity)]
fn advance_float(
    map: Res<WalkableMap>,
    mut q: Query<
        (
            &mut GridPos,
            &mut FloatMove,
            &mut IntentBuffer,
            Option<&Floor>,
            Option<&Piloting>,
        ),
        With<PlayerSlotTag>,
    >,
) {
    let dt_ms = 1000.0 / SIM_TICK_HZ as f32;
    for (mut pos, mut fm, mut intents, floor, piloting) in q.iter_mut() {
        let z = floor.map(|f| f.0).unwrap_or(0);
        // A piloted ship FLIES — it soars over trees/props (no ground collision) so it
        // doesn't dodge + stutter around them. Walking bodies collide normally.
        let flying = piloting.is_some();
        let is_blocked = |x: i32, y: i32| !flying && !map.is_walkable_z(z, Tile::new(x, y));
        // Consume exactly one buffered intent per server tick (FIFO), so the body
        // reproduces the client's tick-by-tick motion — including stopping the
        // same tick the client released, no held-intent over-travel.
        let (mx, my, run) = intents.next();
        fm.intent_x = mx;
        fm.intent_y = my;
        fm.run = run;
        fm.acked_seq = intents.consumed_seq();
        let (ix, iy) = crate::float_move::intent_from_axes(mx, my);
        let mut speed = if run {
            crate::float_move::RUN_SPEED
        } else {
            crate::float_move::WALK_SPEED
        };
        // Piloting a ship cruises faster, eases into turns (low accel) and coasts on
        // release (low friction) — momentum, not a snappy walk.
        let (accel, friction) = if piloting.is_some() {
            speed *= crate::float_move::PILOT_SPEED_MULT;
            (
                crate::float_move::PILOT_ACCEL,
                crate::float_move::PILOT_FRICTION,
            )
        } else {
            (
                crate::float_move::MOVE_ACCEL,
                crate::float_move::MOVE_FRICTION,
            )
        };
        crate::float_move::step_float(
            &mut fm.body,
            ix,
            iy,
            speed,
            accel,
            friction,
            &is_blocked,
            dt_ms,
        );
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

/// Snapshot each combatant's tile (players and mobs) into its `PosHistory` ring
/// every tick (after the float advance), so lag-compensated hit checks can rewind
/// a target to where the shooter saw it.
fn record_pos_history(mut q: Query<(&GridPos, &mut PosHistory)>) {
    for (pos, mut h) in q.iter_mut() {
        h.record(pos.tile);
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
    item_refs: Query<&ItemRef>,
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
            && !inv
                .slots
                .iter()
                .any(|&e| item_refs.get(e).map(|r| &r.0 == key).unwrap_or(false))
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
        (
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
        ),
        (
            Option<&PlacedBy>,
            Option<&TreeState>,
            Option<&BushState>,
            Option<&FurnitureRot>,
            Option<&Piloting>,
            Option<&Mana>,
            Option<&Energy>,
            Option<&Stamina>,
        ),
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
                (entity, kind, slot, pos, mv, speed, hp, status, floor, fm),
                (placed, tree, bush, furniture, piloting, mana, energy, stamina),
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
                        f.acked_seq,
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
                    // A player piloting a ship carries that ship's eid (so every client
                    // hides its body + floats its nameplate over the ship). Sourced from
                    // the `Piloting` link component.
                    piloting: piloting.map(|p| p.0.index_u32()).unwrap_or(0),
                    mp: mana.map(|m| m.mp).unwrap_or(0),
                    max_mp: mana.map(|m| m.max_mp).unwrap_or(0),
                    energy: energy.map(|e| e.ep).unwrap_or(0),
                    max_energy: energy.map(|e| e.max_ep).unwrap_or(0),
                    stamina: stamina.map(|s| s.sp).unwrap_or(0),
                    max_stamina: stamina.map(|s| s.max_sp).unwrap_or(0),
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
        let corpse_kind = registry.register_env("corpse");
        let app = build_app(
            tx,
            input_rx,
            roster.clone(),
            seed,
            SimConfig {
                spawn: Tile::new(8, 8),
                corpse_kind: Some(corpse_kind),
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

    /// Spawn a held item entity and return its handle (test-only mint).
    pub(crate) fn spawn_test_item(app: &mut App, item_ref: &str, count: u32) -> Entity {
        let kind = app
            .world()
            .resource::<KindRegistry>()
            .kind_of(item_ref)
            .unwrap_or(0);
        app.world_mut()
            .spawn((
                Item,
                ItemId(mint_item_id()),
                ItemRef(item_ref.to_string()),
                StackCount(count),
                EntityKind(kind),
            ))
            .id()
    }

    /// Replace an inventory with freshly-minted item entities (one stack per pair).
    pub(crate) fn set_inventory(app: &mut App, entity: Entity, items: &[(&str, u32)]) {
        let ents: Vec<Entity> = items
            .iter()
            .map(|(r, c)| spawn_test_item(app, r, *c))
            .collect();
        app.world_mut().get_mut::<Inventory>(entity).unwrap().slots = ents;
    }

    /// Add one freshly-minted stack to an existing inventory (merges by ref).
    pub(crate) fn give_item(app: &mut App, entity: Entity, item_ref: &str, count: u32) {
        // Merge into an existing stack of the same ref if present.
        let existing: Option<Entity> = {
            let inv = app.world().get::<Inventory>(entity).unwrap();
            inv.slots.iter().copied().find(|&e| {
                app.world()
                    .get::<ItemRef>(e)
                    .map(|r| r.0 == item_ref)
                    .unwrap_or(false)
            })
        };
        if let Some(e) = existing {
            let mut c = app.world_mut().get_mut::<StackCount>(e).unwrap();
            c.0 = c.0.saturating_add(count);
        } else {
            let e = spawn_test_item(app, item_ref, count);
            app.world_mut()
                .get_mut::<Inventory>(entity)
                .unwrap()
                .slots
                .push(e);
        }
    }

    /// Total count of a ref across an inventory's item entities.
    pub(crate) fn inv_count(app: &App, entity: Entity, item_ref: &str) -> u32 {
        let inv = app.world().get::<Inventory>(entity).unwrap();
        inv.slots
            .iter()
            .filter_map(|&e| {
                let r = app.world().get::<ItemRef>(e)?;
                let c = app.world().get::<StackCount>(e)?;
                (r.0 == item_ref).then_some(c.0)
            })
            .sum()
    }

    /// (ref, count) pairs in slot order — for asserting inventory contents without
    /// pinning the random instance ids.
    pub(crate) fn slot_pairs(app: &App, entity: Entity) -> Vec<(String, u32)> {
        let inv = app.world().get::<Inventory>(entity).unwrap();
        inv.slots
            .iter()
            .filter_map(|&e| {
                let r = app.world().get::<ItemRef>(e)?;
                let c = app.world().get::<StackCount>(e)?;
                Some((r.0.clone(), c.0))
            })
            .collect()
    }
}

#[cfg(test)]
mod tests {
    use super::test_support::*;
    use super::*;
    use std::collections::HashSet;

    #[test]
    fn intent_buffer_starve_hold_does_not_replay_late_burst() {
        let mut b = IntentBuffer::default();
        b.push(1, 100, 0, true);
        b.push(2, 100, 0, true);
        let mut moving_ticks = 0;
        for _ in 0..2 {
            if b.next().0 != 0 {
                moving_ticks += 1;
            }
        }
        for _ in 0..2 {
            if b.next().0 != 0 {
                moving_ticks += 1;
            }
        }
        b.push(3, 100, 0, true);
        b.push(4, 100, 0, true);
        b.push(5, 0, 0, true);
        b.push(6, 0, 0, true);
        for _ in 0..8 {
            if b.next().0 != 0 {
                moving_ticks += 1;
            }
        }
        assert_eq!(
            moving_ticks, 4,
            "held starve ticks must repay the late burst, not double-play it"
        );
        assert_eq!(
            b.consumed_seq(),
            6,
            "ack must cover every intent applied, including debt-adopted ones"
        );
    }

    #[test]
    fn intent_buffer_unprimed_hold_stops_after_grace() {
        let mut b = IntentBuffer::default();
        b.push(1, 100, 0, true);
        b.push(2, 100, 0, true);
        b.next();
        b.next();
        let mut moving_ticks = 0;
        for _ in 0..10 {
            if b.next().0 != 0 {
                moving_ticks += 1;
            }
        }
        assert!(
            moving_ticks <= INPUT_STARVE_GRACE as i32,
            "dead stream must come to rest within grace, kept moving {moving_ticks} ticks"
        );
    }

    #[test]
    fn drop_item_spawns_ground_loot_and_decrements_inventory() {
        let (mut app, _rx, input_tx, roster) = harness(0x70);
        let slot = join(&roster, "dropper");
        app.update();
        let player = player_entity(&mut app);
        {
            give_item(&mut app, player, "potion", 3);
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
        let left = inv_count(&app, player, "potion");
        assert_eq!(left, 1, "inventory not decremented to 1 (got {left})");
        let mut q = app
            .world_mut()
            .query_filtered::<(&ItemRef, &StackCount), With<GroundItem>>();
        let dropped = q
            .iter(app.world())
            .any(|(r, c)| r.0 == "potion" && c.0 == 2);
        assert!(dropped, "dropped potion did not spawn as ground loot");
    }

    #[test]
    fn move_item_reorders_inventory_slots() {
        let (mut app, _rx, input_tx, roster) = harness(0x71);
        let slot = join(&roster, "organizer");
        app.update();
        let player = player_entity(&mut app);
        {
            give_item(&mut app, player, "potion", 1);
            give_item(&mut app, player, "coin", 5);
            give_item(&mut app, player, "elixir", 2);
        }
        input_tx
            .send((slot, Input::MoveItem { from: 0, to: 2 }))
            .unwrap();
        for _ in 0..3 {
            app.update();
        }
        let order: Vec<String> = slot_pairs(&app, player)
            .into_iter()
            .map(|(r, _)| r)
            .collect();
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
        assert!(inv_count(&app, player, "campfire-kit") >= 1, "kit refunded");
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
        let kit = spawn_test_item(&mut app, "test-kit", 1);
        app.world_mut().spawn((
            EntityKind(PLAYER_KIND),
            GridPos::at(from),
            MoveTarget::default(),
            Inventory { slots: vec![kit] },
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
    fn damage_spell_drains_mana_even_on_a_miss() {
        let (mut app, _rx, _tx, _roster) = harness(0x5EE);
        app.world_mut()
            .resource_mut::<bevy_spells::SpellDb>()
            .insert(bevy_spells::Spell {
                r#ref: "test-bolt".to_string(),
                effect: bevy_spells::SpellEffect::Damage as i32,
                mana_cost: Some(10),
                power: Some(5),
                range: Some(8),
                ..Default::default()
            });
        let player = app
            .world_mut()
            .spawn((
                EntityKind(PLAYER_KIND),
                GridPos::at(Tile::new(10, 10)),
                CombatStats { attack: 1 },
                Inventory::default(),
                Health {
                    hp: 100,
                    max_hp: 100,
                },
                XpState::default(),
                Equipped::default(),
                Mana { mp: 50, max_mp: 50 },
                Defense::default(),
                PlayerSlotTag(proto::PlayerSlot(0)),
            ))
            .id();
        app.world_mut()
            .resource_mut::<crate::spells::PendingSpells>()
            .0
            .push((proto::PlayerSlot(0), "test-bolt".to_string(), None));
        app.update();
        let mp = app.world().get::<Mana>(player).unwrap().mp;
        assert_eq!(
            mp, 40,
            "a fired damage spell spends mana even with no target"
        );
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
                ServerEvent::Snapshot(snap)
                    if snap.entities.iter().any(|e| e.kind == potion_kind) =>
                {
                    saw_potion_drop = true;
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
        // Settle so the lag-comp history reflects the adjacent position.
        for _ in 0..(LAG_COMP_TICKS + 2) {
            app.update();
        }

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

    #[test]
    fn lag_comp_hits_target_at_shooter_view_position() {
        let (mut app, _rx, input_tx, roster) = harness(73);
        let a = join(&roster, "shooter");
        let b = join(&roster, "runner");
        app.update();
        let ea = player_for_slot(&mut app, a);
        let eb = player_for_slot(&mut app, b);
        place_player(&mut app, ea, Tile::new(5, 5), Some(-1));
        place_player(&mut app, eb, Tile::new(6, 5), Some(-1));
        // Fill B's history at the adjacent tile the shooter sees it at.
        for _ in 0..(LAG_COMP_TICKS + 4) {
            app.update();
        }
        // B sprints far away THIS tick: its LIVE pos is now well out of melee range,
        // but its rewound (shooter-view) pos is still adjacent — lag-comp must hit.
        {
            let mut fm = app.world_mut().get_mut::<FloatMove>(eb).unwrap();
            fm.body = crate::float_move::FloatBody::at(25.0, 25.0);
        }
        app.world_mut().get_mut::<GridPos>(eb).unwrap().tile = Tile::new(25, 25);

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
        app.update();
        let hp1 = app.world().get::<Health>(eb).unwrap().hp;
        assert!(
            hp1 < hp0,
            "lag-comp did not rewind the target to the shooter's view (hp {hp0}->{hp1})"
        );
    }

    #[test]
    fn death_drops_corpse_and_loot_transfers() {
        let (mut app, _rx, input_tx, roster) = harness(81);
        let a = join(&roster, "victim");
        app.update();
        let ea = player_for_slot(&mut app, a);
        set_inventory(&mut app, ea, &[("potion", 3)]);
        place_player(&mut app, ea, Tile::new(10, 10), Some(-1));
        // Kill the player.
        app.world_mut().get_mut::<Health>(ea).unwrap().hp = 0;
        app.update();

        // Respawned topside (spawn 8,8), dungeon Floor dropped, inventory emptied.
        assert_eq!(
            app.world().get::<GridPos>(ea).unwrap().tile,
            Tile::new(8, 8)
        );
        assert!(app.world().get::<Floor>(ea).is_none(), "Floor dropped");
        assert!(
            app.world().get::<Inventory>(ea).unwrap().slots.is_empty(),
            "inventory dropped on death"
        );

        // A corpse holds the dropped items at the death tile.
        let corpse = {
            let mut q = app
                .world_mut()
                .query_filtered::<(Entity, &GridPos), With<Corpse>>();
            let (e, gp) = q.iter(app.world()).next().expect("corpse spawned");
            assert_eq!(gp.tile, Tile::new(10, 10));
            e
        };
        assert_eq!(slot_pairs(&app, corpse), vec![("potion".to_string(), 3)]);

        // An adjacent looter takes everything; the empty corpse despawns.
        let b = join(&roster, "looter");
        app.update();
        let eb = player_for_slot(&mut app, b);
        set_inventory(&mut app, eb, &[]);
        place_player(&mut app, eb, Tile::new(11, 10), Some(-1));
        app.update();
        input_tx
            .send((
                b,
                Input::Action {
                    id: proto::ACTION_LOOT,
                    target: Some(proto::EntityId(corpse.index_u32())),
                },
            ))
            .unwrap();
        app.update();

        assert_eq!(
            slot_pairs(&app, eb),
            vec![("potion".to_string(), 3)],
            "looter received the corpse's items"
        );
        let mut q = app.world_mut().query_filtered::<Entity, With<Corpse>>();
        assert!(
            q.iter(app.world()).next().is_none(),
            "looted corpse despawned"
        );
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

    #[test]
    fn bow_hits_flying_target_over_blocking_terrain() {
        let (mut app, mut rx, input_tx, roster) = harness(11);
        let slot = join(&roster, "archer");
        let dummy = app
            .world()
            .resource::<KindRegistry>()
            .kind_of("training-dummy")
            .unwrap();
        let mob = spawn_bow_target(&mut app, dummy, Tile::new(8, 13));
        app.world_mut()
            .entity_mut(mob)
            .insert(MoveProfile::flying());
        app.world_mut()
            .resource_mut::<WalkableMap>()
            .set_blocked(Tile::new(8, 10), true);
        run_shoot(&mut app, &input_tx, slot, mob);
        let (proj, combat) = drain_shot(&mut rx);
        assert!(proj, "no projectile emitted");
        assert!(combat, "ground terrain wrongly occluded a flying target");
    }

    #[test]
    fn bow_lag_comp_rewinds_moving_mob() {
        let (mut app, mut rx, input_tx, roster) = harness(11);
        let slot = join(&roster, "archer");
        let dummy = app
            .world()
            .resource::<KindRegistry>()
            .kind_of("training-dummy")
            .unwrap();
        let mob = spawn_bow_target(&mut app, dummy, Tile::new(8, 13));
        app.world_mut()
            .entity_mut(mob)
            .insert(PosHistory::at(Tile::new(8, 13)));
        for _ in 0..(LAG_COMP_TICKS + 4) {
            app.update();
        }
        // Mob darts out of range THIS tick: live pos misses, rewound pos hits.
        app.world_mut().get_mut::<GridPos>(mob).unwrap().tile = Tile::new(25, 25);
        input_tx
            .send((
                slot,
                Input::Action {
                    id: proto::ACTION_SHOOT,
                    target: Some(proto::EntityId(mob.index_u32())),
                },
            ))
            .unwrap();
        app.update();
        let (proj, combat) = drain_shot(&mut rx);
        assert!(proj, "no projectile emitted");
        assert!(
            combat,
            "lag-comp did not rewind the mob to the shooter's view"
        );
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
            give_item(&mut app, player, "potion", 2);
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
        assert_eq!(hp.hp, 75, "potion did not heal");
        assert_eq!(slot_pairs(&app, player), vec![("potion".to_string(), 1)]);

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
            give_item(&mut app, player, "iron-sword", 1);
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
            give_item(&mut app, player, "iron-shield", 1);
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
        let equipped = app.world().get::<Equipped>(player).unwrap().clone();
        let armor_ref = equipped
            .armor
            .and_then(|e| app.world().get::<ItemRef>(e))
            .map(|r| r.0.as_str());
        assert_eq!(armor_ref, Some("iron-shield"));
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
            give_item(&mut app, player, "potion", 3);
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
    fn vitals_and_position_persist_across_rejoin() {
        let (mut app, _rx, _tx, roster) = harness(52);
        let slot = join(&roster, "wanderer");
        app.update();
        let player = player_entity(&mut app);
        {
            let mut mana = app.world_mut().get_mut::<Mana>(player).unwrap();
            mana.mp = 7;
            let mut energy = app.world_mut().get_mut::<Energy>(player).unwrap();
            energy.ep = 13;
            let mut stamina = app.world_mut().get_mut::<Stamina>(player).unwrap();
            stamina.sp = 21;
            let mut gp = app.world_mut().get_mut::<GridPos>(player).unwrap();
            gp.tile = Tile::new(14, 3);
            gp.facing = proto::Facing::Left;
        }
        roster.write().unwrap().release(slot);
        app.update();
        let _slot2 = join(&roster, "wanderer");
        for _ in 0..2 {
            app.update();
        }
        let player2 = player_entity(&mut app);
        assert_eq!(app.world().get::<Mana>(player2).unwrap().mp, 7);
        assert_eq!(app.world().get::<Energy>(player2).unwrap().ep, 13);
        assert_eq!(app.world().get::<Stamina>(player2).unwrap().sp, 21);
        let gp = app.world().get::<GridPos>(player2).unwrap();
        assert_eq!(gp.tile, Tile::new(14, 3), "position not restored");
        assert_eq!(gp.facing, proto::Facing::Left, "facing not restored");
    }

    #[test]
    fn unwalkable_saved_position_falls_back_to_spawn() {
        let (mut app, _rx, _tx, roster) = harness(53);
        let slot = join(&roster, "faller");
        app.update();
        let player = player_entity(&mut app);
        {
            let mut gp = app.world_mut().get_mut::<GridPos>(player).unwrap();
            gp.tile = Tile::new(200, 200);
        }
        roster.write().unwrap().release(slot);
        app.update();
        let _slot2 = join(&roster, "faller");
        for _ in 0..2 {
            app.update();
        }
        let player2 = player_entity(&mut app);
        let gp = app.world().get::<GridPos>(player2).unwrap();
        assert_eq!(gp.tile, Tile::new(8, 8), "should fall back to spawn");
    }

    #[test]
    fn pets_persist_across_rejoin() {
        let (mut app, mut rx, _tx, roster) = harness(54);
        let slot = join(&roster, "tamer");
        app.update();
        let player = player_entity(&mut app);
        let snap = crate::pets::PetSnapshot {
            id: crate::pets::mint_pet_id(),
            species_ref: "mechamutt".into(),
            nickname: "Bolt".into(),
            level: 4,
            xp: 12,
            vitals: crate::pets::PetVitals {
                hp: 30,
                max_hp: 40,
                attack: 9,
                defense: 7,
                sp_attack: 11,
                sp_defense: 6,
                speed: 10,
            },
            moves: vec![crate::pets::PetMoveSlot {
                ability_id: "spark-bark".into(),
                pp: 15,
                max_pp: 20,
            }],
        };
        let want = snap.clone();
        {
            let mut sys = bevy::ecs::system::SystemState::<(PetBank, Query<&mut PetRoster>)>::new(
                app.world_mut(),
            );
            let (mut bank, mut rosters) = sys.get_mut(app.world_mut()).unwrap();
            let mut r = rosters.get_mut(player).expect("player has a roster");
            bank.add(&mut r, snap);
            sys.apply(app.world_mut());
        }
        app.update();
        roster.write().unwrap().release(slot);
        app.update();
        while rx.try_recv().is_ok() {}

        let slot2 = join(&roster, "tamer");
        for _ in 0..2 {
            app.update();
        }
        let player2 = player_entity(&mut app);
        let restored = app.world().get::<PetRoster>(player2).unwrap().clone();
        assert_eq!(restored.slots.len(), 1, "pet not restored");
        assert_eq!(restored.active, Some(0));
        {
            let mut sys = bevy::ecs::system::SystemState::<PetBank>::new(app.world_mut());
            let bank = sys.get_mut(app.world_mut()).unwrap();
            let snaps = bank.snapshot(&restored);
            assert_eq!(snaps.len(), 1);
            assert_eq!(snaps[0].id, want.id, "pet instance id must survive");
            assert_eq!(snaps[0].nickname, want.nickname);
            assert_eq!(snaps[0].level, want.level);
            assert_eq!(snaps[0].vitals, want.vitals);
            assert_eq!(snaps[0].moves, want.moves);
        }
        let mut saw_roster_sync = false;
        while let Ok(evt) = rx.try_recv() {
            if let ServerEvent::Ephemeral { kind, to, payload } = evt
                && kind == proto::EPHEMERAL_PET_ROSTER
            {
                assert_eq!(to, slot2);
                let sync: proto::PetRosterSync = proto::decode_inner(&payload).unwrap();
                assert_eq!(sync.pets.len(), 1);
                assert_eq!(sync.pets[0].id, want.id);
                saw_roster_sync = true;
            }
        }
        assert!(saw_roster_sync, "no pet roster sync on rejoin");
    }

    #[test]
    fn autosave_harvests_online_players() {
        let (mut app, _rx, _tx, roster) = harness(55);
        let _slot = join(&roster, "camper");
        app.update();
        let player = player_entity(&mut app);
        give_item(&mut app, player, "potion", 2);
        {
            let mut gp = app.world_mut().get_mut::<GridPos>(player).unwrap();
            gp.tile = Tile::new(5, 6);
            *app.world_mut().get_mut::<FloatMove>(player).unwrap() = FloatMove::at(Tile::new(5, 6));
        }
        {
            let store = app.world().resource::<PlayerStore>();
            assert!(
                !store.by_username.contains_key("camper"),
                "no save expected before the autosave period"
            );
        }
        app.world_mut().resource_mut::<SimClock>().tick = AUTOSAVE_PERIOD_TICKS - 1;
        app.update();
        let store = app.world().resource::<PlayerStore>();
        let saved = store
            .by_username
            .get("camper")
            .expect("autosave should harvest online players");
        assert_eq!(saved.pos, Some((Tile::new(5, 6), proto::Facing::Down)));
        assert!(
            saved
                .slots
                .iter()
                .any(|s| s.item_ref == "potion" && s.count == 2)
        );
    }

    #[test]
    fn persist_sink_receives_disconnect_and_autosave() {
        let (mut app, _rx, _tx, roster) = harness(56);
        let (persist_tx, mut persist_rx) = mpsc::channel(8);
        app.insert_resource(PlayerPersistSink(Some(persist_tx)));
        let slot = join(&roster, "saver");
        app.update();
        let player = player_entity(&mut app);
        give_item(&mut app, player, "potion", 4);

        app.world_mut().resource_mut::<SimClock>().tick = AUTOSAVE_PERIOD_TICKS - 1;
        app.update();
        let (name, saved) = persist_rx.try_recv().expect("autosave should hit the sink");
        assert_eq!(name, "saver");
        assert!(
            saved
                .slots
                .iter()
                .any(|s| s.item_ref == "potion" && s.count == 4)
        );

        roster.write().unwrap().release(slot);
        app.update();
        let (name, saved) = persist_rx
            .try_recv()
            .expect("disconnect save should hit the sink");
        assert_eq!(name, "saver");
        assert!(
            saved
                .slots
                .iter()
                .any(|s| s.item_ref == "potion" && s.count == 4)
        );
    }

    #[test]
    fn seed_prefills_store_without_clobbering() {
        let (mut app, _rx, _tx, roster) = harness(57);
        let seeded = SavedPlayer {
            level: 5,
            xp: 30,
            ..SavedPlayer::default()
        };
        app.world_mut()
            .resource_mut::<PlayerStore>()
            .seed("loaded", seeded);
        let _slot = join(&roster, "loaded");
        app.update();
        let player = player_entity(&mut app);
        let xp = app.world().get::<XpState>(player).unwrap();
        assert_eq!(
            (xp.level, xp.xp),
            (5, 30),
            "seeded save not applied on join"
        );

        let stale = SavedPlayer {
            level: 1,
            ..SavedPlayer::default()
        };
        let mut store = app.world_mut().resource_mut::<PlayerStore>();
        store.seed("loaded", stale);
        assert!(store.contains("loaded"));
        assert_eq!(
            store.by_username.get("loaded").unwrap().level,
            5,
            "seed must not overwrite an existing entry"
        );
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
    fn invulnerable_npc_ignores_attacks() {
        let (mut app, mut rx, input_tx, roster) = harness(37);
        let slot = join(&roster, "aggressor");
        app.update();

        let registry = app.world().resource::<KindRegistry>().clone();
        let kind = registry.kind_of("training-dummy").unwrap();
        let mut spec = hostile_spec(kind, Tile::new(9, 8));
        spec.aggro = None;
        spec.max_hp = 1;
        spec.respawn_ticks = 0;
        let mob = {
            let mut commands_queue = bevy::ecs::world::CommandQueue::default();
            let mut commands = Commands::new(&mut commands_queue, app.world());
            let e = spawn_npc_from_spec(&mut commands, &spec);
            commands_queue.apply(app.world_mut());
            e
        };
        app.world_mut().entity_mut(mob).insert(Invulnerable);
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

        let hp = app
            .world()
            .get::<Health>(mob)
            .expect("invulnerable npc still exists")
            .hp;
        assert_eq!(hp, 1, "invulnerable npc took damage");
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
    fn pickup_preserves_ground_item_instance_id() {
        let (mut app, mut rx, input_tx, roster) = harness(0x1d);
        let slot = join(&roster, "id-keeper");
        let registry = app.world().resource::<KindRegistry>().clone();
        // A ground item with a known instance id; picking it up must keep that id (a
        // move, not a fresh mint) so the item's identity + birth time are preserved.
        let stack = ItemStack {
            id: "ground-instance-id".into(),
            item_ref: "potion".into(),
            count: 1,
        };
        let bundle = ground_item_bundle_stack(&registry, stack, Tile::new(9, 8)).unwrap();
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

        let mut last: Option<proto::InventorySync> = None;
        while let Ok(evt) = rx.try_recv() {
            if let ServerEvent::Ephemeral { kind, payload, .. } = evt
                && kind == proto::EPHEMERAL_INVENTORY
            {
                last = Some(proto::decode_inner(&payload).unwrap());
            }
        }
        let inv = last.expect("no inventory sync");
        let potion = inv
            .items
            .iter()
            .find(|i| i.item_ref == "potion")
            .expect("potion in inventory");
        assert_eq!(
            potion.id, "ground-instance-id",
            "ground item's instance id survived pickup"
        );
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
            give_item(&mut app, player, "elixir", 1);
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
            give_item(&mut app, player, "swift-tonic", 1);
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
