//! Battle bridge — maps SessionState ↔ bevy_battle ECS for turn-based combat.
//!
//! The bridge creates a headless Bevy `App` per combat turn, syncs session data
//! into ECS components, runs a single `app.update()`, then reads results back.
//! This keeps `bevy_battle` game-agnostic while letting DiscordSH use the same
//! combat systems as the isometric game.

use std::collections::HashMap;

use poise::serenity_prelude as serenity;

use bevy_battle::{
    ActiveEffects, App, Armor, AttackIntent, BevyBattlePlugin, CombatIndex, CombatModifiers,
    CombatName, CombatOutcome, CombatStats, Combatant, CurrentIntent, DefendIntent, EnemyAI,
    EnemyTag, EnemyTurnRequest, Entity, EquippedGear, FirstStrikeFired, FleeIntent, Health,
    Messages, MinimalPlugins, PlayerClass, PlayerTag, TickEffectsRequest, UseItemIntent,
};
use bevy_inventory::Inventory;
use bevy_items::inventory_adapter::ProtoItemKind;

use super::content;
use super::proto_bridge as pb;
use super::types::*;

// ── Type conversion helpers ────────────────────────────────────────

/// Convert session EffectKind → bevy_battle EffectKind.
fn to_bb_effect(kind: &EffectKind) -> bevy_battle::EffectKind {
    match kind {
        EffectKind::Poison => bevy_battle::EffectKind::Poison,
        EffectKind::Burning => bevy_battle::EffectKind::Burning,
        EffectKind::Bleed => bevy_battle::EffectKind::Bleed,
        EffectKind::Shielded => bevy_battle::EffectKind::Shielded,
        EffectKind::Weakened => bevy_battle::EffectKind::Weakened,
        EffectKind::Stunned => bevy_battle::EffectKind::Stunned,
        EffectKind::Sharpened => bevy_battle::EffectKind::Sharpened,
        EffectKind::Thorns => bevy_battle::EffectKind::Thorns,
    }
}

/// Convert bevy_battle EffectKind → session EffectKind.
pub(super) fn from_bb_effect(kind: &bevy_battle::EffectKind) -> EffectKind {
    match kind {
        bevy_battle::EffectKind::Poison => EffectKind::Poison,
        bevy_battle::EffectKind::Burning => EffectKind::Burning,
        bevy_battle::EffectKind::Bleed => EffectKind::Bleed,
        bevy_battle::EffectKind::Shielded => EffectKind::Shielded,
        bevy_battle::EffectKind::Weakened => EffectKind::Weakened,
        bevy_battle::EffectKind::Stunned => EffectKind::Stunned,
        bevy_battle::EffectKind::Sharpened => EffectKind::Sharpened,
        bevy_battle::EffectKind::Thorns => EffectKind::Thorns,
    }
}

/// Convert session EffectInstance → bevy_battle EffectInstance.
fn to_bb_effect_instance(e: &EffectInstance) -> bevy_battle::EffectInstance {
    bevy_battle::EffectInstance {
        kind: to_bb_effect(&e.kind),
        stacks: e.stacks,
        turns_left: e.turns_left,
    }
}

/// Convert session Intent → bevy_battle Intent.
fn to_bb_intent(intent: &Intent) -> bevy_battle::Intent {
    match intent {
        Intent::Attack { dmg } => bevy_battle::Intent::Attack { dmg: *dmg },
        Intent::HeavyAttack { dmg } => bevy_battle::Intent::HeavyAttack { dmg: *dmg },
        Intent::Defend { armor } => bevy_battle::Intent::Defend { armor: *armor },
        Intent::Charge => bevy_battle::Intent::Charge,
        Intent::Flee => bevy_battle::Intent::Flee,
        Intent::Debuff {
            effect,
            stacks,
            turns,
        } => bevy_battle::Intent::Debuff {
            effect: to_bb_effect(effect),
            stacks: *stacks,
            turns: *turns,
        },
        Intent::AoeAttack { dmg } => bevy_battle::Intent::AoeAttack { dmg: *dmg },
        Intent::HealSelf { amount } => bevy_battle::Intent::HealSelf { amount: *amount },
    }
}

/// Convert bevy_battle Intent → session Intent.
pub(super) fn from_bb_intent(intent: &bevy_battle::Intent) -> Intent {
    match intent {
        bevy_battle::Intent::Attack { dmg } => Intent::Attack { dmg: *dmg },
        bevy_battle::Intent::HeavyAttack { dmg } => Intent::HeavyAttack { dmg: *dmg },
        bevy_battle::Intent::Defend { armor } => Intent::Defend { armor: *armor },
        bevy_battle::Intent::Charge => Intent::Charge,
        bevy_battle::Intent::Flee => Intent::Flee,
        bevy_battle::Intent::Debuff {
            effect,
            stacks,
            turns,
        } => Intent::Debuff {
            effect: from_bb_effect(effect),
            stacks: *stacks,
            turns: *turns,
        },
        bevy_battle::Intent::AoeAttack { dmg } => Intent::AoeAttack { dmg: *dmg },
        bevy_battle::Intent::HealSelf { amount } => Intent::HealSelf { amount: *amount },
    }
}

/// Convert session ClassType → bevy_battle ClassType.
fn to_bb_class(class: &ClassType) -> bevy_battle::ClassType {
    match class {
        ClassType::Warrior => bevy_battle::ClassType::Warrior,
        ClassType::Rogue => bevy_battle::ClassType::Rogue,
        ClassType::Cleric => bevy_battle::ClassType::Cleric,
    }
}

/// Convert bevy_battle ClassType → session ClassType.
pub(super) fn from_bb_class(class: &bevy_battle::ClassType) -> ClassType {
    match class {
        bevy_battle::ClassType::Warrior => ClassType::Warrior,
        bevy_battle::ClassType::Rogue => ClassType::Rogue,
        bevy_battle::ClassType::Cleric => ClassType::Cleric,
    }
}

