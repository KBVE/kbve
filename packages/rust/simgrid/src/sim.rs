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

use crate::blackjack;
use crate::data::KindRegistry;
use crate::grid::{GridPos, MoveSpeed, MoveTarget, WalkableMap};
use crate::net::Roster;
use crate::proto::{self, Dir, Input, ServerEvent, Tile};
use crate::rng::hash3;

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

pub const TRADE_RANGE: i32 = 1;
pub const TRADE_TIMEOUT_TICKS: u32 = SIM_TICK_HZ * 30;
pub const MAX_INVENTORY_SLOTS: usize = 28;

#[derive(Default, Clone)]
pub struct TradeSide {
    pub items: Vec<(String, u32)>,
    pub accepted: bool,
}

pub struct TradeSession {
    pub a: u16,
    pub b: u16,
    pub a_side: TradeSide,
    pub b_side: TradeSide,
    pub expires_tick: u32,
}

impl TradeSession {
    fn has(&self, slot: u16) -> bool {
        slot == self.a || slot == self.b
    }

    fn other(&self, slot: u16) -> u16 {
        if slot == self.a { self.b } else { self.a }
    }

    fn side(&self, slot: u16) -> &TradeSide {
        if slot == self.a {
            &self.a_side
        } else {
            &self.b_side
        }
    }

    fn side_mut(&mut self, slot: u16) -> &mut TradeSide {
        if slot == self.a {
            &mut self.a_side
        } else {
            &mut self.b_side
        }
    }
}

pub enum TradeInput {
    Offer {
        target: proto::EntityId,
        items: Vec<(String, u32)>,
    },
    Accept,
    Cancel,
}

#[derive(Resource, Default)]
pub struct PendingTrades(Vec<(proto::PlayerSlot, TradeInput)>);

#[derive(Resource, Default)]
pub struct ActiveTrades {
    sessions: Vec<TradeSession>,
}

impl ActiveTrades {
    fn index_of(&self, slot: u16) -> Option<usize> {
        self.sessions.iter().position(|s| s.has(slot))
    }
}

pub const COIN_REF: &str = "coin";
pub const GOLD_BAR_REF: &str = "gold-bar";
pub const GOLD_BAR_VALUE: u32 = 100;

/// Per-merchant stock: npc ref -> the item refs that merchant buys/sells.
#[derive(Resource, Default, Clone)]
pub struct ShopStock(pub HashMap<String, Vec<String>>);

/// Item economy: item ref -> (buy_price, sell_price) in coin units.
#[derive(Resource, Default, Clone)]
pub struct ItemPrices(pub HashMap<String, (u32, u32)>);

pub enum ShopInput {
    Buy {
        npc: proto::EntityId,
        item_ref: String,
        qty: u32,
    },
    Sell {
        npc: proto::EntityId,
        item_ref: String,
        qty: u32,
    },
}

#[derive(Resource, Default)]
pub struct PendingShop(Vec<(proto::PlayerSlot, ShopInput)>);

// ---- Multiplayer blackjack tables ----

pub const BJ_SEAT_CAP: usize = 5;
pub const BJ_MIN_BET: u32 = 1;
pub const BJ_PROXIMITY: i32 = 1;
pub const BJ_SPECTATE: i32 = 4;
pub const BJ_BET_TICKS: u32 = SIM_TICK_HZ * 20;
pub const BJ_TURN_TICKS: u32 = SIM_TICK_HZ * 20;
pub const BJ_SETTLE_TICKS: u32 = SIM_TICK_HZ * 5;
/// Grace window a vacated seat is reserved for the same player to reconnect into
/// before it is released back to the table.
pub const BJ_HOLD_TICKS: u32 = SIM_TICK_HZ * 30;
/// Window to buy insurance when the dealer shows an ace, before play begins.
pub const BJ_INSURANCE_TICKS: u32 = SIM_TICK_HZ * 10;
/// Most hands one seat can hold after splitting (original + up to three splits).
pub const BJ_MAX_HANDS: usize = 4;

/// A casino table the game crate exposes for blackjack. Generic so simgrid stays
/// game-agnostic; cryptothrone populates `Tables` at bootstrap.
#[derive(Clone)]
pub struct TableDef {
    pub table_ref: String,
    pub tile: Tile,
    pub seats: u8,
}

#[derive(Resource, Default, Clone)]
pub struct Tables(pub Vec<TableDef>);

#[derive(Clone, Copy, PartialEq, Eq)]
enum BjPhase {
    Betting,
    Insurance,
    PlayerTurn,
    DealerTurn,
    Settle,
}

impl BjPhase {
    fn as_str(self) -> &'static str {
        match self {
            BjPhase::Betting => "betting",
            BjPhase::Insurance => "insurance",
            BjPhase::PlayerTurn => "player_turn",
            BjPhase::DealerTurn => "dealer_turn",
            BjPhase::Settle => "settle",
        }
    }
}

/// One playable hand within a seat. A seat normally holds a single hand; splitting
/// adds siblings, each with its own bet, that are played and settled independently.
struct Hand {
    cards: Vec<u8>,
    bet: u32,
    natural: bool,
    doubled: bool,
    surrendered: bool,
    done: bool,
    outcome: Option<blackjack::Outcome>,
}

impl Hand {
    fn new(bet: u32) -> Self {
        Self {
            cards: Vec::new(),
            bet,
            natural: false,
            doubled: false,
            surrendered: false,
            done: false,
            outcome: None,
        }
    }
}

struct Seat {
    slot: u16,
    username: String,
    /// Main bet locked in during the betting window; each dealt/split hand stakes it.
    bet: u32,
    insurance: u32,
    hands: Vec<Hand>,
    /// Tick the player's entity vanished; `Some` means the seat is held open for a
    /// reconnect and the occupant is currently offline.
    disconnected_since: Option<u32>,
}

impl Seat {
    fn new(slot: u16, username: String) -> Self {
        Self {
            slot,
            username,
            bet: 0,
            insurance: 0,
            hands: Vec::new(),
            disconnected_since: None,
        }
    }

    fn reset_for_round(&mut self) {
        self.bet = 0;
        self.insurance = 0;
        self.hands.clear();
    }
}

struct TableSession {
    tile: Tile,
    shoe: Vec<u8>,
    dealer: Vec<u8>,
    phase: BjPhase,
    seats: Vec<Option<Seat>>,
    active_seat: usize,
    active_hand: usize,
    deadline_tick: u32,
    rng: blackjack::Rng,
    /// Provable fairness: the seed the current round's shoe was shuffled from and
    /// its published SHA-256 commitment. The seed is only revealed at settle.
    round_seed: u64,
    commitment: String,
}

impl TableSession {
    fn create(def: &TableDef, mut rng: blackjack::Rng, tick: u32) -> Self {
        let cap = (def.seats as usize).clamp(1, BJ_SEAT_CAP);
        let mut shoe = blackjack::build_shoe();
        blackjack::shuffle(&mut shoe, &mut rng);
        Self {
            tile: def.tile,
            shoe,
            dealer: Vec::new(),
            phase: BjPhase::Betting,
            seats: (0..cap).map(|_| None).collect(),
            active_seat: 0,
            active_hand: 0,
            deadline_tick: tick + BJ_BET_TICKS,
            rng,
            round_seed: 0,
            commitment: String::new(),
        }
    }

    fn occupied(&self) -> usize {
        self.seats.iter().filter(|s| s.is_some()).count()
    }

    fn seat_of(&self, slot: u16) -> Option<usize> {
        self.seats
            .iter()
            .position(|s| s.as_ref().map(|x| x.slot) == Some(slot))
    }

    fn first_free(&self) -> Option<usize> {
        self.seats.iter().position(|s| s.is_none())
    }

    /// A seat reserved for `username` whose occupant is offline, awaiting reconnect.
    fn held_seat_for(&mut self, username: &str) -> Option<&mut Seat> {
        self.seats.iter_mut().flatten().find(|s| {
            s.disconnected_since.is_some() && !s.username.is_empty() && s.username == username
        })
    }

    /// The `(seat, hand)` currently owing a decision, in seat-then-hand order.
    fn active(&self) -> Option<(usize, usize)> {
        for (si, slot) in self.seats.iter().enumerate() {
            let Some(seat) = slot else { continue };
            if seat.bet == 0 {
                continue;
            }
            for (hi, hand) in seat.hands.iter().enumerate() {
                if !hand.done {
                    return Some((si, hi));
                }
            }
        }
        None
    }

    fn participants(&self) -> usize {
        self.seats
            .iter()
            .filter(|s| matches!(s, Some(seat) if seat.bet > 0))
            .count()
    }

    fn dealer_upcard_ace(&self) -> bool {
        self.dealer
            .first()
            .map(|&c| blackjack::is_ace(c))
            .unwrap_or(false)
    }
}

enum BjInput {
    Join { table_ref: String },
    Leave,
    Bet { amount: u32 },
    Act { kind: proto::BjActionKind },
    Insure { amount: u32 },
}

#[derive(Resource, Default)]
pub struct PendingBlackjack(Vec<(proto::PlayerSlot, BjInput)>);

