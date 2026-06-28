//! Pokémon-style turn-based pet battle engine — a pure, deterministic reducer over a
//! [`BattleState`]. No ECS, no transport: each side picks one [`BattleAction`] per turn
//! (attack with a move, swap the active pet, use an item, or run), and
//! [`BattleState::resolve_turn`] advances the fight and returns the [`BattleEvent`]s.
//!
//! Determinism: every roll (crit, damage variance, accuracy, status, stat-change) is
//! drawn from a [`crate::rng::Mulberry32`] stream seeded by `(root, PETBATTLE, turn)`,
//! so the same seed + the same actions always produce the same battle — replayable and
//! client-mirrorable. The wiring layer (capture trigger, transport, client scene) lives
//! outside this module.

use serde::{Deserialize, Serialize};

use crate::data::{NpcAbility, NpcDef, NpcStatChange};
use crate::pets::PetSnapshot;
use crate::rng::{self, Mulberry32, domain};

/// Pet typing. Mirrors the npcdb `Element` enum (string form `ELEMENT_*`).
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub enum Element {
    None,
    Fire,
    Ice,
    Lightning,
    Poison,
    Shadow,
    Holy,
    Arcane,
    Earth,
    Wind,
    Nature,
    Light,
}

impl Element {
    /// Parse the npcdb proto-string form (`"ELEMENT_LIGHTNING"`), case-insensitively.
    pub fn from_proto(s: &str) -> Element {
        match s
            .trim_start_matches("ELEMENT_")
            .to_ascii_uppercase()
            .as_str()
        {
            "FIRE" => Element::Fire,
            "ICE" => Element::Ice,
            "LIGHTNING" => Element::Lightning,
            "POISON" => Element::Poison,
            "SHADOW" => Element::Shadow,
            "HOLY" => Element::Holy,
            "ARCANE" => Element::Arcane,
            "EARTH" => Element::Earth,
            "WIND" => Element::Wind,
            "NATURE" => Element::Nature,
            "LIGHT" => Element::Light,
            _ => Element::None,
        }
    }

    /// Stable wire index for the client effect palette. MUST match the `ELEMENT_NAMES`
    /// array order in the laser protocol (and the enum declaration order).
    pub fn idx(self) -> u8 {
        match self {
            Element::None => 0,
            Element::Fire => 1,
            Element::Ice => 2,
            Element::Lightning => 3,
            Element::Poison => 4,
            Element::Shadow => 5,
            Element::Holy => 6,
            Element::Arcane => 7,
            Element::Earth => 8,
            Element::Wind => 9,
            Element::Nature => 10,
            Element::Light => 11,
        }
    }
}

/// Damage class — picks which attack/defense stat applies.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub enum MoveCategory {
    Physical,
    Special,
    Status,
}

impl MoveCategory {
    pub fn from_proto(s: &str) -> MoveCategory {
        match s
            .trim_start_matches("MOVE_CATEGORY_")
            .to_ascii_uppercase()
            .as_str()
        {
            "SPECIAL" => MoveCategory::Special,
            "STATUS" => MoveCategory::Status,
            _ => MoveCategory::Physical,
        }
    }
}

/// A non-volatile status condition on a pet.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub enum PetStatus {
    None,
    Burn,
    Poison,
    Paralyze,
}

impl PetStatus {
    /// Parse the npcdb free-string status (`"burn"`, `"paralyze"`, `"poison"`).
    pub fn from_label(s: &str) -> PetStatus {
        match s.to_ascii_lowercase().as_str() {
            "burn" => PetStatus::Burn,
            "poison" => PetStatus::Poison,
            "paralyze" | "paralysis" => PetStatus::Paralyze,
            _ => PetStatus::None,
        }
    }
}

/// A modifiable battle stat. Index into [`Combatant::stages`].
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub enum StatId {
    Attack = 0,
    Defense = 1,
    SpAttack = 2,
    SpDefense = 3,
    Speed = 4,
    Accuracy = 5,
    Evasion = 6,
}

const STAT_COUNT: usize = 7;

impl StatId {
    pub fn from_proto(s: &str) -> Option<StatId> {
        Some(
            match s
                .trim_start_matches("STAT_KIND_")
                .to_ascii_uppercase()
                .as_str()
            {
                "ATTACK" => StatId::Attack,
                "DEFENSE" => StatId::Defense,
                "SPECIAL_ATTACK" => StatId::SpAttack,
                "SPECIAL_DEFENSE" => StatId::SpDefense,
                "SPEED" => StatId::Speed,
                "ACCURACY" => StatId::Accuracy,
                "EVASION" => StatId::Evasion,
                _ => return None,
            },
        )
    }
}