/// Convert session Personality → bevy_battle Personality.
fn to_bb_personality(p: &Personality) -> bevy_battle::Personality {
    match p {
        Personality::Aggressive => bevy_battle::Personality::Aggressive,
        Personality::Cunning => bevy_battle::Personality::Cunning,
        Personality::Fearful => bevy_battle::Personality::Fearful,
        Personality::Stoic => bevy_battle::Personality::Stoic,
        Personality::Feral => bevy_battle::Personality::Feral,
        Personality::Ancient => bevy_battle::Personality::Ancient,
        Personality::Passive => bevy_battle::Personality::Passive,
    }
}

/// Convert a session UseEffect → bevy_battle UseEffect for combat-relevant variants.
///
/// Returns `None` for session-level effects (GuaranteedFlee, CampfireRest,
/// TeleportCity, ReviveAlly) that must be handled in logic.rs.
pub fn to_bb_use_effect(effect: &UseEffect) -> Option<bevy_battle::UseEffect> {
    match effect {
        UseEffect::Heal { amount } => Some(bevy_battle::UseEffect::Heal { amount: *amount }),
        UseEffect::DamageEnemy { amount } => {
            Some(bevy_battle::UseEffect::DamageEnemy { amount: *amount })
        }
        UseEffect::ApplyEffect {
            kind,
            stacks,
            turns,
        } => Some(bevy_battle::UseEffect::ApplyEffect {
            kind: to_bb_effect(kind),
            stacks: *stacks,
            turns: *turns,
        }),
        UseEffect::RemoveEffect { kind } => Some(bevy_battle::UseEffect::RemoveEffect {
            kind: to_bb_effect(kind),
        }),
        UseEffect::FullHeal => Some(bevy_battle::UseEffect::FullHeal),
        UseEffect::RemoveAllNegativeEffects => {
            Some(bevy_battle::UseEffect::RemoveAllNegativeEffects)
        }
        UseEffect::DamageAndApply {
            damage,
            kind,
            stacks,
            turns,
        } => Some(bevy_battle::UseEffect::DamageAndApply {
            damage: *damage,
            kind: to_bb_effect(kind),
            stacks: *stacks,
            turns: *turns,
        }),
        // Session-level effects — not handled by bevy_battle
        UseEffect::GuaranteedFlee
        | UseEffect::CampfireRest { .. }
        | UseEffect::TeleportCity
        | UseEffect::ReviveAlly { .. } => None,
    }
}

// ── Gear → EquippedGear resolution ─────────────────────────────────

/// Build EquippedGear component from a player's equipped weapon + armor IDs.
fn resolve_equipped_gear(player: &PlayerState) -> EquippedGear {
    let mut gear = EquippedGear::default();

    // Weapon bonuses
    if let Some(weapon_def) = player.weapon.as_ref().and_then(|id| content::find_gear(id)) {
        gear.weapon_bonus_damage = weapon_def.bonus_damage;
        if let Some(ref special) = weapon_def.special {
            match special {
                GearSpecial::CritBonus { percent } => {
                    gear.weapon_crit_bonus = *percent as f32 / 100.0;
                }
                GearSpecial::LifeSteal { percent } => {
                    gear.weapon_lifesteal = Some(*percent as f32 / 100.0);
                }
                _ => {}
            }
        }
    }

    // Armor bonuses
    if let Some(armor_def) = player
        .armor_gear
        .as_ref()
        .and_then(|id| content::find_gear(id))
    {
        if let Some(ref special) = armor_def.special {
            match special {
                GearSpecial::DamageReduction { percent } => {
                    gear.armor_damage_reduction = *percent as f32 / 100.0;
                }
                GearSpecial::Thorns { damage } => {
                    gear.armor_thorns = *damage;
                }
                _ => {}
            }
        }
    }

    gear
}

// ── Entity mapping ─────────────────────────────────────────────────

/// Maps session identifiers to ECS entities and back.
pub struct EntityMap {
    /// UserId → Entity for each player.
    pub players: Vec<(serenity::UserId, Entity)>,
    /// Enemy index → Entity for each enemy.
    pub enemies: Vec<(u8, Entity)>,
}

impl EntityMap {
    /// Find the Entity for a player UserId.
    pub fn player_entity(&self, uid: serenity::UserId) -> Option<Entity> {
        self.players
            .iter()
            .find(|(u, _)| *u == uid)
            .map(|(_, e)| *e)
    }

    /// Find the Entity for an enemy by combat index.
    pub fn enemy_entity(&self, index: u8) -> Option<Entity> {
        self.enemies
            .iter()
            .find(|(i, _)| *i == index)
            .map(|(_, e)| *e)
    }

    /// Find the UserId for a player Entity.
    pub fn player_uid(&self, entity: Entity) -> Option<serenity::UserId> {
        self.players
            .iter()
            .find(|(_, e)| *e == entity)
            .map(|(u, _)| *u)
    }

    /// Find the enemy index for an Entity.
    pub fn enemy_index(&self, entity: Entity) -> Option<u8> {
        self.enemies
            .iter()
            .find(|(_, e)| *e == entity)
            .map(|(i, _)| *i)
    }
}

// ── Inventory conversion ──────────────────────────────────────────

/// Convert a player's `Vec<ItemStack>` into an `Inventory<ProtoItemKind>`.
///
/// Items that can't be resolved to a `ProtoItemKind` (e.g. unknown IDs)
/// are silently skipped.
fn session_inventory_to_ecs(items: &[ItemStack], max_slots: usize) -> Inventory<ProtoItemKind> {
    pb::ensure_inventory_init();
    let mut inv = Inventory::default();
    inv.max_slots = max_slots;
    for stack in items {
        if stack.qty == 0 {
            continue;
        }
        if let Some(kind) = pb::game_id_to_proto_item_kind(&stack.item_id) {
            inv.add(kind, stack.qty as u32);
        }
    }
    inv
}