#[derive(Resource, Default)]
pub struct TableRegistry {
    sessions: HashMap<String, TableSession>,
}

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
        .insert_resource(PendingTrades::default())
        .insert_resource(ActiveTrades::default())
        .insert_resource(PendingShop::default())
        .insert_resource(ShopStock::default())
        .insert_resource(ItemPrices::default())
        .insert_resource(PendingBlackjack::default())
        .insert_resource(TableRegistry::default())
        .insert_resource(Tables::default())
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
            (
                drain_inputs,
                apply_actions,
                expire_trades,
                apply_trades,
                apply_shop,
                apply_blackjack,
            )
                .chain()
                .in_set(SimSet::Input),
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
    mut trades: ResMut<PendingTrades>,
    mut shop: ResMut<PendingShop>,
    mut blackjack_inputs: ResMut<PendingBlackjack>,
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
            match input {
                Input::Action { id, target } => actions.0.push((slot, id, target)),
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
                Input::Action { .. }
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

fn normalize_items(items: Vec<(String, u32)>) -> Vec<(String, u32)> {
    let mut out: Vec<(String, u32)> = Vec::new();
    for (r, n) in items {
        if n == 0 || r.is_empty() {
            continue;
        }
        if let Some(slot) = out.iter_mut().find(|(ir, _)| *ir == r) {
            slot.1 = slot.1.saturating_add(n);
        } else {
            out.push((r, n));
        }
    }
    out
}

fn inv_holds(inv: &Inventory, items: &[(String, u32)]) -> bool {
    items
        .iter()
        .all(|(r, n)| inv.slots.iter().any(|(ir, ic)| ir == r && ic >= n))
}

fn settle(
    inv: &Inventory,
    give: &[(String, u32)],
    recv: &[(String, u32)],
    cap: usize,
) -> Option<Vec<(String, u32)>> {
    let mut slots = inv.slots.clone();
    for (r, n) in give {
        let idx = slots.iter().position(|(ir, _)| ir == r)?;
        if slots[idx].1 < *n {
            return None;
        }
        slots[idx].1 -= *n;
        if slots[idx].1 == 0 {
            slots.remove(idx);
        }
    }
    for (r, n) in recv {
        if let Some(slot) = slots.iter_mut().find(|(ir, _)| ir == r) {
            slot.1 = slot.1.saturating_add(*n);
        } else {
            if slots.len() >= cap {
                return None;
            }
            slots.push((r.clone(), *n));
        }
    }
    Some(slots)
}

fn trade_payload(session: &TradeSession, slot: u16, status: &str) -> Vec<u8> {
    let you = session.side(slot);
    let them = session.side(session.other(slot));
    let map_items = |items: &[(String, u32)]| -> Vec<serde_json::Value> {
        items
            .iter()
            .map(|(r, c)| json!({ "ref": r, "count": c }))
            .collect()
    };
    json!({
        "status": status,
        "with": session.other(slot),
        "you": { "items": map_items(&you.items), "accepted": you.accepted },
        "them": { "items": map_items(&them.items), "accepted": them.accepted },
    })
    .to_string()
    .into_bytes()
}

fn send_trade(bcast: &Outbound, session: &TradeSession, status: &str) {
    for slot in [session.a, session.b] {
        let _ = bcast.tx.send(ServerEvent::Ephemeral {
            kind: proto::EPHEMERAL_TRADE,
            to: proto::PlayerSlot(slot),
            payload: trade_payload(session, slot, status),
        });
    }
}

fn send_trade_closed(bcast: &Outbound, slot: u16, status: &str) {
    let payload = json!({ "status": status }).to_string().into_bytes();
    let _ = bcast.tx.send(ServerEvent::Ephemeral {
        kind: proto::EPHEMERAL_TRADE,
        to: proto::PlayerSlot(slot),
        payload,
    });
}

fn expire_trades(
    mut trades: ResMut<ActiveTrades>,
    clock: Res<SimClock>,
    spawned: Res<SpawnedSlots>,
    bcast: Res<Outbound>,
) {
    if trades.sessions.is_empty() {
        return;
    }
    let now = clock.tick;
    let mut closed: Vec<(u16, u16)> = Vec::new();
    trades.sessions.retain(|s| {
        let present = spawned.by_slot.contains_key(&s.a) && spawned.by_slot.contains_key(&s.b);
        if present && now < s.expires_tick {
            true
        } else {
            closed.push((s.a, s.b));
            false
        }
    });
    for (a, b) in closed {
        send_trade_closed(&bcast, a, "cancelled");
        send_trade_closed(&bcast, b, "cancelled");
    }
}

#[allow(clippy::type_complexity)]
fn apply_trades(
    mut pending: ResMut<PendingTrades>,
    mut trades: ResMut<ActiveTrades>,
    clock: Res<SimClock>,
    bcast: Res<Outbound>,
    mut q: Query<(Entity, &PlayerSlotTag, &GridPos, &mut Inventory)>,
) {
    if pending.0.is_empty() {
        return;
    }

    let mut slot_of_entity: HashMap<u32, u16> = HashMap::new();
    let mut entity_of_slot: HashMap<u16, Entity> = HashMap::new();
    let mut tile_of_slot: HashMap<u16, Tile> = HashMap::new();
    for (entity, slot, pos, _) in q.iter() {
        slot_of_entity.insert(entity.index_u32(), slot.0.0);
        entity_of_slot.insert(slot.0.0, entity);
        tile_of_slot.insert(slot.0.0, pos.tile);
    }

    let adjacent = |a: u16, b: u16| -> bool {
        match (tile_of_slot.get(&a), tile_of_slot.get(&b)) {
            (Some(ta), Some(tb)) => ta.chebyshev(*tb) <= TRADE_RANGE,
            _ => false,
        }
    };

    let drained: Vec<_> = pending.0.drain(..).collect();
    for (slot, input) in drained {
        let me = slot.0;
        if !entity_of_slot.contains_key(&me) {
            continue;
        }
        match input {
            TradeInput::Offer { target, items } => {
                let Some(&partner) = slot_of_entity.get(&target.0).filter(|p| **p != me) else {
                    send_trade_closed(&bcast, me, "cancelled");
                    continue;
                };
                let items = normalize_items(items);
                let me_holds = entity_of_slot
                    .get(&me)
                    .and_then(|e| q.get(*e).ok())
                    .map(|(_, _, _, inv)| inv_holds(inv, &items))
                    .unwrap_or(false);
                if !adjacent(me, partner) || !me_holds {
                    send_trade_closed(&bcast, me, "cancelled");
                    continue;
                }
                if let Some(idx) = trades.index_of(me) {
                    if trades.sessions[idx].other(me) != partner {
                        send_trade_closed(&bcast, me, "cancelled");
                        continue;
                    }
                } else if trades.index_of(partner).is_some() {
                    send_trade_closed(&bcast, me, "cancelled");
                    continue;
                }
                let idx = match trades.index_of(me) {
                    Some(idx) => idx,
                    None => {
                        trades.sessions.push(TradeSession {
                            a: me,
                            b: partner,
                            a_side: TradeSide::default(),
                            b_side: TradeSide::default(),
                            expires_tick: clock.tick.saturating_add(TRADE_TIMEOUT_TICKS),
                        });
                        trades.sessions.len() - 1
                    }
                };
                let session = &mut trades.sessions[idx];
                session.a_side.accepted = false;
                session.b_side.accepted = false;
                session.side_mut(me).items = items;
                session.expires_tick = clock.tick.saturating_add(TRADE_TIMEOUT_TICKS);
                send_trade(&bcast, session, "update");
            }
            TradeInput::Accept => {
                let Some(idx) = trades.index_of(me) else {
                    continue;
                };
                let (a, b, a_items, b_items) = {
                    let s = &trades.sessions[idx];
                    (s.a, s.b, s.a_side.items.clone(), s.b_side.items.clone())
                };
                let a_holds = q
                    .get(entity_of_slot[&a])
                    .map(|(_, _, _, inv)| inv_holds(inv, &a_items))
                    .unwrap_or(false);
                let b_holds = q
                    .get(entity_of_slot[&b])
                    .map(|(_, _, _, inv)| inv_holds(inv, &b_items))
                    .unwrap_or(false);
                if !adjacent(a, b) || !a_holds || !b_holds {
                    let session = trades.sessions.remove(idx);
                    send_trade(&bcast, &session, "cancelled");
                    continue;
                }
                trades.sessions[idx].side_mut(me).accepted = true;
                if !(trades.sessions[idx].a_side.accepted && trades.sessions[idx].b_side.accepted) {
                    let session = &trades.sessions[idx];
                    send_trade(&bcast, session, "update");
                    continue;
                }
                let (ea, eb) = (entity_of_slot[&a], entity_of_slot[&b]);
                let inv_a = q.get(ea).map(|(.., inv)| inv.clone()).ok();
                let inv_b = q.get(eb).map(|(.., inv)| inv.clone()).ok();
                let (Some(inv_a), Some(inv_b)) = (inv_a, inv_b) else {
                    continue;
                };
                let new_a = settle(&inv_a, &a_items, &b_items, MAX_INVENTORY_SLOTS);
                let new_b = settle(&inv_b, &b_items, &a_items, MAX_INVENTORY_SLOTS);
                let (Some(new_a), Some(new_b)) = (new_a, new_b) else {
                    let session = trades.sessions.remove(idx);
                    send_trade(&bcast, &session, "cancelled");
                    continue;
                };
                if let Ok((.., mut inv)) = q.get_mut(ea) {
                    inv.slots = new_a;
                }
                if let Ok((.., mut inv)) = q.get_mut(eb) {
                    inv.slots = new_b;
                }
                let session = trades.sessions.remove(idx);
                send_trade(&bcast, &session, "completed");
                if let Ok((.., inv)) = q.get(ea) {
                    send_inventory(&bcast, proto::PlayerSlot(a), inv);
                }
                if let Ok((.., inv)) = q.get(eb) {
                    send_inventory(&bcast, proto::PlayerSlot(b), inv);
                }
            }
            TradeInput::Cancel => {
                if let Some(idx) = trades.index_of(me) {
                    let session = trades.sessions.remove(idx);
                    send_trade(&bcast, &session, "cancelled");
                }
            }
        }
    }
}

fn count_ref(inv: &Inventory, item_ref: &str) -> u32 {
    inv.slots
        .iter()
        .find(|(r, _)| r == item_ref)
        .map(|(_, c)| *c)
        .unwrap_or(0)
}

fn remove_ref(inv: &mut Inventory, item_ref: &str, qty: u32) -> bool {
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
fn coin_balance(inv: &Inventory) -> u32 {
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
fn spend_coins(inv: &mut Inventory, amount: u32) -> bool {
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
fn send_shop_result(
    bcast: &Outbound,
    slot: proto::PlayerSlot,
    action: &str,
    item_ref: &str,
    qty: u32,
    ok: bool,
    reason: &str,
    balance: u32,
) {
    let payload = json!({
        "action": action,
        "item_ref": item_ref,
        "qty": qty,
        "ok": ok,
        "reason": reason,
        "balance": balance,
    })
    .to_string()
    .into_bytes();
    let _ = bcast.tx.send(ServerEvent::Ephemeral {
        kind: proto::EPHEMERAL_SHOP,
        to: slot,
        payload,
    });
}

#[allow(clippy::type_complexity, clippy::too_many_arguments)]
fn apply_shop(
    mut pending: ResMut<PendingShop>,
    index: Res<EidIndex>,
    registry: Res<KindRegistry>,
    stock: Res<ShopStock>,
    prices: Res<ItemPrices>,
    bcast: Res<Outbound>,
    mut q_players: Query<(Entity, &PlayerSlotTag, &GridPos, &mut Inventory)>,
    q_npcs: Query<(&GridPos, &EntityKind), Without<PlayerSlotTag>>,
) {
    if pending.0.is_empty() {
        return;
    }

    let mut by_slot: HashMap<u16, Entity> = HashMap::new();
    for (entity, slot, ..) in q_players.iter() {
        by_slot.insert(slot.0.0, entity);
    }

    for (slot, input) in pending.0.drain(..) {
        let (is_buy, npc, item_ref, qty) = match input {
            ShopInput::Buy { npc, item_ref, qty } => (true, npc, item_ref, qty),
            ShopInput::Sell { npc, item_ref, qty } => (false, npc, item_ref, qty),
        };
        let action = if is_buy { "buy" } else { "sell" };
        let reject = |bcast: &Outbound, reason: &str, balance: u32| {
            send_shop_result(bcast, slot, action, &item_ref, qty, false, reason, balance);
        };

        if qty == 0 {
            reject(&bcast, "bad_qty", 0);
            continue;
        }
        let Some(&player_entity) = by_slot.get(&slot.0) else {
            continue;
        };
        let Some(npc_entity) = index.by_eid.get(&npc.0).copied() else {
            reject(&bcast, "no_merchant", 0);
            continue;
        };
        let Ok((npc_pos, npc_kind)) = q_npcs.get(npc_entity) else {
            reject(&bcast, "no_merchant", 0);
            continue;
        };
        let npc_tile = npc_pos.tile;
        let Some(npc_ref) = registry.ref_of(npc_kind.0).map(str::to_string) else {
            reject(&bcast, "no_merchant", 0);
            continue;
        };
        let Some(stocked) = stock.0.get(&npc_ref) else {
            reject(&bcast, "not_a_merchant", 0);
            continue;
        };
        let Some(&(buy_price, sell_price)) = prices.0.get(&item_ref) else {
            reject(&bcast, "no_price", 0);
            continue;
        };

        let Ok((_, _, pos, mut inv)) = q_players.get_mut(player_entity) else {
            continue;
        };
        if pos.tile.chebyshev(npc_tile) > TRADE_RANGE {
            reject(&bcast, "too_far", coin_balance(&inv));
            continue;
        }

        if is_buy {
            if !stocked.iter().any(|r| r == &item_ref) {
                reject(&bcast, "out_of_stock", coin_balance(&inv));
                continue;
            }
            if buy_price == 0 {
                reject(&bcast, "not_for_sale", coin_balance(&inv));
                continue;
            }
            let total = buy_price.saturating_mul(qty);
            if coin_balance(&inv) < total {
                reject(&bcast, "insufficient", coin_balance(&inv));
                continue;
            }
            spend_coins(&mut inv, total);
            inv.add(&item_ref, qty);
        } else {
            if sell_price == 0 {
                reject(&bcast, "not_sellable", coin_balance(&inv));
                continue;
            }
            if count_ref(&inv, &item_ref) < qty {
                reject(&bcast, "no_item", coin_balance(&inv));
                continue;
            }
            remove_ref(&mut inv, &item_ref, qty);
            inv.add(COIN_REF, sell_price.saturating_mul(qty));
        }

        let balance = coin_balance(&inv);
        send_shop_result(&bcast, slot, action, &item_ref, qty, true, "", balance);
        send_inventory(&bcast, slot, &inv);
    }
}

fn table_salt(table_ref: &str) -> u64 {
    let mut h: u64 = 0xcbf2_9ce4_8422_2325;
    for b in table_ref.bytes() {
        h ^= b as u64;
        h = h.wrapping_mul(0x0100_0000_01b3);
    }
    h
}

type PlayerQuery<'w, 's> = Query<
    'w,
    's,
    (
        Entity,
        &'static PlayerSlotTag,
        &'static GridPos,
        &'static mut Inventory,
    ),
>;

/// Credit coins back to a player's live inventory and resync it.
fn credit_coins(
    q: &mut PlayerQuery<'_, '_>,
    entity: Entity,
    bcast: &Outbound,
    slot: u16,
    amount: u32,
) {
    if amount == 0 {
        return;
    }
    if let Ok((_, _, _, mut inv)) = q.get_mut(entity) {
        inv.add(COIN_REF, amount);
        send_inventory(bcast, proto::PlayerSlot(slot), &inv);
    }
}

#[allow(clippy::type_complexity, clippy::too_many_arguments)]
fn apply_blackjack(
    mut pending: ResMut<PendingBlackjack>,
    mut reg: ResMut<TableRegistry>,
    tables: Res<Tables>,
    roster: Res<RosterHandle>,
    seed: Res<SimSeed>,
    clock: Res<SimClock>,
    bcast: Res<Outbound>,
    mut q: PlayerQuery<'_, '_>,
) {
    let tick = clock.tick;

    let mut entity_of: HashMap<u16, Entity> = HashMap::new();
    let mut tile_of: HashMap<u16, Tile> = HashMap::new();
    for (entity, slot, pos, _inv) in q.iter() {
        entity_of.insert(slot.0.0, entity);
        tile_of.insert(slot.0.0, pos.tile);
    }

    // ---- Intent pass ----
    for (pslot, input) in pending.0.drain(..) {
        let slot = pslot.0;
        match input {
            BjInput::Join { table_ref } => {
                if reg.sessions.values().any(|s| s.seat_of(slot).is_some()) {
                    continue;
                }
                let Some(def) = tables.0.iter().find(|d| d.table_ref == table_ref) else {
                    continue;
                };
                let username = roster
                    .0
                    .read()
                    .ok()
                    .and_then(|r| r.username(pslot))
                    .unwrap_or_default();
                // Reclaiming a seat held open from a disconnect skips the proximity
                // gate — a reconnecting player respawns away from the table but was
                // already seated. Fresh seating still requires being adjacent.
                if let Some(seat) = reg
                    .sessions
                    .get_mut(&table_ref)
                    .and_then(|s| s.held_seat_for(&username))
                {
                    seat.slot = slot;
                    seat.disconnected_since = None;
                    continue;
                }
                let Some(&ptile) = tile_of.get(&slot) else {
                    continue;
                };
                if ptile.chebyshev(def.tile) > BJ_PROXIMITY {
                    continue;
                }
                let salt = table_salt(&table_ref);
                let session = reg.sessions.entry(table_ref.clone()).or_insert_with(|| {
                    TableSession::create(def, blackjack::Rng::seed(seed.0, salt, tick as u64), tick)
                });
                if let Some(i) = session.first_free() {
                    session.seats[i] = Some(Seat::new(slot, username));
                }
            }
            BjInput::Leave => {
                leave_seat(&mut reg, &mut q, &entity_of, &bcast, slot);
            }
            BjInput::Bet { amount } => {
                let Some(session) = reg
                    .sessions
                    .values_mut()
                    .find(|s| s.seat_of(slot).is_some())
                else {
                    continue;
                };
                if session.phase != BjPhase::Betting {
                    continue;
                }
                let i = session.seat_of(slot).unwrap();
                if session.seats[i].as_ref().unwrap().bet > 0 {
                    continue;
                }
                let Some(&entity) = entity_of.get(&slot) else {
                    continue;
                };
                let Ok((_, _, _, mut inv)) = q.get_mut(entity) else {
                    continue;
                };
                let held = coin_balance(&inv);
                if held < BJ_MIN_BET {
                    continue;
                }
                let stake = amount.clamp(BJ_MIN_BET, held);
                if !spend_coins(&mut inv, stake) {
                    continue;
                }
                session.seats[i].as_mut().unwrap().bet = stake;
                send_inventory(&bcast, pslot, &inv);
            }
            BjInput::Act { kind } => {
                handle_bj_action(&mut reg, &mut q, &entity_of, &bcast, slot, kind);
            }
            BjInput::Insure { amount } => {
                handle_bj_insurance(&mut reg, &mut q, &entity_of, &bcast, slot, amount);
            }
        }
    }

    // ---- Disconnect sweep: hold a vacated seat for the same player to reconnect
    // into; release it (forfeiting any live bet) once the grace window lapses.
    // Anonymous seats can't be name-matched on reconnect, so they drop at once. ----
    let name_of: HashMap<u16, String> = {
        let guard = roster.0.read().ok();
        entity_of
            .keys()
            .filter_map(|&s| {
                guard
                    .as_ref()
                    .and_then(|g| g.username(proto::PlayerSlot(s)))
                    .map(|n| (s, n))
            })
            .collect()
    };
    for session in reg.sessions.values_mut() {
        for slot_opt in session.seats.iter_mut() {
            let Some(seat) = slot_opt.as_mut() else {
                continue;
            };
            // A live entity at the seat's slot only counts if it is the same player;
            // a slot reassigned to someone else must not silently inherit the seat.
            let present = entity_of.contains_key(&seat.slot)
                && name_of.get(&seat.slot) == Some(&seat.username);
            if present {
                seat.disconnected_since = None;
                continue;
            }
            let release = if seat.username.is_empty() {
                true
            } else {
                match seat.disconnected_since {
                    None => {
                        // Park the seat: detach the stale slot so a reused slot can't
                        // route this table's state or be mistaken for the occupant.
                        seat.disconnected_since = Some(tick);
                        seat.slot = proto::PLAYER_SLOT_NONE.0;
                        false
                    }
                    Some(since) => tick.saturating_sub(since) >= BJ_HOLD_TICKS,
                }
            };
            if release {
                *slot_opt = None;
            }
        }
    }

    // ---- Per-tick phase driver ----
    for session in reg.sessions.values_mut() {
        advance_bj_phase(session, tick, &mut q, &entity_of, &bcast);
    }

    // ---- Teardown empty tables ----
    reg.sessions.retain(|_, s| s.occupied() > 0);

    // ---- Scoped broadcast ----
    let mut balance_of: HashMap<u16, u32> = HashMap::new();
    for (_, slot, _, inv) in q.iter() {
        balance_of.insert(slot.0.0, coin_balance(inv));
    }
    for (table_ref, session) in reg.sessions.iter() {
        let mut recipients: Vec<u16> = session
            .seats
            .iter()
            .filter_map(|s| s.as_ref().map(|x| x.slot))
            .collect();
        for (&slot, &tile) in tile_of.iter() {
            if tile.chebyshev(session.tile) <= BJ_SPECTATE && !recipients.contains(&slot) {
                recipients.push(slot);
            }
        }
        for slot in recipients {
            let balance = balance_of.get(&slot).copied().unwrap_or(0);
            send_blackjack(&bcast, table_ref, session, slot, balance, tick);
        }
    }
}

fn leave_seat(
    reg: &mut TableRegistry,
    q: &mut PlayerQuery<'_, '_>,
    entity_of: &HashMap<u16, Entity>,
    bcast: &Outbound,
    slot: u16,
) {
    let Some(session) = reg
        .sessions
        .values_mut()
        .find(|s| s.seat_of(slot).is_some())
    else {
        return;
    };
    let i = session.seat_of(slot).unwrap();
    let Some(seat) = session.seats[i].take() else {
        return;
    };
    // Refund only when the round hasn't been dealt yet (betting window).
    if session.phase == BjPhase::Betting
        && seat.bet > 0
        && let Some(&entity) = entity_of.get(&slot)
    {
        credit_coins(q, entity, bcast, slot, seat.bet);
    }
}

fn handle_bj_insurance(
    reg: &mut TableRegistry,
    q: &mut PlayerQuery<'_, '_>,
    entity_of: &HashMap<u16, Entity>,
    bcast: &Outbound,
    slot: u16,
    amount: u32,
) {
    let Some(session) = reg
        .sessions
        .values_mut()
        .find(|s| s.seat_of(slot).is_some())
    else {
        return;
    };
    if session.phase != BjPhase::Insurance {
        return;
    }
    let i = session.seat_of(slot).unwrap();
    let seat = session.seats[i].as_ref().unwrap();
    // Insurance is a one-time side bet, capped at half the main bet.
    if seat.bet == 0 || seat.insurance > 0 {
        return;
    }
    let cap = seat.bet / 2;
    if cap == 0 {
        return;
    }
    let Some(&entity) = entity_of.get(&slot) else {
        return;
    };
    let Ok((_, _, _, mut inv)) = q.get_mut(entity) else {
        return;
    };
    let stake = amount.min(cap).min(coin_balance(&inv));
    if stake == 0 || !spend_coins(&mut inv, stake) {
        return;
    }
    send_inventory(bcast, proto::PlayerSlot(slot), &inv);
    session.seats[i].as_mut().unwrap().insurance = stake;
}

fn handle_bj_action(
    reg: &mut TableRegistry,
    q: &mut PlayerQuery<'_, '_>,
    entity_of: &HashMap<u16, Entity>,
    bcast: &Outbound,
    slot: u16,
    kind: proto::BjActionKind,
) {
    let Some(session) = reg
        .sessions
        .values_mut()
        .find(|s| s.seat_of(slot).is_some())
    else {
        return;
    };
    if session.phase != BjPhase::PlayerTurn {
        return;
    }
    // Only the player owning the active seat may act, and only on its active hand.
    let Some((si, hi)) = session.active() else {
        return;
    };
    if session.seats[si].as_ref().unwrap().slot != slot {
        return;
    }
    match kind {
        proto::BjActionKind::Hit => {
            let card = blackjack::draw(&mut session.shoe, &mut session.rng);
            let hand = &mut session.seats[si].as_mut().unwrap().hands[hi];
            hand.cards.push(card);
            if blackjack::value_hand(&hand.cards).0 >= 21 {
                hand.done = true;
            }
        }
        proto::BjActionKind::Stand => {
            session.seats[si].as_mut().unwrap().hands[hi].done = true;
        }
        proto::BjActionKind::Double => {
            let bet = {
                let hand = &session.seats[si].as_ref().unwrap().hands[hi];
                if hand.cards.len() != 2 || hand.doubled {
                    return;
                }
                hand.bet
            };
            if !try_debit(q, entity_of, bcast, slot, bet) {
                return;
            }
            let card = blackjack::draw(&mut session.shoe, &mut session.rng);
            let hand = &mut session.seats[si].as_mut().unwrap().hands[hi];
            hand.bet = hand.bet.saturating_add(bet);
            hand.doubled = true;
            hand.cards.push(card);
            hand.done = true;
        }
        proto::BjActionKind::Split => {
            let bet = {
                let seat = session.seats[si].as_ref().unwrap();
                if seat.hands.len() >= BJ_MAX_HANDS {
                    return;
                }
                let hand = &seat.hands[hi];
                if !blackjack::can_split(&hand.cards) {
                    return;
                }
                hand.bet
            };
            if !try_debit(q, entity_of, bcast, slot, bet) {
                return;
            }
            let moved = session.seats[si].as_mut().unwrap().hands[hi]
                .cards
                .pop()
                .unwrap();
            let aces = blackjack::is_ace(session.seats[si].as_ref().unwrap().hands[hi].cards[0]);
            let card_a = blackjack::draw(&mut session.shoe, &mut session.rng);
            let card_b = blackjack::draw(&mut session.shoe, &mut session.rng);
            let seat = session.seats[si].as_mut().unwrap();
            seat.hands[hi].cards.push(card_a);
            let mut split_hand = Hand::new(bet);
            split_hand.cards.push(moved);
            split_hand.cards.push(card_b);
            // Split aces draw a single card each and stand automatically.
            if aces {
                seat.hands[hi].done = true;
                split_hand.done = true;
            }
            seat.hands.insert(hi + 1, split_hand);
        }
        proto::BjActionKind::Surrender => {
            // Late surrender: only the untouched original hand, never after a split.
            let bet = {
                let seat = session.seats[si].as_ref().unwrap();
                if seat.hands.len() != 1 {
                    return;
                }
                let hand = &seat.hands[0];
                if hand.cards.len() != 2 || hand.doubled || hand.natural {
                    return;
                }
                hand.bet
            };
            let refund = blackjack::surrender_credit(bet);
            if refund > 0
                && let Some(&entity) = entity_of.get(&slot)
            {
                credit_coins(q, entity, bcast, slot, refund);
            }
            let hand = &mut session.seats[si].as_mut().unwrap().hands[0];
            hand.surrendered = true;
            hand.outcome = Some(blackjack::Outcome::Loss);
            hand.done = true;
        }
    }
    // The phase driver resets the turn clock once the active hand changes.
}

/// Debit `amount` coins from the player's inventory, pushing an inventory sync on
/// success. Returns false (and changes nothing) if they can't cover it.
fn try_debit(
    q: &mut PlayerQuery<'_, '_>,
    entity_of: &HashMap<u16, Entity>,
    bcast: &Outbound,
    slot: u16,
    amount: u32,
) -> bool {
    let Some(&entity) = entity_of.get(&slot) else {
        return false;
    };
    let Ok((_, _, _, mut inv)) = q.get_mut(entity) else {
        return false;
    };
    if coin_balance(&inv) < amount || !spend_coins(&mut inv, amount) {
        return false;
    }
    send_inventory(bcast, proto::PlayerSlot(slot), &inv);
    true
}

fn start_player_turn(session: &mut TableSession, tick: u32) {
    session.phase = BjPhase::PlayerTurn;
    let (si, hi) = session.active().unwrap_or((0, 0));
    session.active_seat = si;
    session.active_hand = hi;
    session.deadline_tick = tick + BJ_TURN_TICKS;
}

/// Settle every live hand against the dealer's final hand and pay out per seat.
/// Hands already carrying an outcome (surrenders) are left untouched.
fn settle_bj_round(
    session: &mut TableSession,
    q: &mut PlayerQuery<'_, '_>,
    entity_of: &HashMap<u16, Entity>,
    bcast: &Outbound,
) {
    let dealer = session.dealer.clone();
    let dealer_natural = blackjack::is_blackjack(&dealer);
    for i in 0..session.seats.len() {
        let Some(slot) = session.seats[i]
            .as_ref()
            .and_then(|s| (s.bet > 0).then_some(s.slot))
        else {
            continue;
        };
        let mut credit = 0u32;
        let hands_len = session.seats[i].as_ref().unwrap().hands.len();
        for hi in 0..hands_len {
            let (bet, natural, cards, settled) = {
                let hand = &session.seats[i].as_ref().unwrap().hands[hi];
                (
                    hand.bet,
                    hand.natural,
                    hand.cards.clone(),
                    hand.outcome.is_some(),
                )
            };
            if settled {
                continue;
            }
            let outcome = blackjack::settle(&cards, &dealer, natural);
            credit = credit.saturating_add(blackjack::payout_credit(bet, outcome));
            let hand = &mut session.seats[i].as_mut().unwrap().hands[hi];
            hand.outcome = Some(outcome);
            hand.done = true;
        }
        // Insurance pays 2:1 when the dealer turned a natural.
        let insurance = session.seats[i].as_ref().unwrap().insurance;
        if insurance > 0 {
            credit = credit.saturating_add(blackjack::insurance_credit(insurance, dealer_natural));
        }
        if credit > 0
            && let Some(&entity) = entity_of.get(&slot)
        {
            credit_coins(q, entity, bcast, slot, credit);
        }
    }
}

fn advance_bj_phase(
    session: &mut TableSession,
    tick: u32,
    q: &mut PlayerQuery<'_, '_>,
    entity_of: &HashMap<u16, Entity>,
    bcast: &Outbound,
) {
    match session.phase {
        BjPhase::Betting => {
            if tick < session.deadline_tick {
                return;
            }
            if session.participants() == 0 {
                session.deadline_tick = tick + BJ_BET_TICKS;
                return;
            }
            // Provable fairness: draw a fresh round seed, build the shoe solely from
            // it, and publish its commitment before any card is dealt. The seed is
            // revealed at settle so clients can replay this exact shoe.
            session.round_seed = session.rng.next_u64();
            session.commitment = blackjack::commit_seed(session.round_seed);
            session.shoe = blackjack::shoe_for_seed(session.round_seed);
            session.dealer.clear();
            for i in 0..session.seats.len() {
                let bet = {
                    let Some(seat) = session.seats[i].as_mut() else {
                        continue;
                    };
                    seat.hands.clear();
                    seat.insurance = 0;
                    seat.bet
                };
                if bet == 0 {
                    continue;
                }
                let c1 = blackjack::draw(&mut session.shoe, &mut session.rng);
                let c2 = blackjack::draw(&mut session.shoe, &mut session.rng);
                let mut hand = Hand::new(bet);
                hand.cards.push(c1);
                hand.cards.push(c2);
                hand.natural = blackjack::is_blackjack(&hand.cards);
                hand.done = hand.natural;
                session.seats[i].as_mut().unwrap().hands.push(hand);
            }
            let d1 = blackjack::draw(&mut session.shoe, &mut session.rng);
            let d2 = blackjack::draw(&mut session.shoe, &mut session.rng);
            session.dealer.push(d1);
            session.dealer.push(d2);
            // Offer insurance only when the dealer's upcard is an ace.
            if session.dealer_upcard_ace() {
                session.phase = BjPhase::Insurance;
                session.deadline_tick = tick + BJ_INSURANCE_TICKS;
            } else {
                start_player_turn(session, tick);
            }
        }
        BjPhase::Insurance => {
            if tick < session.deadline_tick {
                return;
            }
            // Window closed — peek the hole card. A dealer natural ends the round now;
            // insurance (and any player naturals) settle, everyone else loses.
            if blackjack::is_blackjack(&session.dealer) {
                settle_bj_round(session, q, entity_of, bcast);
                session.phase = BjPhase::Settle;
                session.deadline_tick = tick + BJ_SETTLE_TICKS;
            } else {
                start_player_turn(session, tick);
            }
        }
        BjPhase::PlayerTurn => match session.active() {
            None => {
                session.phase = BjPhase::DealerTurn;
            }
            Some((si, hi)) => {
                if (si, hi) != (session.active_seat, session.active_hand) {
                    session.active_seat = si;
                    session.active_hand = hi;
                    session.deadline_tick = tick + BJ_TURN_TICKS;
                } else if tick >= session.deadline_tick {
                    session.seats[si].as_mut().unwrap().hands[hi].done = true;
                }
            }
        },
        BjPhase::DealerTurn => {
            blackjack::play_dealer(&mut session.dealer, &mut session.shoe, &mut session.rng);
            settle_bj_round(session, q, entity_of, bcast);
            session.phase = BjPhase::Settle;
            session.deadline_tick = tick + BJ_SETTLE_TICKS;
        }
        BjPhase::Settle => {
            if tick >= session.deadline_tick {
                session.dealer.clear();
                for seat in session.seats.iter_mut().flatten() {
                    seat.reset_for_round();
                }
                session.phase = BjPhase::Betting;
                session.active_seat = 0;
                session.active_hand = 0;
                session.deadline_tick = tick + BJ_BET_TICKS;
            }
        }
    }
}

fn send_blackjack(
    bcast: &Outbound,
    table_ref: &str,
    session: &TableSession,
    slot: u16,
    your_balance: u32,
    tick: u32,
) {
    let dealer_hidden = matches!(
        session.phase,
        BjPhase::Betting | BjPhase::Insurance | BjPhase::PlayerTurn
    );
    let dealer_hand: Vec<u8> = if dealer_hidden {
        session.dealer.iter().take(1).copied().collect()
    } else {
        session.dealer.clone()
    };
    let seats: Vec<_> = session
        .seats
        .iter()
        .filter_map(|s| s.as_ref())
        .map(|seat| {
            let hands: Vec<_> = seat
                .hands
                .iter()
                .map(|hand| {
                    let (value, soft) = blackjack::value_hand(&hand.cards);
                    json!({
                        "cards": hand.cards,
                        "bet": hand.bet,
                        "value": value,
                        "soft": soft,
                        "doubled": hand.doubled,
                        "surrendered": hand.surrendered,
                        "done": hand.done,
                        "outcome": hand.outcome.map(|o| o.as_str()),
                    })
                })
                .collect();
            json!({
                "slot": seat.slot,
                "username": seat.username,
                "bet": seat.bet,
                "insurance": seat.insurance,
                "hands": hands,
                "disconnected": seat.disconnected_since.is_some(),
            })
        })
        .collect();
    let active = (session.phase == BjPhase::PlayerTurn)
        .then(|| session.active())
        .flatten();
    let active_slot = active.map(|(si, _)| session.seats[si].as_ref().unwrap().slot);
    let active_hand = active.map(|(_, hi)| hi);
    let deadline_ms = session
        .deadline_tick
        .saturating_sub(tick)
        .saturating_mul(1000 / SIM_TICK_HZ);
    // Reveal the seed only once the round is over; until then clients hold the
    // commitment and verify it against the seed after settle.
    let revealed_seed = (session.phase == BjPhase::Settle && !session.commitment.is_empty())
        .then(|| session.round_seed.to_string());
    let payload = json!({
        "table_ref": table_ref,
        "phase": session.phase.as_str(),
        "seats": seats,
        "dealer_hand": dealer_hand,
        "dealer_hidden": dealer_hidden,
        "active_slot": active_slot,
        "active_hand": active_hand,
        "your_balance": your_balance,
        "deadline_ms": deadline_ms,
        "commitment": session.commitment,
        "seed": revealed_seed,
    })
    .to_string()
    .into_bytes();
    let _ = bcast.tx.send(ServerEvent::Ephemeral {
        kind: proto::EPHEMERAL_BLACKJACK,
        to: proto::PlayerSlot(slot),
        payload,
    });
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

    fn player_for_slot(app: &mut App, slot: proto::PlayerSlot) -> Entity {
        let mut q = app.world_mut().query::<(Entity, &PlayerSlotTag)>();
        q.iter(app.world())
            .find(|(_, s)| s.0 == slot)
            .map(|(e, _)| e)
            .expect("player for slot")
    }

    fn set_inventory(app: &mut App, entity: Entity, items: &[(&str, u32)]) {
        let mut inv = app.world_mut().get_mut::<Inventory>(entity).unwrap();
        inv.slots = items.iter().map(|(r, c)| (r.to_string(), *c)).collect();
    }

    fn inv_count(app: &App, entity: Entity, item_ref: &str) -> u32 {
        app.world()
            .get::<Inventory>(entity)
            .unwrap()
            .slots
            .iter()
            .find(|(r, _)| r == item_ref)
            .map(|(_, c)| *c)
            .unwrap_or(0)
    }

    fn eid_of(app: &mut App, slot: proto::PlayerSlot) -> proto::EntityId {
        proto::EntityId(player_for_slot(app, slot).index_u32())
    }

    /// Both players offer, both accept, and the offered items swap atomically.
    #[test]
    fn trade_offer_accept_swaps_items() {
        let (mut app, _rx, input_tx, roster) = harness(101);
        let a = join(&roster, "alice");
        let b = join(&roster, "bob");
        app.update();

        let ea = player_for_slot(&mut app, a);
        let eb = player_for_slot(&mut app, b);
        set_inventory(&mut app, ea, &[("coin", 5)]);
        set_inventory(&mut app, eb, &[("gold-bar", 3)]);
        let a_eid = eid_of(&mut app, a);
        let b_eid = eid_of(&mut app, b);

        input_tx
            .send((
                a,
                Input::TradeOffer {
                    target: b_eid,
                    items: vec![("coin".into(), 2)],
                },
            ))
            .unwrap();
        input_tx
            .send((
                b,
                Input::TradeOffer {
                    target: a_eid,
                    items: vec![("gold-bar".into(), 1)],
                },
            ))
            .unwrap();
        input_tx.send((a, Input::TradeAccept)).unwrap();
        input_tx.send((b, Input::TradeAccept)).unwrap();
        for _ in 0..3 {
            app.update();
        }

        assert_eq!(inv_count(&app, ea, "coin"), 3, "alice coin not debited");
        assert_eq!(
            inv_count(&app, ea, "gold-bar"),
            1,
            "alice gold not credited"
        );
        assert_eq!(inv_count(&app, eb, "coin"), 2, "bob coin not credited");
        assert_eq!(inv_count(&app, eb, "gold-bar"), 2, "bob gold not debited");
        assert!(
            app.world().resource::<ActiveTrades>().sessions.is_empty(),
            "session lingered after completion"
        );
    }

    /// A cancel from either party tears the session down with no transfer.
    #[test]
    fn trade_cancel_aborts_without_transfer() {
        let (mut app, _rx, input_tx, roster) = harness(102);
        let a = join(&roster, "alice");
        let b = join(&roster, "bob");
        app.update();

        let ea = player_for_slot(&mut app, a);
        let eb = player_for_slot(&mut app, b);
        set_inventory(&mut app, ea, &[("coin", 5)]);
        set_inventory(&mut app, eb, &[("gold-bar", 3)]);
        let a_eid = eid_of(&mut app, a);
        let b_eid = eid_of(&mut app, b);

        input_tx
            .send((
                a,
                Input::TradeOffer {
                    target: b_eid,
                    items: vec![("coin".into(), 2)],
                },
            ))
            .unwrap();
        input_tx
            .send((
                b,
                Input::TradeOffer {
                    target: a_eid,
                    items: vec![("gold-bar".into(), 1)],
                },
            ))
            .unwrap();
        input_tx.send((a, Input::TradeAccept)).unwrap();
        input_tx.send((b, Input::TradeCancel)).unwrap();
        for _ in 0..3 {
            app.update();
        }

        assert_eq!(inv_count(&app, ea, "coin"), 5, "alice coin changed");
        assert_eq!(inv_count(&app, eb, "gold-bar"), 3, "bob gold changed");
        assert_eq!(inv_count(&app, ea, "gold-bar"), 0, "alice got gold");
        assert!(
            app.world().resource::<ActiveTrades>().sessions.is_empty(),
            "session survived cancel"
        );
    }

    /// A disconnect mid-trade cancels the session; no items are lost or duped.
    #[test]
    fn trade_disconnect_mid_trade_cancels() {
        let (mut app, _rx, input_tx, roster) = harness(103);
        let a = join(&roster, "alice");
        let b = join(&roster, "bob");
        app.update();

        let ea = player_for_slot(&mut app, a);
        let eb = player_for_slot(&mut app, b);
        set_inventory(&mut app, ea, &[("coin", 5)]);
        set_inventory(&mut app, eb, &[("gold-bar", 3)]);
        let a_eid = eid_of(&mut app, a);
        let b_eid = eid_of(&mut app, b);

        input_tx
            .send((
                a,
                Input::TradeOffer {
                    target: b_eid,
                    items: vec![("coin".into(), 2)],
                },
            ))
            .unwrap();
        input_tx
            .send((
                b,
                Input::TradeOffer {
                    target: a_eid,
                    items: vec![("gold-bar".into(), 1)],
                },
            ))
            .unwrap();
        app.update();
        assert_eq!(
            app.world().resource::<ActiveTrades>().sessions.len(),
            1,
            "session not opened"
        );

        roster.write().unwrap().release(b);
        for _ in 0..3 {
            app.update();
        }

        assert!(
            app.world().resource::<ActiveTrades>().sessions.is_empty(),
            "session not cancelled on disconnect"
        );
        assert_eq!(
            inv_count(&app, ea, "coin"),
            5,
            "alice lost coin on disconnect"
        );
        assert_eq!(inv_count(&app, ea, "gold-bar"), 0, "alice duped gold");
    }

    /// A trade that would overflow the recipient's inventory is rejected whole.
    #[test]
    fn trade_full_inventory_rejected() {
        let (mut app, _rx, input_tx, roster) = harness(104);
        let a = join(&roster, "alice");
        let b = join(&roster, "bob");
        app.update();

        let ea = player_for_slot(&mut app, a);
        let eb = player_for_slot(&mut app, b);
        set_inventory(&mut app, ea, &[("coin", 5)]);
        let full: Vec<(String, u32)> = (0..MAX_INVENTORY_SLOTS)
            .map(|i| (format!("item{i}"), 1))
            .collect();
        {
            let mut inv = app.world_mut().get_mut::<Inventory>(eb).unwrap();
            inv.slots = full;
        }
        let b_eid = eid_of(&mut app, b);

        input_tx
            .send((
                a,
                Input::TradeOffer {
                    target: b_eid,
                    items: vec![("coin".into(), 2)],
                },
            ))
            .unwrap();
        input_tx.send((a, Input::TradeAccept)).unwrap();
        input_tx.send((b, Input::TradeAccept)).unwrap();
        for _ in 0..3 {
            app.update();
        }

        assert_eq!(
            inv_count(&app, ea, "coin"),
            5,
            "alice debited on rejected trade"
        );
        assert_eq!(
            inv_count(&app, eb, "coin"),
            0,
            "coin forced into full inventory"
        );
        assert_eq!(
            app.world().get::<Inventory>(eb).unwrap().slots.len(),
            MAX_INVENTORY_SLOTS,
            "bob inventory mutated by rejected trade"
        );
        assert!(
            app.world().resource::<ActiveTrades>().sessions.is_empty(),
            "rejected trade left a session"
        );
    }

    /// Spawn a merchant entity adjacent to spawn and stock it; returns its eid.
    fn spawn_merchant(app: &mut App, tile: Tile, stock: &[&str]) -> proto::EntityId {
        let kind = app
            .world()
            .resource::<KindRegistry>()
            .kind_of("training-dummy")
            .expect("training-dummy kind");
        let entity = app
            .world_mut()
            .spawn((
                EntityKind(kind),
                GridPos::at(tile),
                MoveTarget::default(),
                MoveSpeed { ticks_per_tile: 2 },
            ))
            .id();
        app.world_mut().resource_mut::<ShopStock>().0.insert(
            "training-dummy".to_string(),
            stock.iter().map(|s| s.to_string()).collect(),
        );
        app.update();
        proto::EntityId(entity.index_u32())
    }

    fn set_prices(app: &mut App, prices: &[(&str, u32, u32)]) {
        let mut p = app.world_mut().resource_mut::<ItemPrices>();
        for (r, buy, sell) in prices {
            p.0.insert(r.to_string(), (*buy, *sell));
        }
    }

    #[test]
    fn shop_buy_deducts_coin_and_grants_item() {
        let (mut app, _rx, input_tx, roster) = harness(201);
        let slot = join(&roster, "buyer");
        app.update();
        let player = player_for_slot(&mut app, slot);
        set_inventory(&mut app, player, &[("coin", 10)]);
        set_prices(&mut app, &[("potion", 5, 2)]);
        let npc = spawn_merchant(&mut app, Tile::new(8, 8), &["potion"]);

        input_tx
            .send((
                slot,
                Input::BuyItem {
                    npc,
                    item_ref: "potion".into(),
                    qty: 1,
                },
            ))
            .unwrap();
        for _ in 0..3 {
            app.update();
        }
        assert_eq!(inv_count(&app, player, "coin"), 5, "coin not deducted");
        assert_eq!(inv_count(&app, player, "potion"), 1, "item not granted");
    }

    #[test]
    fn shop_buy_insufficient_coin_rejected() {
        let (mut app, mut rx, input_tx, roster) = harness(202);
        let slot = join(&roster, "broke");
        app.update();
        let player = player_for_slot(&mut app, slot);
        set_inventory(&mut app, player, &[("coin", 3)]);
        set_prices(&mut app, &[("potion", 5, 2)]);
        let npc = spawn_merchant(&mut app, Tile::new(8, 8), &["potion"]);

        input_tx
            .send((
                slot,
                Input::BuyItem {
                    npc,
                    item_ref: "potion".into(),
                    qty: 1,
                },
            ))
            .unwrap();
        for _ in 0..3 {
            app.update();
        }
        assert_eq!(
            inv_count(&app, player, "coin"),
            3,
            "coin spent on failed buy"
        );
        assert_eq!(
            inv_count(&app, player, "potion"),
            0,
            "item granted for free"
        );
        let mut saw_fail = false;
        while let Ok(evt) = rx.try_recv() {
            if let ServerEvent::Ephemeral { kind, payload, .. } = evt
                && kind == proto::EPHEMERAL_SHOP
            {
                let body = String::from_utf8(payload).unwrap();
                if body.contains("\"ok\":false") && body.contains("insufficient") {
                    saw_fail = true;
                }
            }
        }
        assert!(saw_fail, "no shop rejection ephemeral");
    }

    #[test]
    fn shop_buy_breaks_gold_bar_for_change() {
        let (mut app, _rx, input_tx, roster) = harness(203);
        let slot = join(&roster, "rich");
        app.update();
        let player = player_for_slot(&mut app, slot);
        set_inventory(&mut app, player, &[("gold-bar", 1)]);
        set_prices(&mut app, &[("potion", 5, 2)]);
        let npc = spawn_merchant(&mut app, Tile::new(8, 8), &["potion"]);

        input_tx
            .send((
                slot,
                Input::BuyItem {
                    npc,
                    item_ref: "potion".into(),
                    qty: 1,
                },
            ))
            .unwrap();
        for _ in 0..3 {
            app.update();
        }
        assert_eq!(
            inv_count(&app, player, "gold-bar"),
            0,
            "gold-bar not broken"
        );
        assert_eq!(inv_count(&app, player, "coin"), 95, "change not returned");
        assert_eq!(inv_count(&app, player, "potion"), 1, "item not granted");
    }

    #[test]
    fn shop_sell_grants_coin_removes_item() {
        let (mut app, _rx, input_tx, roster) = harness(204);
        let slot = join(&roster, "seller");
        app.update();
        let player = player_for_slot(&mut app, slot);
        set_inventory(&mut app, player, &[("potion", 2)]);
        set_prices(&mut app, &[("potion", 5, 2)]);
        let npc = spawn_merchant(&mut app, Tile::new(8, 8), &["potion"]);

        input_tx
            .send((
                slot,
                Input::SellItem {
                    npc,
                    item_ref: "potion".into(),
                    qty: 1,
                },
            ))
            .unwrap();
        for _ in 0..3 {
            app.update();
        }
        assert_eq!(inv_count(&app, player, "potion"), 1, "item not removed");
        assert_eq!(inv_count(&app, player, "coin"), 2, "coin not granted");
    }

    #[test]
    fn shop_buy_out_of_stock_rejected() {
        let (mut app, _rx, input_tx, roster) = harness(205);
        let slot = join(&roster, "picky");
        app.update();
        let player = player_for_slot(&mut app, slot);
        set_inventory(&mut app, player, &[("coin", 100)]);
        set_prices(&mut app, &[("iron-sword", 50, 20)]);
        let npc = spawn_merchant(&mut app, Tile::new(8, 8), &["potion"]);

        input_tx
            .send((
                slot,
                Input::BuyItem {
                    npc,
                    item_ref: "iron-sword".into(),
                    qty: 1,
                },
            ))
            .unwrap();
        for _ in 0..3 {
            app.update();
        }
        assert_eq!(inv_count(&app, player, "coin"), 100, "coin spent off-menu");
        assert_eq!(
            inv_count(&app, player, "iron-sword"),
            0,
            "got unstocked item"
        );
    }

    #[test]
    fn shop_buy_too_far_rejected() {
        let (mut app, _rx, input_tx, roster) = harness(206);
        let slot = join(&roster, "distant");
        app.update();
        let player = player_for_slot(&mut app, slot);
        set_inventory(&mut app, player, &[("coin", 100)]);
        set_prices(&mut app, &[("potion", 5, 2)]);
        let npc = spawn_merchant(&mut app, Tile::new(20, 20), &["potion"]);

        input_tx
            .send((
                slot,
                Input::BuyItem {
                    npc,
                    item_ref: "potion".into(),
                    qty: 1,
                },
            ))
            .unwrap();
        for _ in 0..3 {
            app.update();
        }
        assert_eq!(inv_count(&app, player, "coin"), 100, "coin spent from afar");
        assert_eq!(
            inv_count(&app, player, "potion"),
            0,
            "item bought from afar"
        );
    }

    // ---- Blackjack tables ----

    fn bj_harness(seed: u64, table: Tile) -> Harness {
        let (mut app, rx, tx, roster) = harness(seed);
        app.world_mut().insert_resource(Tables(vec![TableDef {
            table_ref: "table".into(),
            tile: table,
            seats: 5,
        }]));
        (app, rx, tx, roster)
    }

    #[test]
    fn join_requires_proximity() {
        let (mut app, _rx, tx, roster) = bj_harness(201, Tile::new(0, 0));
        let slot = join(&roster, "p1");
        app.update();
        tx.send((
            slot,
            Input::JoinTable {
                table_ref: "table".into(),
            },
        ))
        .unwrap();
        app.update();
        assert!(
            app.world().resource::<TableRegistry>().sessions.is_empty(),
            "seated from out of range"
        );
    }

    #[test]
    fn bet_caps_and_debits_held_coin() {
        let (mut app, _rx, tx, roster) = bj_harness(202, Tile::new(8, 8));
        let slot = join(&roster, "p1");
        app.update();
        let e = player_for_slot(&mut app, slot);
        set_inventory(&mut app, e, &[("coin", 10)]);
        tx.send((
            slot,
            Input::JoinTable {
                table_ref: "table".into(),
            },
        ))
        .unwrap();
        app.update();
        assert_eq!(
            app.world().resource::<TableRegistry>().sessions.len(),
            1,
            "did not seat adjacent player"
        );
        tx.send((slot, Input::PlaceBet { amount: 1000 })).unwrap();
        app.update();
        assert_eq!(
            inv_count(&app, e, "coin"),
            0,
            "bet not capped to held coin + debited"
        );
    }

    #[test]
    fn leave_during_betting_refunds_and_tears_down() {
        let (mut app, _rx, tx, roster) = bj_harness(203, Tile::new(8, 8));
        let slot = join(&roster, "p1");
        app.update();
        let e = player_for_slot(&mut app, slot);
        set_inventory(&mut app, e, &[("coin", 10)]);
        tx.send((
            slot,
            Input::JoinTable {
                table_ref: "table".into(),
            },
        ))
        .unwrap();
        app.update();
        tx.send((slot, Input::PlaceBet { amount: 4 })).unwrap();
        app.update();
        assert_eq!(inv_count(&app, e, "coin"), 6, "bet not debited");
        tx.send((slot, Input::LeaveTable)).unwrap();
        app.update();
        assert_eq!(inv_count(&app, e, "coin"), 10, "bet not refunded on leave");
        assert!(
            app.world().resource::<TableRegistry>().sessions.is_empty(),
            "empty table not torn down"
        );
    }

    #[test]
    fn full_round_settles_to_valid_total() {
        let (mut app, _rx, tx, roster) = bj_harness(204, Tile::new(8, 8));
        let slot = join(&roster, "p1");
        app.update();
        let e = player_for_slot(&mut app, slot);
        set_inventory(&mut app, e, &[("coin", 100)]);
        tx.send((
            slot,
            Input::JoinTable {
                table_ref: "table".into(),
            },
        ))
        .unwrap();
        app.update();
        tx.send((slot, Input::PlaceBet { amount: 10 })).unwrap();
        app.update();
        // No action -> turn timer auto-stands the seat, dealer plays, round settles.
        for _ in 0..(BJ_BET_TICKS + BJ_TURN_TICKS + BJ_SETTLE_TICKS + 30) {
            app.update();
        }
        let coin = inv_count(&app, e, "coin");
        assert!(
            [90, 100, 110, 115].contains(&coin),
            "unexpected settled coin total: {coin}"
        );
        assert_eq!(
            app.world().resource::<TableRegistry>().sessions.len(),
            1,
            "session torn down while player still seated"
        );
    }

    fn occupied_seats(app: &App) -> usize {
        app.world()
            .resource::<TableRegistry>()
            .sessions
            .values()
            .map(|s| s.occupied())
            .sum()
    }

    #[test]
    fn disconnect_holds_seat_then_releases_after_grace() {
        let (mut app, _rx, tx, roster) = bj_harness(205, Tile::new(8, 8));
        let slot = join(&roster, "p1");
        app.update();
        let e = player_for_slot(&mut app, slot);
        set_inventory(&mut app, e, &[("coin", 50)]);
        tx.send((
            slot,
            Input::JoinTable {
                table_ref: "table".into(),
            },
        ))
        .unwrap();
        app.update();
        tx.send((slot, Input::PlaceBet { amount: 10 })).unwrap();
        app.update();
        for _ in 0..(BJ_BET_TICKS + 2) {
            app.update();
        }
        roster.write().unwrap().release(slot);
        app.update();
        app.update();
        // Seat is held open through the grace window, not dropped immediately.
        assert_eq!(occupied_seats(&app), 1, "seat dropped before grace elapsed");
        for _ in 0..(BJ_HOLD_TICKS + 2) {
            app.update();
        }
        assert!(
            app.world().resource::<TableRegistry>().sessions.is_empty(),
            "held seat not released + table not torn down after grace"
        );
    }

    #[test]
    fn reconnect_reclaims_held_seat() {
        let (mut app, _rx, tx, roster) = bj_harness(207, Tile::new(8, 8));
        let slot = join(&roster, "p1");
        app.update();
        let e = player_for_slot(&mut app, slot);
        set_inventory(&mut app, e, &[("coin", 50)]);
        tx.send((
            slot,
            Input::JoinTable {
                table_ref: "table".into(),
            },
        ))
        .unwrap();
        app.update();
        // Disconnect, then let the seat park for a few ticks (still within grace).
        roster.write().unwrap().release(slot);
        for _ in 0..5 {
            app.update();
        }
        assert_eq!(occupied_seats(&app), 1, "seat not held after disconnect");
        // Reconnect under the same name (new slot) and re-join from the table tile.
        let slot2 = join(&roster, "p1");
        app.update();
        tx.send((
            slot2,
            Input::JoinTable {
                table_ref: "table".into(),
            },
        ))
        .unwrap();
        app.update();
        assert_eq!(
            occupied_seats(&app),
            1,
            "reconnect took a second seat instead of reclaiming the held one"
        );
        let session = app
            .world()
            .resource::<TableRegistry>()
            .sessions
            .values()
            .next()
            .unwrap();
        let seat = session.seats.iter().flatten().next().unwrap();
        assert_eq!(seat.slot, slot2.0, "reclaimed seat not rebound to new slot");
        assert!(
            seat.disconnected_since.is_none(),
            "reclaimed seat still flagged offline"
        );
    }

    fn bj_card(suit: u8, rank: u8) -> u8 {
        (suit << 4) | rank
    }

    /// Mutate the (single) live table session for a deterministic rule scenario.
    fn with_session(app: &mut App, f: impl FnOnce(&mut TableSession)) {
        let mut reg = app.world_mut().resource_mut::<TableRegistry>();
        let session = reg.sessions.values_mut().next().expect("a live session");
        f(session);
    }

    /// Seat a funded player, lock in a bet, and run the table through the deal.
    fn bj_seated_and_dealt(
        app: &mut App,
        tx: &mpsc::UnboundedSender<(proto::PlayerSlot, Input)>,
        slot: proto::PlayerSlot,
        coins: u32,
        bet: u32,
    ) -> Entity {
        app.update();
        let e = player_for_slot(app, slot);
        set_inventory(app, e, &[("coin", coins)]);
        tx.send((
            slot,
            Input::JoinTable {
                table_ref: "table".into(),
            },
        ))
        .unwrap();
        app.update();
        tx.send((slot, Input::PlaceBet { amount: bet })).unwrap();
        app.update();
        for _ in 0..(BJ_BET_TICKS + 2) {
            app.update();
        }
        e
    }

    #[test]
    fn surrender_refunds_half_the_bet() {
        let (mut app, _rx, tx, roster) = bj_harness(210, Tile::new(8, 8));
        let slot = join(&roster, "p1");
        let e = bj_seated_and_dealt(&mut app, &tx, slot, 100, 10);
        // Force a 16 vs a non-ace dealer, mid player-turn.
        with_session(&mut app, |s| {
            s.phase = BjPhase::PlayerTurn;
            s.deadline_tick = u32::MAX;
            s.dealer = vec![bj_card(0, 9), bj_card(0, 8)];
            let bet = s.seats.iter().flatten().next().unwrap().bet;
            let seat = s.seats.iter_mut().flatten().next().unwrap();
            let mut h = Hand::new(bet);
            h.cards = vec![bj_card(0, 9), bj_card(0, 5)];
            seat.hands = vec![h];
            s.active_seat = usize::MAX;
            s.active_hand = 0;
        });
        tx.send((
            slot,
            Input::BjAction {
                kind: proto::BjActionKind::Surrender,
            },
        ))
        .unwrap();
        app.update();
        assert_eq!(
            inv_count(&app, e, "coin"),
            95,
            "surrender did not refund half the 10 bet"
        );
        let session = app
            .world()
            .resource::<TableRegistry>()
            .sessions
            .values()
            .next()
            .unwrap();
        let seat = session.seats.iter().flatten().next().unwrap();
        assert!(seat.hands[0].surrendered, "hand not flagged surrendered");
    }

    #[test]
    fn split_creates_two_hands_and_debits_a_second_bet() {
        let (mut app, _rx, tx, roster) = bj_harness(211, Tile::new(8, 8));
        let slot = join(&roster, "p1");
        let e = bj_seated_and_dealt(&mut app, &tx, slot, 100, 10);
        with_session(&mut app, |s| {
            s.phase = BjPhase::PlayerTurn;
            s.deadline_tick = u32::MAX;
            s.dealer = vec![bj_card(0, 9), bj_card(0, 8)];
            let bet = s.seats.iter().flatten().next().unwrap().bet;
            let seat = s.seats.iter_mut().flatten().next().unwrap();
            let mut h = Hand::new(bet);
            h.cards = vec![bj_card(0, 7), bj_card(1, 7)]; // pair of eights
            seat.hands = vec![h];
            s.active_seat = usize::MAX;
            s.active_hand = 0;
        });
        tx.send((
            slot,
            Input::BjAction {
                kind: proto::BjActionKind::Split,
            },
        ))
        .unwrap();
        app.update();
        assert_eq!(
            inv_count(&app, e, "coin"),
            80,
            "split did not debit a second 10 bet"
        );
        let session = app
            .world()
            .resource::<TableRegistry>()
            .sessions
            .values()
            .next()
            .unwrap();
        let seat = session.seats.iter().flatten().next().unwrap();
        assert_eq!(seat.hands.len(), 2, "split did not produce two hands");
        assert!(
            seat.hands.iter().all(|h| h.cards.len() == 2),
            "split hands not topped up to two cards"
        );
    }

    #[test]
    fn insurance_debits_and_caps_at_half_the_bet() {
        let (mut app, _rx, tx, roster) = bj_harness(212, Tile::new(8, 8));
        let slot = join(&roster, "p1");
        let e = bj_seated_and_dealt(&mut app, &tx, slot, 100, 10);
        with_session(&mut app, |s| {
            s.phase = BjPhase::Insurance;
            s.deadline_tick = u32::MAX; // keep the window open
            s.dealer = vec![bj_card(0, 0), bj_card(0, 8)]; // ace up
        });
        // Ask for far more than allowed; it caps at bet/2 = 5.
        tx.send((slot, Input::Insure { amount: 999 })).unwrap();
        app.update();
        assert_eq!(
            inv_count(&app, e, "coin"),
            85,
            "insurance stake not capped to half the bet"
        );
        let session = app
            .world()
            .resource::<TableRegistry>()
            .sessions
            .values()
            .next()
            .unwrap();
        let seat = session.seats.iter().flatten().next().unwrap();
        assert_eq!(seat.insurance, 5, "insurance not recorded at the cap");
    }

    #[test]
    fn settled_round_reveals_a_seed_matching_its_commitment() {
        let (mut app, mut rx, tx, roster) = bj_harness(220, Tile::new(8, 8));
        let slot = join(&roster, "p1");
        let _e = bj_seated_and_dealt(&mut app, &tx, slot, 100, 10);
        // No action: the turn timer auto-stands, the dealer plays, the round settles.
        for _ in 0..(BJ_INSURANCE_TICKS + BJ_TURN_TICKS + BJ_SETTLE_TICKS + 20) {
            app.update();
        }
        let mut commitment_seen = false;
        let mut verified = false;
        while let Ok(evt) = rx.try_recv() {
            if let ServerEvent::Ephemeral { kind, payload, .. } = evt
                && kind == proto::EPHEMERAL_BLACKJACK
            {
                let v: serde_json::Value = serde_json::from_slice(&payload).unwrap();
                if v["commitment"].as_str().is_some_and(|s| !s.is_empty()) {
                    commitment_seen = true;
                }
                if let Some(seed_str) = v["seed"].as_str() {
                    let seed: u64 = seed_str.parse().unwrap();
                    let commitment = v["commitment"].as_str().unwrap();
                    assert_eq!(
                        blackjack::commit_seed(seed),
                        commitment,
                        "revealed seed does not match the published commitment"
                    );
                    verified = true;
                }
            }
        }
        assert!(commitment_seen, "no commitment broadcast during the round");
        assert!(verified, "round never revealed a verifiable seed at settle");
    }

    #[test]
    fn nearby_spectator_receives_scoped_state() {
        let (mut app, mut rx, tx, roster) = bj_harness(206, Tile::new(8, 8));
        let player = join(&roster, "player");
        let watcher = join(&roster, "watcher");
        app.update();
        let ep = player_for_slot(&mut app, player);
        set_inventory(&mut app, ep, &[("coin", 20)]);
        tx.send((
            player,
            Input::JoinTable {
                table_ref: "table".into(),
            },
        ))
        .unwrap();
        app.update();
        tx.send((player, Input::PlaceBet { amount: 5 })).unwrap();
        app.update();
        for _ in 0..(BJ_BET_TICKS + 5) {
            app.update();
        }
        let mut to_watcher = 0usize;
        let mut saw_hidden = false;
        while let Ok(evt) = rx.try_recv() {
            if let ServerEvent::Ephemeral { kind, to, payload } = evt
                && kind == proto::EPHEMERAL_BLACKJACK
                && to == watcher
            {
                to_watcher += 1;
                let txt = String::from_utf8(payload).unwrap();
                if txt.contains("\"dealer_hidden\":true") {
                    saw_hidden = true;
                }
            }
        }
        assert!(to_watcher > 0, "spectator never received scoped state");
        assert!(saw_hidden, "dealer hole card was not hidden pre-reveal");
    }
}