/// A stat buff/debuff a move applies on hit.
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct StatMod {
    pub stat: StatId,
    pub stages: i32,
    pub on_self: bool,
    pub chance: f32,
}

impl StatMod {
    fn from_npc(sc: &NpcStatChange) -> Option<StatMod> {
        let stat = StatId::from_proto(&sc.stat)?;
        let on_self = sc.target.to_ascii_uppercase().ends_with("SELF");
        Some(StatMod {
            stat,
            stages: sc.stages,
            on_self,
            chance: if sc.chance <= 0.0 { 1.0 } else { sc.chance },
        })
    }
}

/// Resolved battle data for one move, built from a species [`NpcAbility`].
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct MoveData {
    pub id: String,
    pub power: i32,
    pub category: MoveCategory,
    pub element: Element,
    /// Hit chance 0.0–1.0; `<= 0` means it never misses (status/self moves).
    pub accuracy: f32,
    pub priority: i32,
    pub status: PetStatus,
    pub status_chance: f32,
    pub high_crit: bool,
    pub recoil: f32,
    pub drain: f32,
    pub stat_mods: Vec<StatMod>,
}

impl MoveData {
    pub fn from_ability(a: &NpcAbility) -> MoveData {
        MoveData {
            id: a.id.clone(),
            power: a.power.max(0),
            category: MoveCategory::from_proto(&a.category),
            element: Element::from_proto(&a.element),
            accuracy: a.hit_chance,
            priority: a.priority,
            status: PetStatus::from_label(&a.status_effect),
            status_chance: a.status_chance,
            high_crit: a.high_crit,
            recoil: a.recoil_fraction.max(0.0),
            drain: a.drain_fraction.max(0.0),
            stat_mods: a
                .stat_changes
                .iter()
                .filter_map(StatMod::from_npc)
                .collect(),
        }
    }
}

/// One known move with its remaining power points.
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct BattleMove {
    pub data: MoveData,
    pub pp: u16,
    pub max_pp: u16,
}

/// A pet as it exists inside a battle — vitals, stat stages, status, and resolved moves.
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct Combatant {
    pub species_ref: String,
    pub nickname: String,
    pub element: Element,
    pub level: u32,
    pub hp: i32,
    pub max_hp: i32,
    pub attack: i32,
    pub defense: i32,
    pub sp_attack: i32,
    pub sp_defense: i32,
    pub speed: i32,
    pub moves: Vec<BattleMove>,
    pub stages: [i32; STAT_COUNT],
    pub status: PetStatus,
}

impl Combatant {
    /// Build a battle combatant from a minted pet instance + its species template (for
    /// the element typing and the full move data behind each known move id).
    pub fn from_pet(snap: &PetSnapshot, species: &NpcDef) -> Combatant {
        let moves = snap
            .moves
            .iter()
            .filter_map(|m| {
                species
                    .abilities
                    .iter()
                    .find(|a| a.id == m.ability_id)
                    .map(|a| BattleMove {
                        data: MoveData::from_ability(a),
                        pp: m.pp,
                        max_pp: m.max_pp,
                    })
            })
            .collect();
        Combatant {
            species_ref: snap.species_ref.clone(),
            nickname: snap.nickname.clone(),
            element: Element::from_proto(&species.element),
            level: snap.level,
            hp: snap.vitals.hp,
            max_hp: snap.vitals.max_hp,
            attack: snap.vitals.attack,
            defense: snap.vitals.defense,
            sp_attack: snap.vitals.sp_attack,
            sp_defense: snap.vitals.sp_defense,
            speed: snap.vitals.speed,
            moves,
            stages: [0; STAT_COUNT],
            status: PetStatus::None,
        }
    }

    pub fn is_alive(&self) -> bool {
        self.hp > 0
    }
}

/// Which side of the battle. The player owns a roster; the enemy is a wild pet (or, later,
/// a trainer's team).
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub enum Side {
    Player,
    Enemy,
}

/// One side's team and its current active pet.
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct BattleSide {
    pub team: Vec<Combatant>,
    pub active: usize,
}