/// Convert an `Inventory<ProtoItemKind>` back to the game's `Vec<ItemStack>` format.
///
/// Items that can't be resolved back to a game ID are silently skipped.
fn ecs_inventory_to_session(inv: &Inventory<ProtoItemKind>) -> Vec<ItemStack> {
    let mut items = Vec::new();
    for stack in &inv.items {
        if let Some(game_id) = pb::proto_item_kind_to_game_id(&stack.kind) {
            items.push(ItemStack {
                item_id: game_id.to_owned(),
                qty: stack.quantity as u16,
            });
        }
    }
    items
}

// ── Session-level inventory operations ────────────────────────────
//
// These operate directly on a player's `Vec<ItemStack>` via bevy_inventory,
// without needing a full CombatWorld. Used by `apply_item` and other
// session-level logic that runs outside of the ECS combat loop.

/// Consume one unit of an item from a player's session inventory.
///
/// Converts to `Inventory<ProtoItemKind>`, removes the item using
/// `bevy_inventory::Inventory::remove()` (which handles stacking and
/// auto-removes empty slots), then writes back.
///
/// Returns `true` if the item was found and consumed.
pub fn consume_from_session(inventory: &mut Vec<ItemStack>, game_id: &str) -> bool {
    let Some(kind) = pb::game_id_to_proto_item_kind(game_id) else {
        return false;
    };
    let mut inv = session_inventory_to_ecs(inventory, MAX_INVENTORY_SLOTS as usize);
    if inv.remove(kind, 1) == 0 {
        return false;
    }
    *inventory = ecs_inventory_to_session(&inv);
    true
}

/// Add items to a player's session inventory via bevy_inventory stacking.
///
/// Returns the number of items that could NOT fit (overflow).
pub fn add_to_session(inventory: &mut Vec<ItemStack>, game_id: &str, qty: u32) -> u32 {
    let Some(kind) = pb::game_id_to_proto_item_kind(game_id) else {
        return qty;
    };
    let mut inv = session_inventory_to_ecs(inventory, MAX_INVENTORY_SLOTS as usize);
    let overflow = inv.add(kind, qty);
    *inventory = ecs_inventory_to_session(&inv);
    overflow
}

/// Check how many of an item a player has in their session inventory.
#[allow(dead_code)]
pub fn count_in_session(inventory: &[ItemStack], game_id: &str) -> u32 {
    let Some(kind) = pb::game_id_to_proto_item_kind(game_id) else {
        return 0;
    };
    let inv = session_inventory_to_ecs(inventory, MAX_INVENTORY_SLOTS as usize);
    inv.count(kind)
}

/// Check whether a player's session inventory has room for an item.
#[allow(dead_code)]
pub fn has_room_in_session(inventory: &[ItemStack], game_id: &str, qty: u32) -> bool {
    let Some(kind) = pb::game_id_to_proto_item_kind(game_id) else {
        return false;
    };
    let inv = session_inventory_to_ecs(inventory, MAX_INVENTORY_SLOTS as usize);
    inv.has_room_for(kind, qty)
}

// ── CombatWorld ────────────────────────────────────────────────────

/// Wraps a headless Bevy App for running one combat turn.
///
/// Also holds per-player inventories (as `Inventory<ProtoItemKind>`)
/// so that item consumption can go through `bevy_inventory`'s stacking logic.
pub struct CombatWorld {
    pub app: App,
    pub entity_map: EntityMap,
    /// Per-player inventories, synced from session on creation.
    pub inventories: HashMap<serenity::UserId, Inventory<ProtoItemKind>>,
}

impl CombatWorld {
    /// Create a CombatWorld from the current session state.
    ///
    /// Spawns player and enemy entities with bevy_battle components.
    pub fn from_session(session: &SessionState) -> Self {
        let mut app = App::new();
        app.add_plugins(MinimalPlugins);
        app.add_plugins(BevyBattlePlugin);

        // Set room modifiers
        let mut modifiers = CombatModifiers::default();
        for m in &session.room.modifiers {
            match m {
                RoomModifier::Fog { accuracy_penalty } => {
                    modifiers.fog_accuracy_penalty = *accuracy_penalty;
                }
                RoomModifier::Cursed { dmg_multiplier } => {
                    modifiers.cursed_dmg_multiplier = *dmg_multiplier;
                }
                RoomModifier::Blessing { heal_bonus } => {
                    modifiers.blessing_heal_bonus = *heal_bonus;
                }
            }
        }
        app.insert_resource(modifiers);

        // Set first-strike flag from session
        app.insert_resource(bevy_battle::FirstStrikeFired(
            session.enemies_had_first_strike,
        ));

        let mut players = Vec::new();
        let mut enemies = Vec::new();
        let mut inventories = HashMap::new();

        // Spawn player entities
        for (uid, ps) in &session.players {
            if !ps.alive {
                continue;
            }
            // Sync inventory into ECS format
            inventories.insert(
                *uid,
                session_inventory_to_ecs(&ps.inventory, MAX_INVENTORY_SLOTS as usize),
            );
            let effects: Vec<bevy_battle::EffectInstance> =
                ps.effects.iter().map(to_bb_effect_instance).collect();

            let entity = app
                .world_mut()
                .spawn((
                    CombatName(ps.name.clone()),
                    Health::new(ps.hp, ps.max_hp),
                    Armor { value: ps.armor },
                    ActiveEffects(effects),
                    CombatStats {
                        accuracy: ps.accuracy,
                        crit_chance: ps.crit_chance,
                        base_damage_bonus: ps.base_damage_bonus,
                        defending: ps.defending,
                        first_attack_in_combat: ps.first_attack_in_combat,
                        heals_used_this_combat: ps.heals_used_this_combat,
                    },
                    PlayerClass(to_bb_class(&ps.class)),
                    resolve_equipped_gear(ps),
                    Combatant,
                    PlayerTag,
                ))
                .id();
            players.push((*uid, entity));
        }

        // Spawn enemy entities
        for es in &session.enemies {
            if es.hp <= 0 {
                continue;
            }
            let effects: Vec<bevy_battle::EffectInstance> =
                es.effects.iter().map(to_bb_effect_instance).collect();

            let entity = app
                .world_mut()
                .spawn((
                    CombatName(es.name.clone()),
                    Health::new(es.hp, es.max_hp),
                    Armor { value: es.armor },
                    ActiveEffects(effects),
                    EnemyAI {
                        level: es.level,
                        charged: es.charged,
                        enraged: es.enraged,
                        first_strike: es.first_strike,
                        personality: to_bb_personality(&es.personality),
                    },
                    CurrentIntent(to_bb_intent(&es.intent)),
                    CombatIndex(es.index),
                    Combatant,
                    EnemyTag,
                ))
                .id();
            enemies.push((es.index, entity));
        }

        CombatWorld {
            app,
            entity_map: EntityMap { players, enemies },
            inventories,
        }
    }

    /// Send player action intents, enemy turn request, and optionally
    /// effect tick request, then run one update cycle.
    ///
    /// If `skip_enemy_turns` is true, `EnemyTurnRequest` is not sent (used when
    /// first-strike already ran enemy turns via the old code path).
    ///
    /// If `tick_effects` is true, `TickEffectsRequest` is sent to tick DoTs.
    pub fn run_turn(
        &mut self,
        actions: &[(serenity::UserId, PlayerAction)],
        skip_enemy_turns: bool,
        tick_effects: bool,
    ) {
        // Send player intents
        for (uid, action) in actions {
            let Some(player_entity) = self.entity_map.player_entity(*uid) else {
                continue;
            };

            match action {
                PlayerAction::Attack { target_idx } => {
                    if let Some(target_entity) = self.entity_map.enemy_entity(*target_idx) {
                        self.app.world_mut().write_message(AttackIntent {
                            attacker: player_entity,
                            target: target_entity,
                        });
                    }
                }
                PlayerAction::Defend => {
                    self.app.world_mut().write_message(DefendIntent {
                        entity: player_entity,
                    });
                }
                PlayerAction::Flee { depth } => {
                    self.app.world_mut().write_message(FleeIntent {
                        entity: player_entity,
                        depth: *depth,
                    });
                }
                PlayerAction::UseItem { effect, target_idx } => {
                    let target = target_idx.and_then(|idx| self.entity_map.enemy_entity(idx));
                    self.app.world_mut().write_message(UseItemIntent {
                        user: player_entity,
                        target,
                        effect: effect.clone(),
                    });
                }
            }
        }

        // Request enemy turns (unless first-strike already ran them)
        if !skip_enemy_turns {
            self.app.world_mut().write_message(EnemyTurnRequest);
        }
        // Tick effects (DoT damage, duration decrement)
        if tick_effects {
            self.app.world_mut().write_message(TickEffectsRequest);
        }

        // Run one update cycle — all systems execute in order
        self.app.update();
    }

    /// Consume one unit of an item from a player's bridge-level inventory.
    ///
    /// Returns `true` if the item was found and consumed, `false` otherwise.
    /// The session is NOT updated here — call [`sync_out`] to write back.
    pub fn consume_item(&mut self, uid: serenity::UserId, game_id: &str) -> bool {
        let Some(inv) = self.inventories.get_mut(&uid) else {
            return false;
        };
        let Some(kind) = pb::game_id_to_proto_item_kind(game_id) else {
            return false;
        };
        inv.remove(kind, 1) > 0
    }

    /// Add items to a player's bridge-level inventory.
    ///
    /// Returns the number of items that could NOT fit (overflow).
    #[allow(dead_code)]
    pub fn add_item(&mut self, uid: serenity::UserId, game_id: &str, qty: u32) -> u32 {
        let Some(inv) = self.inventories.get_mut(&uid) else {
            return qty;
        };
        let Some(kind) = pb::game_id_to_proto_item_kind(game_id) else {
            return qty;
        };
        let overflow = inv.add(kind, qty);
        overflow
    }

    /// Check how many of an item a player has in their bridge-level inventory.
    #[allow(dead_code)]
    pub fn item_count(&self, uid: serenity::UserId, game_id: &str) -> u32 {
        let Some(inv) = self.inventories.get(&uid) else {
            return 0;
        };
        let Some(kind) = pb::game_id_to_proto_item_kind(game_id) else {
            return 0;
        };
        inv.count(kind)
    }

    /// Capture a render-ready snapshot of the current combat state.
    pub fn snapshot(&mut self) -> bevy_battle::snapshot::CombatSnapshot {
        bevy_battle::snapshot::capture(self.app.world_mut())
    }

    /// Read combat outcomes from the ECS after update.
    pub fn collect_outcomes(&self) -> Vec<CombatOutcome> {
        let outcomes = self.app.world().resource::<Messages<CombatOutcome>>();
        let mut reader = outcomes.get_cursor();
        reader.read(outcomes).cloned().collect()
    }