impl BattleSide {
    pub fn new(team: Vec<Combatant>) -> Self {
        Self { team, active: 0 }
    }

    pub fn active(&self) -> &Combatant {
        &self.team[self.active]
    }

    fn active_mut(&mut self) -> &mut Combatant {
        &mut self.team[self.active]
    }

    pub fn any_alive(&self) -> bool {
        self.team.iter().any(Combatant::is_alive)
    }
}

/// The action a side commits for a turn.
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub enum BattleAction {
    /// Use the move in the active pet's move slot `slot`.
    Move { slot: usize },
    /// Return the active pet and send out team member `to`.
    Swap { to: usize },
    /// Use an item that heals the active pet by `heal` hp.
    UseItem { heal: i32 },
    /// Flee the battle (player only).
    Run,
}

/// Type-effectiveness bucket, for client messaging.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub enum Effectiveness {
    Immune,
    NotVery,
    Normal,
    Super,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub enum BattleOutcome {
    Ongoing,
    PlayerWon,
    PlayerLost,
    Fled,
}

/// What happened during a turn — the ordered log returned by [`BattleState::resolve_turn`].
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub enum BattleEvent {
    Used {
        side: Side,
        move_id: String,
        element: Element,
        category: MoveCategory,
        power: i32,
    },
    Damage {
        side: Side,
        dmg: i32,
        crit: bool,
        effect: Effectiveness,
        /// Target (foe of `side`) remaining HP after the hit — for HP-bar replay.
        target_hp: i32,
    },
    Miss {
        side: Side,
    },
    NoPp {
        side: Side,
    },
    Paralyzed {
        side: Side,
    },
    StatusApplied {
        side: Side,
        status: PetStatus,
    },
    StatusDamage {
        side: Side,
        status: PetStatus,
        dmg: i32,
        /// `side`'s active remaining HP after the residual tick.
        hp: i32,
    },
    StatStage {
        side: Side,
        stat: StatId,
        stages: i32,
    },
    SwapIn {
        side: Side,
        to: usize,
    },
    Healed {
        side: Side,
        heal: i32,
        /// `side`'s active remaining HP after the heal.
        hp: i32,
    },
    Faint {
        side: Side,
    },
    Outcome(BattleOutcome),
}

/// The full battle. Drive it one turn at a time with [`resolve_turn`].
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct BattleState {
    pub player: BattleSide,
    pub enemy: BattleSide,
    pub turn: u32,
    pub root: u32,
    pub outcome: BattleOutcome,
}

/// Stat-stage multiplier for the main battle stats (atk/def/spa/spd/speed): `+n` gives
/// `(2+n)/2`, `-n` gives `2/(2+n)`, clamped to ±6.
fn stage_mult(stage: i32) -> f32 {
    let s = stage.clamp(-6, 6);
    if s >= 0 {
        (2 + s) as f32 / 2.0
    } else {
        2.0 / (2 - s) as f32
    }
}

/// Accuracy/evasion stage multiplier uses a 3-based curve.
fn acc_stage_mult(stage: i32) -> f32 {
    let s = stage.clamp(-6, 6);
    if s >= 0 {
        (3 + s) as f32 / 3.0
    } else {
        3.0 / (3 - s) as f32
    }
}

fn eff_stat(base: i32, stage: i32) -> i32 {
    ((base as f32 * stage_mult(stage)).floor() as i32).max(1)
}

/// Effective speed for turn order — stage-modified, quartered by paralysis (à la Pokémon
/// older gens; here halved to keep the prototype gentle).
fn eff_speed(c: &Combatant) -> i32 {
    let mut s = eff_stat(c.speed, c.stages[StatId::Speed as usize]);
    if c.status == PetStatus::Paralyze {
        s /= 2;
    }
    s
}

/// Type-effectiveness multiplier of an attacking element against a defender's element. A
/// curated chart (super-effective 2×, resisted 0.5×) — neutral otherwise. Tune as the
/// roster grows.
pub fn type_multiplier(atk: Element, def: Element) -> f32 {
    use Element::*;
    match (atk, def) {
        // Super-effective
        (Fire, Ice) | (Fire, Nature) => 2.0,
        (Ice, Wind) | (Ice, Nature) | (Ice, Earth) => 2.0,
        (Lightning, Wind) => 2.0,
        (Earth, Lightning) | (Earth, Fire) | (Earth, Poison) => 2.0,
        (Wind, Earth) => 2.0,
        (Nature, Earth) => 2.0,
        (Poison, Nature) => 2.0,
        (Holy, Shadow) | (Light, Shadow) => 2.0,
        (Shadow, Holy) | (Shadow, Light) => 2.0,
        // Resisted
        (Lightning, Earth) => 0.5,
        (Fire, Fire) | (Ice, Fire) | (Nature, Fire) => 0.5,
        (Nature, Nature) | (Poison, Poison) => 0.5,
        (Holy, Holy) | (Shadow, Shadow) => 0.5,
        _ => 1.0,
    }
}