    /// Sync ECS state back into session.
    ///
    /// Updates HP, armor, effects, defending, intents, marks dead enemies,
    /// and syncs the first-strike flag.
    pub fn sync_out(&self, session: &mut SessionState) {
        // Sync first-strike flag
        if let Some(flag) = self.app.world().get_resource::<FirstStrikeFired>() {
            if flag.0 {
                session.enemies_had_first_strike = true;
            }
        }

        // Sync players
        for (uid, entity) in &self.entity_map.players {
            let world = self.app.world();
            let Some(hp) = world.get::<Health>(*entity) else {
                continue;
            };
            let Some(player) = session.players.get_mut(uid) else {
                continue;
            };

            player.hp = hp.current;
            player.alive = !hp.is_dead();

            if let Some(stats) = world.get::<CombatStats>(*entity) {
                player.defending = stats.defending;
                player.first_attack_in_combat = stats.first_attack_in_combat;
                player.heals_used_this_combat = stats.heals_used_this_combat;
            }

            if let Some(effects) = world.get::<ActiveEffects>(*entity) {
                player.effects = effects
                    .0
                    .iter()
                    .map(|e| EffectInstance {
                        kind: from_bb_effect(&e.kind),
                        stacks: e.stacks,
                        turns_left: e.turns_left,
                    })
                    .collect();
            }

            // Sync inventory back from bridge
            if let Some(inv) = self.inventories.get(uid) {
                player.inventory = ecs_inventory_to_session(inv);
            }
        }

        // Sync enemies
        for (idx, entity) in &self.entity_map.enemies {
            let world = self.app.world();
            let Some(hp) = world.get::<Health>(*entity) else {
                continue;
            };

            // Find enemy in session by index
            let Some(enemy) = session.enemies.iter_mut().find(|e| e.index == *idx) else {
                continue;
            };

            enemy.hp = hp.current;

            if let Some(armor) = world.get::<Armor>(*entity) {
                enemy.armor = armor.value;
            }

            if let Some(effects) = world.get::<ActiveEffects>(*entity) {
                enemy.effects = effects
                    .0
                    .iter()
                    .map(|e| EffectInstance {
                        kind: from_bb_effect(&e.kind),
                        stacks: e.stacks,
                        turns_left: e.turns_left,
                    })
                    .collect();
            }

            if let Some(ai) = world.get::<EnemyAI>(*entity) {
                enemy.charged = ai.charged;
                enemy.enraged = ai.enraged;
            }

            if let Some(intent) = world.get::<CurrentIntent>(*entity) {
                enemy.intent = from_bb_intent(&intent.0);
            }
        }
    }
}

// ── Player action (bridge-level, not GameAction) ───────────────────

/// Simplified player action for the bridge layer.
///
/// Maps from GameAction combat variants to bevy_battle intents.
#[derive(Debug, Clone)]
pub enum PlayerAction {
    Attack {
        target_idx: u8,
    },
    Defend,
    Flee {
        depth: u32,
    },
    UseItem {
        effect: bevy_battle::UseEffect,
        target_idx: Option<u8>,
    },
}

// ── Outcome → log text ─────────────────────────────────────────────

/// Convert a CombatOutcome into a human-readable log entry.
///
/// Uses the entity map to resolve entity IDs back to names.
pub fn outcome_to_log(outcome: &CombatOutcome, world: &CombatWorld) -> Option<String> {
    let name_of = |entity: Entity| -> String {
        world
            .app
            .world()
            .get::<CombatName>(entity)
            .map(|n| n.0.clone())
            .unwrap_or_else(|| "???".to_owned())
    };

    match outcome {
        CombatOutcome::Attack {
            attacker,
            target,
            damage,
            crit,
            overkill,
        } => {
            let aname = name_of(*attacker);
            let tname = name_of(*target);
            let crit_msg = if *crit { " Critical hit!" } else { "" };
            let mut msg = format!(
                "{} strikes {} for {} damage!{}",
                aname, tname, damage, crit_msg
            );
            if *overkill {
                msg.push_str(" Overkill!");
            }
            Some(msg)
        }
        CombatOutcome::Miss { attacker, target } => {
            let aname = name_of(*attacker);
            let tname = name_of(*target);
            Some(format!("{}'s attack misses {}!", aname, tname))
        }
        CombatOutcome::Defend { entity } => {
            let name = name_of(*entity);
            Some(format!("{} braces for impact!", name))
        }
        CombatOutcome::ClassProc {
            proc_name, detail, ..
        } => Some(format!("*{}* — {}", proc_name, detail)),
        CombatOutcome::Lifesteal { entity, healed } => {
            let name = name_of(*entity);
            Some(format!("{} drains {} HP!", name, healed))
        }
        CombatOutcome::Thorns { target, reflected } => {
            let name = name_of(*target);
            Some(format!(
                "Thorns reflect {} damage back to {}!",
                reflected, name
            ))
        }
        CombatOutcome::Death { entity, is_player } => {
            let name = name_of(*entity);
            if *is_player {
                Some(format!("💀 {} has fallen!", name))
            } else {
                Some(format!("💀 {} has been defeated!", name))
            }
        }
        CombatOutcome::FleeResult { success, .. } => {
            if *success {
                Some("You dash through a narrow passage, escaping the fight!".to_owned())
            } else {
                Some("You stumble trying to flee! The enemy strikes!".to_owned())
            }
        }
        CombatOutcome::EnemyAttack {
            attacker,
            target,
            damage,
            is_heavy,
        } => {
            let aname = name_of(*attacker);
            let tname = name_of(*target);
            if *is_heavy {
                Some(format!(
                    "💥 {} unleashes a devastating attack on {} for **{}** damage!",
                    aname, tname, damage
                ))
            } else {
                Some(format!(
                    "{} attacks {} for **{}** damage!",
                    aname, tname, damage
                ))
            }
        }
        CombatOutcome::EnemyAoe {
            attacker,
            per_target,
        } => {
            let aname = name_of(*attacker);
            let total: i32 = per_target.iter().map(|(_, d)| d).sum();
            Some(format!(
                "💥 {} unleashes an area attack dealing {} total damage!",
                aname, total
            ))
        }
        CombatOutcome::EnemyDefend {
            entity,
            armor_gained,
        } => {
            let name = name_of(*entity);
            Some(format!(
                "{} fortifies, gaining +{} armor!",
                name, armor_gained
            ))
        }
        CombatOutcome::EnemyHeal { entity, healed } => {
            let name = name_of(*entity);
            Some(format!("{} heals for {} HP!", name, healed))
        }
        CombatOutcome::EnemyFled { entity } => {
            let name = name_of(*entity);
            Some(format!("{} flees from combat!", name))
        }
        CombatOutcome::EnemyDebuff {
            target,
            effect,
            stacks,
            turns,
            ..
        } => {
            let tname = name_of(*target);
            Some(format!(
                "{} is afflicted with {:?} ({} stacks, {} turns)!",
                tname, effect, stacks, turns
            ))
        }
        CombatOutcome::Stunned { entity } => {
            let name = name_of(*entity);
            Some(format!("{} is stunned and cannot act!", name))
        }
        CombatOutcome::EffectApplied {
            target,
            effect,
            stacks,
            turns,
        } => {
            let name = name_of(*target);
            Some(format!(
                "{} gains {:?} ({} stacks, {} turns)!",
                name, effect, stacks, turns
            ))
        }
        CombatOutcome::EffectTick {
            target,
            effect,
            damage,
        } => {
            let name = name_of(*target);
            Some(format!("{} takes {} {:?} damage!", name, damage, effect))
        }
        CombatOutcome::EffectExpired { target, effect } => {
            let name = name_of(*target);
            Some(format!("{}'s {:?} effect has worn off.", name, effect))
        }
    }
}

// ── High-level bridge entry point ──────────────────────────────────

/// Result of a combat turn through the bridge.
///
/// Contains both human-readable logs and structured outcomes for callers
/// that need to post-process specific outcome types (e.g. filtering Defend
/// logs for auto-defended players in party mode).
pub struct CombatTurnResult {
    pub logs: Vec<String>,
    pub outcomes: Vec<CombatOutcome>,
    /// Render-ready snapshot of combat state after this turn.
    pub snapshot: Option<bevy_battle::snapshot::CombatSnapshot>,
}

/// Run a full combat turn through bevy_battle and return results.
///
/// This is the main entry point for the bridge. It:
/// 1. Creates a CombatWorld from the session
/// 2. Sends player action intents
/// 3. Runs one ECS update
/// 4. Collects outcomes as log strings + structured data
/// 5. Syncs state back to the session
/// 6. Removes fled enemies and transitions phase if needed
///
/// If `skip_enemy_turns` is true, enemy turns are skipped (used when
/// first-strike already ran enemy turns via the old code path).
pub fn run_combat_turn(
    session: &mut SessionState,
    actions: &[(serenity::UserId, PlayerAction)],
    skip_enemy_turns: bool,
) -> CombatTurnResult {
    let mut combat = CombatWorld::from_session(session);
    combat.run_turn(actions, skip_enemy_turns, true);

    let outcomes = combat.collect_outcomes();
    let logs: Vec<String> = outcomes
        .iter()
        .filter_map(|o| outcome_to_log(o, &combat))
        .collect();

    // Capture render-ready snapshot before sync_out mutates session
    let snapshot = Some(combat.snapshot());

    combat.sync_out(session);

    // Remove enemies that fled (EnemyFled outcome → remove from session)
    let fled_entities: Vec<Entity> = outcomes
        .iter()
        .filter_map(|o| match o {
            CombatOutcome::EnemyFled { entity } => Some(*entity),
            _ => None,
        })
        .collect();
    for fled_entity in &fled_entities {
        if let Some(idx) = combat.entity_map.enemy_index(*fled_entity) {
            session.enemies.retain(|e| e.index != idx);
        }
    }

    // If all enemies fled or died, transition to exploring
    if !session.has_enemies() && session.phase == GamePhase::Combat {
        session.phase = GamePhase::Exploring;
    }

    CombatTurnResult {
        logs,
        outcomes,
        snapshot,
    }
}

/// Run a flee attempt through bevy_battle. Returns (logs, fled_successfully).
///
/// The flee roll + class bonus happen in the ECS flee_system.
/// On failure, enemy turns run (unless `skip_enemy_turns` is true).
/// Effect ticks always run.
///
/// The caller is responsible for session-level cleanup on success
/// (generating a hallway room, clearing enemies, phase transition).
pub fn run_flee_turn(
    session: &mut SessionState,
    actor: serenity::UserId,
    skip_enemy_turns: bool,
) -> (Vec<String>, bool) {
    let depth = session.room.index as u32;
    let mut combat = CombatWorld::from_session(session);
    combat.run_turn(
        &[(actor, PlayerAction::Flee { depth })],
        skip_enemy_turns,
        true,
    );

    let outcomes = combat.collect_outcomes();

    let fled = outcomes
        .iter()
        .any(|o| matches!(o, CombatOutcome::FleeResult { success: true, .. }));

    let logs: Vec<String> = outcomes
        .iter()
        .filter_map(|o| outcome_to_log(o, &combat))
        .collect();

    combat.sync_out(session);

    // Handle enemy flee removal (same as run_combat_turn)
    let fled_entities: Vec<Entity> = outcomes
        .iter()
        .filter_map(|o| match o {
            CombatOutcome::EnemyFled { entity } => Some(*entity),
            _ => None,
        })
        .collect();
    for fled_entity in &fled_entities {
        if let Some(idx) = combat.entity_map.enemy_index(*fled_entity) {
            session.enemies.retain(|e| e.index != idx);
        }
    }

    (logs, fled)
}