fn effectiveness_bucket(m: f32) -> Effectiveness {
    if m <= 0.0 {
        Effectiveness::Immune
    } else if m < 1.0 {
        Effectiveness::NotVery
    } else if m > 1.0 {
        Effectiveness::Super
    } else {
        Effectiveness::Normal
    }
}

/// Damage of `mv` from `att` onto `def`, given a crit flag and a variance roll in
/// `[85, 100]`. Integer, deterministic. Status moves deal 0.
fn damage(
    att: &Combatant,
    def: &Combatant,
    mv: &MoveData,
    crit: bool,
    variance: i32,
) -> (i32, f32) {
    if mv.category == MoveCategory::Status || mv.power <= 0 {
        return (0, 1.0);
    }
    let (mut a, d) = match mv.category {
        MoveCategory::Physical => (
            eff_stat(att.attack, att.stages[StatId::Attack as usize]),
            eff_stat(def.defense, def.stages[StatId::Defense as usize]),
        ),
        _ => (
            eff_stat(att.sp_attack, att.stages[StatId::SpAttack as usize]),
            eff_stat(def.sp_defense, def.stages[StatId::SpDefense as usize]),
        ),
    };
    // Burn halves physical attack.
    if att.status == PetStatus::Burn && mv.category == MoveCategory::Physical {
        a = (a / 2).max(1);
    }
    let base = (2 * att.level as i32 / 5 + 2) * mv.power * a / d.max(1) / 50 + 2;
    let stab = if mv.element == att.element && mv.element != Element::None {
        1.5
    } else {
        1.0
    };
    let typ = type_multiplier(mv.element, def.element);
    let critm = if crit { 1.5 } else { 1.0 };
    let modifier = stab * typ * critm * (variance as f32 / 100.0);
    let dmg = (base as f32 * modifier) as i32;
    // A connecting, non-immune hit always does at least 1.
    let dmg = if typ > 0.0 { dmg.max(1) } else { 0 };
    (dmg, typ)
}

impl BattleState {
    /// Open a battle between two full teams.
    pub fn versus(root: u32, player: Vec<Combatant>, enemy: Vec<Combatant>) -> BattleState {
        BattleState {
            player: BattleSide::new(player),
            enemy: BattleSide::new(enemy),
            turn: 0,
            root,
            outcome: BattleOutcome::Ongoing,
        }
    }

    /// Open a wild battle: the player's `team` vs a single `wild` pet.
    pub fn wild(root: u32, team: Vec<Combatant>, wild: Combatant) -> BattleState {
        BattleState::versus(root, team, vec![wild])
    }

    fn side(&self, s: Side) -> &BattleSide {
        match s {
            Side::Player => &self.player,
            Side::Enemy => &self.enemy,
        }
    }

    fn side_mut(&mut self, s: Side) -> &mut BattleSide {
        match s {
            Side::Player => &mut self.player,
            Side::Enemy => &mut self.enemy,
        }
    }

    /// Priority bracket for ordering: switches/items/run act before moves.
    fn bracket(&self, side: Side, action: &BattleAction) -> i32 {
        match action {
            BattleAction::Move { slot } => self
                .side(side)
                .active()
                .moves
                .get(*slot)
                .map(|m| m.data.priority)
                .unwrap_or(0),
            _ => 6,
        }
    }