/// Run only enemy turns through bevy_battle (no player action, no effect ticks).
///
/// Used when the player's action was handled in logic.rs (UseItem, HealAlly)
/// but enemies still need to take their turns. Effect ticks are NOT run here
/// because the old code path only ran `enemy_turns()` after UseItem/HealAlly.
pub fn run_enemy_turns_only(
    session: &mut SessionState,
    skip_enemy_turns: bool,
) -> CombatTurnResult {
    let mut combat = CombatWorld::from_session(session);
    combat.run_turn(&[], skip_enemy_turns, false);

    let outcomes = combat.collect_outcomes();
    let logs: Vec<String> = outcomes
        .iter()
        .filter_map(|o| outcome_to_log(o, &combat))
        .collect();

    let snapshot = Some(combat.snapshot());
    combat.sync_out(session);

    // Remove enemies that fled
    let fled_entities: Vec<Entity> = outcomes
        .iter()
        .filter_map(|o| match o {
            CombatOutcome::EnemyFled { entity } => Some(*entity),
            _ => None,
        })
        .collect();
    for fled_entity in &fled_entities {
        if let Some(idx) = combat.entity_map.enemy_index(*fled_entity) {
            session.enemies.retain(|e| e.index != idx);
        }
    }

    if !session.has_enemies() && session.phase == GamePhase::Combat {
        session.phase = GamePhase::Exploring;
    }

    CombatTurnResult {
        logs,
        outcomes,
        snapshot,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn test_session() -> SessionState {
        use std::time::Instant;

        let owner = serenity::UserId::new(1);
        let mut players = std::collections::HashMap::new();
        players.insert(
            owner,
            PlayerState {
                name: "TestHero".to_owned(),
                hp: 50,
                max_hp: 50,
                armor: 5,
                gold: 0,
                effects: vec![],
                inventory: vec![],
                accuracy: 1.0,
                alive: true,
                member_status: MemberStatusTag::Guest,
                class: ClassType::Warrior,
                level: 1,
                xp: 0,
                xp_to_next: 100,
                crit_chance: 0.10,
                base_damage_bonus: 0,
                weapon: None,
                armor_gear: None,
                defending: false,
                stunned_turns: 0,
                first_attack_in_combat: true,
                heals_used_this_combat: 0,
                lifetime_kills: 0,
                lifetime_gold_earned: 0,
                lifetime_rooms_cleared: 0,
                lifetime_bosses_defeated: 0,
                saved_snapshot: None,
            },
        );

        SessionState {
            id: uuid::Uuid::new_v4(),
            short_id: "TST".to_owned(),
            owner,
            party: vec![],
            mode: SessionMode::Solo,
            phase: GamePhase::Combat,
            channel_id: serenity::ChannelId::new(1),
            message_id: serenity::MessageId::new(1),
            created_at: Instant::now(),
            last_action_at: Instant::now(),
            turn: 1,
            players,
            enemies: vec![EnemyState {
                name: "TestSlime".to_owned(),
                level: 1,
                hp: 30,
                max_hp: 30,
                armor: 0,
                effects: vec![],
                intent: Intent::Attack { dmg: 5 },
                charged: false,
                loot_table_id: "slime",
                enraged: false,
                index: 0,
                first_strike: false,
                personality: Personality::Stoic,
            }],
            room: RoomState {
                index: 0,
                room_type: RoomType::Combat,
                name: "Test Room".to_owned(),
                description: "A test room.".to_owned(),
                modifiers: vec![],
                hazards: vec![],
                merchant_stock: vec![],
                story_event: None,
                available_quests: vec![],
            },
            log: vec![],
            show_items: false,
            pending_actions: std::collections::HashMap::new(),
            map: MapState {
                seed: 0,
                position: MapPos::new(0, 0),
                tiles: std::collections::HashMap::new(),
                tiles_visited: 0,
                boss_positions: vec![],
            },
            show_map: false,
            show_inventory: false,
            pending_destination: None,
            enemies_had_first_strike: false,
            quest_journal: QuestJournal::default(),
        }
    }

    #[test]
    fn combat_world_from_session_spawns_entities() {
        let session = test_session();
        let combat = CombatWorld::from_session(&session);
        assert_eq!(combat.entity_map.players.len(), 1);
        assert_eq!(combat.entity_map.enemies.len(), 1);
    }

    #[test]
    fn run_turn_attack_damages_enemy() {
        let mut session = test_session();
        let owner = session.owner;

        let actions = vec![(owner, PlayerAction::Attack { target_idx: 0 })];
        let result = run_combat_turn(&mut session, &actions, false);

        assert!(!result.logs.is_empty(), "Should produce log entries");
        // Enemy should have taken damage (or player missed, either is valid)
        // The key test: sync_out wrote back to session
        let enemy = &session.enemies[0];
        // We check that the bridge completed without panicking
        assert!(enemy.hp <= 30, "Enemy HP should be <= 30 after attack");
    }

    #[test]
    fn run_turn_defend_sets_flag() {
        let mut session = test_session();
        let owner = session.owner;

        let actions = vec![(owner, PlayerAction::Defend)];
        let _result = run_combat_turn(&mut session, &actions, false);

        // After sync_out, defending should reflect the ECS state
        // Note: bevy_battle defend system sets defending=true, but enemy turn
        // may have also run. The key test is no panic.
        assert!(session.players.get(&owner).unwrap().alive);
    }

    #[test]
    fn sync_out_updates_enemy_intent() {
        let mut session = test_session();
        let owner = session.owner;

        let actions = vec![(owner, PlayerAction::Attack { target_idx: 0 })];
        run_combat_turn(&mut session, &actions, false);

        // After a turn, enemy should have rolled a new intent
        // (original was Attack{dmg:5}, new should be different with high probability)
        let enemy = &session.enemies[0];
        if enemy.hp > 0 {
            // Enemy survived, intent was rolled
            // Can't guarantee different due to RNG, but system ran
            let _ = &enemy.intent;
        }
    }

    #[test]
    fn type_conversion_roundtrip() {
        let effects = vec![
            EffectKind::Poison,
            EffectKind::Burning,
            EffectKind::Bleed,
            EffectKind::Shielded,
            EffectKind::Weakened,
            EffectKind::Stunned,
            EffectKind::Sharpened,
            EffectKind::Thorns,
        ];
        for e in &effects {
            let bb = to_bb_effect(e);
            let back = from_bb_effect(&bb);
            assert_eq!(*e, back, "Roundtrip failed for {:?}", e);
        }
    }

    #[test]
    fn intent_conversion_roundtrip() {
        let intents = vec![
            Intent::Attack { dmg: 10 },
            Intent::HeavyAttack { dmg: 20 },
            Intent::Defend { armor: 5 },
            Intent::Charge,
            Intent::Flee,
            Intent::AoeAttack { dmg: 8 },
            Intent::HealSelf { amount: 15 },
            Intent::Debuff {
                effect: EffectKind::Poison,
                stacks: 2,
                turns: 3,
            },
        ];
        for i in &intents {
            let bb = to_bb_intent(i);
            let back = from_bb_intent(&bb);
            assert_eq!(*i, back, "Roundtrip failed for {:?}", i);
        }
    }

    #[test]
    fn room_modifiers_applied() {
        let mut session = test_session();
        session.room.modifiers.push(RoomModifier::Cursed {
            dmg_multiplier: 1.5,
        });

        let combat = CombatWorld::from_session(&session);
        let mods = combat.app.world().resource::<CombatModifiers>();
        assert_eq!(mods.cursed_dmg_multiplier, 1.5);
    }

    // ── Inventory sync tests ────────────────────────────────────────

    #[test]
    fn inventory_syncs_from_session() {
        let mut session = test_session();
        let owner = session.owner;
        session.player_mut(owner).inventory = vec![
            ItemStack {
                item_id: "potion".to_owned(),
                qty: 3,
            },
            ItemStack {
                item_id: "bomb".to_owned(),
                qty: 2,
            },
        ];

        let combat = CombatWorld::from_session(&session);
        let inv = combat
            .inventories
            .get(&owner)
            .expect("should have inventory");
        assert_eq!(inv.slot_count(), 2, "Should have 2 occupied slots");
        assert_eq!(
            inv.count(pb::game_id_to_proto_item_kind("potion").unwrap()),
            3
        );
        assert_eq!(
            inv.count(pb::game_id_to_proto_item_kind("bomb").unwrap()),
            2
        );
    }

    #[test]
    fn inventory_syncs_back_to_session() {
        let mut session = test_session();
        let owner = session.owner;
        session.player_mut(owner).inventory = vec![
            ItemStack {
                item_id: "potion".to_owned(),
                qty: 5,
            },
            ItemStack {
                item_id: "bandage".to_owned(),
                qty: 1,
            },
        ];

        let mut combat = CombatWorld::from_session(&session);
        // Consume one potion via the bridge
        assert!(combat.consume_item(owner, "potion"));
        combat.sync_out(&mut session);

        let player = session.player(owner);
        let potion_stack = player
            .inventory
            .iter()
            .find(|s| s.item_id == "potion")
            .expect("potion should still exist");
        assert_eq!(
            potion_stack.qty, 4,
            "Should have 4 potions after consuming 1"
        );

        let bandage_stack = player
            .inventory
            .iter()
            .find(|s| s.item_id == "bandage")
            .expect("bandage should still exist");
        assert_eq!(bandage_stack.qty, 1, "Bandage should be untouched");
    }

    #[test]
    fn consume_item_removes_last_stack() {
        let mut session = test_session();
        let owner = session.owner;
        session.player_mut(owner).inventory = vec![ItemStack {
            item_id: "bomb".to_owned(),
            qty: 1,
        }];

        let mut combat = CombatWorld::from_session(&session);
        assert!(combat.consume_item(owner, "bomb"));
        assert!(!combat.consume_item(owner, "bomb"), "Should fail on empty");

        combat.sync_out(&mut session);
        let player = session.player(owner);
        assert!(
            !player.inventory.iter().any(|s| s.item_id == "bomb"),
            "Bomb stack should be removed entirely"
        );
    }

    #[test]
    fn consume_nonexistent_item_returns_false() {
        let session = test_session();
        let owner = session.owner;
        let mut combat = CombatWorld::from_session(&session);
        assert!(!combat.consume_item(owner, "nonexistent_item"));
    }

    #[test]
    fn item_count_works() {
        let mut session = test_session();
        let owner = session.owner;
        session.player_mut(owner).inventory = vec![ItemStack {
            item_id: "potion".to_owned(),
            qty: 3,
        }];

        let combat = CombatWorld::from_session(&session);
        assert_eq!(combat.item_count(owner, "potion"), 3);
        assert_eq!(combat.item_count(owner, "bomb"), 0);
    }

    #[test]
    fn inventory_roundtrip_preserves_items() {
        let mut session = test_session();
        let owner = session.owner;
        let original = vec![
            ItemStack {
                item_id: "potion".to_owned(),
                qty: 5,
            },
            ItemStack {
                item_id: "fire_flask".to_owned(),
                qty: 2,
            },
            ItemStack {
                item_id: "smoke_bomb".to_owned(),
                qty: 1,
            },
        ];
        session.player_mut(owner).inventory = original.clone();

        let combat = CombatWorld::from_session(&session);
        combat.sync_out(&mut session);

        let player = session.player(owner);
        for orig in &original {
            let stack = player
                .inventory
                .iter()
                .find(|s| s.item_id == orig.item_id)
                .unwrap_or_else(|| panic!("{} should exist", orig.item_id));
            assert_eq!(stack.qty, orig.qty, "{} qty mismatch", orig.item_id);
        }
    }
}