    /// Resolve one turn: both sides' actions ordered by priority bracket then speed (ties
    /// to the player), each applied in turn, then end-of-turn status damage. Returns the
    /// ordered event log. A no-op once the battle is over.
    pub fn resolve_turn(
        &mut self,
        player_action: BattleAction,
        enemy_action: BattleAction,
    ) -> Vec<BattleEvent> {
        let mut events = Vec::new();
        if self.outcome != BattleOutcome::Ongoing {
            return events;
        }
        let mut rng = rng::stream(self.root, domain::PETBATTLE, &[self.turn]);

        // Order the two actors.
        let pb = self.bracket(Side::Player, &player_action);
        let eb = self.bracket(Side::Enemy, &enemy_action);
        let p_spd = eff_speed(self.player.active());
        let e_spd = eff_speed(self.enemy.active());
        let player_first = if pb != eb {
            pb > eb
        } else if p_spd != e_spd {
            p_spd > e_spd
        } else {
            true
        };
        let ordered = if player_first {
            [(Side::Player, player_action), (Side::Enemy, enemy_action)]
        } else {
            [(Side::Enemy, enemy_action), (Side::Player, player_action)]
        };

        for (side, action) in ordered {
            if self.outcome != BattleOutcome::Ongoing {
                break;
            }
            if !self.side(side).active().is_alive() {
                continue;
            }
            self.apply_action(side, action, &mut rng, &mut events);
            self.check_outcome(&mut events);
        }

        if self.outcome == BattleOutcome::Ongoing {
            self.end_of_turn(&mut events);
            self.check_outcome(&mut events);
        }
        self.turn += 1;
        events
    }

    fn apply_action(
        &mut self,
        side: Side,
        action: BattleAction,
        rng: &mut Mulberry32,
        events: &mut Vec<BattleEvent>,
    ) {
        match action {
            BattleAction::Run => {
                if side == Side::Player {
                    self.outcome = BattleOutcome::Fled;
                    events.push(BattleEvent::Outcome(BattleOutcome::Fled));
                }
            }
            BattleAction::UseItem { heal } => {
                let c = self.side_mut(side).active_mut();
                let before = c.hp;
                c.hp = (c.hp + heal).min(c.max_hp);
                events.push(BattleEvent::Healed {
                    side,
                    heal: c.hp - before,
                    hp: c.hp,
                });
            }
            BattleAction::Swap { to } => {
                let s = self.side_mut(side);
                if to < s.team.len() && to != s.active && s.team[to].is_alive() {
                    s.active = to;
                    events.push(BattleEvent::SwapIn { side, to });
                }
            }
            BattleAction::Move { slot } => self.apply_move(side, slot, rng, events),
        }
    }

    fn apply_move(
        &mut self,
        side: Side,
        slot: usize,
        rng: &mut Mulberry32,
        events: &mut Vec<BattleEvent>,
    ) {
        let foe = match side {
            Side::Player => Side::Enemy,
            Side::Enemy => Side::Player,
        };
        let Some(mv) = self
            .side(side)
            .active()
            .moves
            .get(slot)
            .map(|m| m.data.clone())
        else {
            return;
        };
        if self.side(side).active().moves[slot].pp == 0 {
            events.push(BattleEvent::NoPp { side });
            return;
        }

        // Full paralysis: 25% chance the move fails (pp not spent).
        if self.side(side).active().status == PetStatus::Paralyze && (rng.next_u32() % 100) < 25 {
            events.push(BattleEvent::Paralyzed { side });
            return;
        }
        self.side_mut(side).active_mut().moves[slot].pp -= 1;
        events.push(BattleEvent::Used {
            side,
            move_id: mv.id.clone(),
            element: mv.element,
            category: mv.category,
            power: mv.power,
        });

        // Accuracy.
        let acc_combined = self.side(side).active().stages[StatId::Accuracy as usize]
            - self.side(foe).active().stages[StatId::Evasion as usize];
        let chance = if mv.accuracy <= 0.0 {
            1.0
        } else {
            mv.accuracy * acc_stage_mult(acc_combined)
        };
        if (rng.next_u32() % 100) as f32 >= chance * 100.0 {
            events.push(BattleEvent::Miss { side });
            return;
        }

        // Damage.
        if mv.category != MoveCategory::Status {
            let crit_threshold = if mv.high_crit { 12 } else { 6 };
            let crit = (rng.next_u32() % 100) < crit_threshold;
            let variance = 85 + (rng.next_u32() % 16) as i32;
            let (dmg, typ) = {
                let att = self.side(side).active();
                let def = self.side(foe).active();
                damage(att, def, &mv, crit, variance)
            };
            let def = self.side_mut(foe).active_mut();
            def.hp = (def.hp - dmg).max(0);
            let fainted = def.hp == 0;
            let target_hp = def.hp;
            events.push(BattleEvent::Damage {
                side,
                dmg,
                crit,
                effect: effectiveness_bucket(typ),
                target_hp,
            });
            // Recoil / drain.
            if mv.recoil > 0.0 && dmg > 0 {
                let c = self.side_mut(side).active_mut();
                c.hp = (c.hp - (dmg as f32 * mv.recoil) as i32).max(0);
            }
            if mv.drain > 0.0 && dmg > 0 {
                let c = self.side_mut(side).active_mut();
                c.hp = (c.hp + (dmg as f32 * mv.drain) as i32).min(c.max_hp);
            }
            if fainted {
                events.push(BattleEvent::Faint { side: foe });
            }
        }

        // Status infliction on the foe.
        if mv.status != PetStatus::None
            && self.side(foe).active().is_alive()
            && self.side(foe).active().status == PetStatus::None
            && ((rng.next_u32() % 100) as f32) < mv.status_chance.max(0.0) * 100.0
        {
            self.side_mut(foe).active_mut().status = mv.status;
            events.push(BattleEvent::StatusApplied {
                side: foe,
                status: mv.status,
            });
        }

        // Stat stages.
        for sm in &mv.stat_mods {
            if (rng.next_u32() % 100) as f32 >= sm.chance * 100.0 {
                continue;
            }
            let target = if sm.on_self { side } else { foe };
            if !self.side(target).active().is_alive() {
                continue;
            }
            let c = self.side_mut(target).active_mut();
            let i = sm.stat as usize;
            let before = c.stages[i];
            c.stages[i] = (c.stages[i] + sm.stages).clamp(-6, 6);
            if c.stages[i] != before {
                events.push(BattleEvent::StatStage {
                    side: target,
                    stat: sm.stat,
                    stages: c.stages[i] - before,
                });
            }
        }
    }

    /// End-of-turn residual damage from burn/poison on each living active.
    fn end_of_turn(&mut self, events: &mut Vec<BattleEvent>) {
        for side in [Side::Player, Side::Enemy] {
            let c = self.side(side).active();
            if !c.is_alive() {
                continue;
            }
            let dmg = match c.status {
                PetStatus::Burn => (c.max_hp / 16).max(1),
                PetStatus::Poison => (c.max_hp / 8).max(1),
                _ => 0,
            };
            if dmg == 0 {
                continue;
            }
            let status = c.status;
            let c = self.side_mut(side).active_mut();
            c.hp = (c.hp - dmg).max(0);
            events.push(BattleEvent::StatusDamage {
                side,
                status,
                dmg,
                hp: c.hp,
            });
            if c.hp == 0 {
                events.push(BattleEvent::Faint { side });
            }
        }
    }

    fn check_outcome(&mut self, events: &mut Vec<BattleEvent>) {
        if self.outcome != BattleOutcome::Ongoing {
            return;
        }
        let new = if !self.enemy.any_alive() {
            BattleOutcome::PlayerWon
        } else if !self.player.any_alive() {
            BattleOutcome::PlayerLost
        } else {
            BattleOutcome::Ongoing
        };
        if new != BattleOutcome::Ongoing {
            self.outcome = new;
            events.push(BattleEvent::Outcome(new));
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::data::{NpcMovepoolEntry, NpcPet, NpcStats};
    use crate::pets::mint_pet_from_species;

    fn ability(id: &str, power: i32, cat: &str, elem: &str) -> NpcAbility {
        NpcAbility {
            id: id.into(),
            power,
            max_pp: 20,
            category: cat.into(),
            element: elem.into(),
            hit_chance: 1.0,
            ..Default::default()
        }
    }

    fn mechamutt() -> NpcDef {
        NpcDef {
            ref_id: "mechamutt".into(),
            name: "Mechamutt".into(),
            level: 5,
            element: "ELEMENT_LIGHTNING".into(),
            stats: NpcStats {
                hp: 45,
                max_hp: 45,
                attack: 9,
                defense: 7,
                speed: 11,
                special_attack: 12,
                special_defense: 8,
            },
            equipment: None,
            faction: None,
            shop_items: vec![],
            abilities: vec![
                ability("tackle", 12, "MOVE_CATEGORY_PHYSICAL", ""),
                ability(
                    "spark-bark",
                    18,
                    "MOVE_CATEGORY_SPECIAL",
                    "ELEMENT_LIGHTNING",
                ),
            ],
            pet: Some(NpcPet {
                catchable: true,
                movepool: vec![
                    NpcMovepoolEntry {
                        level: 1,
                        ability_id: "tackle".into(),
                    },
                    NpcMovepoolEntry {
                        level: 1,
                        ability_id: "spark-bark".into(),
                    },
                ],
                ..Default::default()
            }),
        }
    }

    fn combatant(level: u32) -> Combatant {
        let def = mechamutt();
        let snap = mint_pet_from_species(&def, level).unwrap();
        Combatant::from_pet(&snap, &def)
    }

    #[test]
    fn type_chart_super_and_resist() {
        assert_eq!(type_multiplier(Element::Fire, Element::Nature), 2.0);
        assert_eq!(type_multiplier(Element::Lightning, Element::Earth), 0.5);
        assert_eq!(type_multiplier(Element::Lightning, Element::Wind), 2.0);
        assert_eq!(type_multiplier(Element::Arcane, Element::Fire), 1.0);
    }

    #[test]
    fn stab_boosts_same_type_damage() {
        let att = combatant(20);
        let def = combatant(20);
        let tackle = MoveData::from_ability(&mechamutt().abilities[0]); // no element
        let spark = MoveData::from_ability(&mechamutt().abilities[1]); // lightning == user
        let (dt, _) = damage(&att, &def, &tackle, false, 100);
        let (ds, _) = damage(&att, &def, &spark, false, 100);
        // Spark is special (uses sp_atk 12 > atk) AND gets STAB; clearly bigger.
        assert!(
            ds > dt,
            "stab+special {ds} should exceed neutral physical {dt}"
        );
    }

    #[test]
    fn from_pet_resolves_moves_and_typing() {
        let c = combatant(5);
        assert_eq!(c.element, Element::Lightning);
        let ids: Vec<&str> = c.moves.iter().map(|m| m.data.id.as_str()).collect();
        assert_eq!(ids, vec!["tackle", "spark-bark"]);
    }

    #[test]
    fn battle_runs_deterministically_to_a_winner() {
        let run = || {
            let mut b = BattleState::wild(0xC0FFEE, vec![combatant(8)], combatant(6));
            let mut guard = 0;
            while b.outcome == BattleOutcome::Ongoing && guard < 200 {
                b.resolve_turn(
                    BattleAction::Move { slot: 1 },
                    BattleAction::Move { slot: 0 },
                );
                guard += 1;
            }
            (b.outcome, guard)
        };
        let a = run();
        let b = run();
        assert_eq!(a, b, "same seed + actions → identical battle");
        assert_eq!(a.0, BattleOutcome::PlayerWon, "higher-level lead wins");
    }

    #[test]
    fn swap_changes_active_pet() {
        let mut b = BattleState::wild(1, vec![combatant(10), combatant(10)], combatant(5));
        let ev = b.resolve_turn(BattleAction::Swap { to: 1 }, BattleAction::Move { slot: 0 });
        assert_eq!(b.player.active, 1);
        assert!(
            ev.iter()
                .any(|e| matches!(e, BattleEvent::SwapIn { to: 1, .. }))
        );
    }

    #[test]
    fn item_heals_active() {
        let mut b = BattleState::wild(1, vec![combatant(10)], combatant(5));
        b.player.team[0].hp = 5;
        b.resolve_turn(BattleAction::UseItem { heal: 20 }, BattleAction::Run);
        assert_eq!(b.player.team[0].hp, 25);
    }

    #[test]
    fn run_ends_the_battle() {
        let mut b = BattleState::wild(1, vec![combatant(5)], combatant(5));
        let ev = b.resolve_turn(BattleAction::Run, BattleAction::Move { slot: 0 });
        assert_eq!(b.outcome, BattleOutcome::Fled);
        assert!(
            ev.iter()
                .any(|e| matches!(e, BattleEvent::Outcome(BattleOutcome::Fled)))
        );
    }

    #[test]
    fn burn_chips_at_end_of_turn() {
        let mut b = BattleState::wild(1, vec![combatant(10)], combatant(50));
        b.player.team[0].status = PetStatus::Burn;
        let hp0 = b.player.team[0].hp;
        // Enemy far higher level but we only care the burn ticked our active.
        b.resolve_turn(
            BattleAction::UseItem { heal: 0 },
            BattleAction::Swap { to: 0 },
        );
        assert!(b.player.team[0].hp < hp0, "burn chipped hp at end of turn");
    }
}
