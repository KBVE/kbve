use poise::serenity_prelude as serenity;
use rand::Rng;

use super::content;
use super::types::*;

// ── Enemy targeting ─────────────────────────────────────────────────

/// Pick an enemy target: 50% the acting player, 50% a random alive party member.
/// In solo mode, always targets the actor.
fn pick_enemy_target(session: &SessionState, actor: serenity::UserId) -> serenity::UserId {
    if session.mode == SessionMode::Solo {
        return actor;
    }

    let alive_players: Vec<serenity::UserId> = session
        .players
        .iter()
        .filter(|(_, p)| p.alive)
        .map(|(uid, _)| *uid)
        .collect();

    if alive_players.len() <= 1 {
        return actor;
    }

    let mut rng = rand::thread_rng();
    if rng.gen_bool(0.5)
        && session
            .players
            .get(&actor)
            .map(|p| p.alive)
            .unwrap_or(false)
    {
        return actor;
    }

    alive_players[rng.gen_range(0..alive_players.len())]
}

// ── Action validation ───────────────────────────────────────────────

/// Check if the actor is allowed to take actions in this session.
fn validate_actor(session: &SessionState, actor: serenity::UserId) -> Result<(), String> {
    let is_member = session.owner == actor
        || (session.mode == SessionMode::Party && session.party.contains(&actor));

    if !is_member {
        return Err("You are not part of this session.".to_owned());
    }

    // Check if the player is still alive
    if let Some(player) = session.players.get(&actor) {
        if !player.alive {
            return Err("You have been defeated and cannot act.".to_owned());
        }
    }

    Ok(())
}

/// Check if an action is legal for the current game phase.
fn validate_action(session: &SessionState, action: &GameAction) -> Result<(), String> {
    if matches!(session.phase, GamePhase::GameOver(_)) {
        return Err("This session is over.".to_owned());
    }

    match action {
        GameAction::Attack | GameAction::Defend => {
            if session.phase != GamePhase::Combat {
                return Err("You can only fight during combat.".to_owned());
            }
        }
        GameAction::Explore => {
            if session.phase == GamePhase::Combat {
                return Err("You can't explore during combat!".to_owned());
            }
        }
        GameAction::Buy(_) => {
            if session.phase != GamePhase::Merchant && session.phase != GamePhase::City {
                return Err("You can only buy from a merchant.".to_owned());
            }
        }
        GameAction::StoryChoice(_) => {
            if session.phase != GamePhase::Event {
                return Err("No story event active.".to_owned());
            }
        }
        GameAction::Flee => {
            if session.phase != GamePhase::Combat {
                return Err("You can only flee during combat.".to_owned());
            }
        }
        GameAction::Rest => {
            if session.phase != GamePhase::City {
                return Err("You can only rest in a city.".to_owned());
            }
        }
        GameAction::UseItem(_) | GameAction::ToggleItems => {}
    }
    Ok(())
}

// ── Main action dispatcher ──────────────────────────────────────────

/// Apply a game action to the session state.
///
/// Returns log entries describing what happened, or an error message.
pub fn apply_action(
    session: &mut SessionState,
    action: GameAction,
    actor: serenity::UserId,
) -> Result<Vec<String>, String> {
    validate_actor(session, actor)?;
    validate_action(session, &action)?;

    let logs = match action {
        GameAction::Attack => resolve_combat_turn(session, GameAction::Attack, actor),
        GameAction::Defend => resolve_combat_turn(session, GameAction::Defend, actor),
        GameAction::UseItem(ref item_id) => {
            let msg = apply_item(session, item_id, actor)?;
            let mut logs = vec![msg];
            if session.phase == GamePhase::Combat {
                let target = pick_enemy_target(session, actor);
                logs.extend(enemy_turn(session, target));
            }
            logs
        }
        GameAction::Explore => advance_room(session),
        GameAction::Flee => resolve_flee(session, actor),
        GameAction::Rest => {
            let cost = 10 + (session.room.index as i32 * 2);
            let player = session.player_mut(actor);
            if player.gold < cost {
                return Err(format!(
                    "The inn costs {} gold. You have {}.",
                    cost, player.gold
                ));
            }
            player.gold -= cost;
            player.hp = player.max_hp;
            player.effects.clear();
            vec![format!(
                "You rest at the inn. Fully healed! (-{} gold)",
                cost
            )]
        }
        GameAction::Buy(ref item_id) => {
            let msg = apply_buy(session, item_id, actor)?;
            vec![msg]
        }
        GameAction::StoryChoice(idx) => apply_story_choice(session, idx, actor)?,
        GameAction::ToggleItems => {
            session.show_items = !session.show_items;
            return Ok(Vec::new());
        }
    };

    session.turn += 1;
    session.last_action_at = std::time::Instant::now();

    // Trim log to last 8 entries
    for entry in &logs {
        session.log.push(entry.clone());
    }
    if session.log.len() > 8 {
        let drain = session.log.len() - 8;
        session.log.drain(..drain);
    }

    Ok(logs)
}

// ── Combat resolution ───────────────────────────────────────────────

fn resolve_combat_turn(
    session: &mut SessionState,
    player_action: GameAction,
    actor: serenity::UserId,
) -> Vec<String> {
    let mut logs = Vec::new();
    let mut rng = rand::thread_rng();

    // Compute accuracy before mutable borrows
    let accuracy = effective_accuracy(session, actor);

    // Player phase
    match player_action {
        GameAction::Attack => {
            if let Some(ref mut enemy) = session.enemy {
                let mut dmg = rng.gen_range(6..=12);

                if rng.gen_range(0.0f32..1.0) > accuracy {
                    logs.push("Your attack missed!".to_owned());
                } else {
                    dmg = (dmg - enemy.armor).max(1);
                    enemy.hp -= dmg;
                    logs.push(format!("You strike the {} for {} damage!", enemy.name, dmg));
                }
            }
        }
        GameAction::Defend => {
            session.player_mut(actor).armor += 3;
            logs.push("You raise your guard. (+3 armor this turn)".to_owned());
        }
        _ => {}
    }

    // Check enemy death
    let enemy_dead = session.enemy.as_ref().is_some_and(|e| e.hp <= 0);
    if enemy_dead {
        let enemy_name = session.enemy.as_ref().unwrap().name.clone();
        let loot_id = session.enemy.as_ref().unwrap().loot_table_id;
        let gold = rng.gen_range(5..=15);
        session.player_mut(actor).gold += gold;
        logs.push(format!("The {} is defeated! (+{} gold)", enemy_name, gold));

        // Roll loot drop
        logs.extend(roll_and_add_loot(
            loot_id,
            &mut session.player_mut(actor).inventory,
        ));

        session.enemy = None;
        session.phase = GamePhase::Exploring;

        // Check if this was a boss
        if session.room.room_type == RoomType::Boss {
            session.phase = GamePhase::GameOver(GameOverReason::Victory);
            logs.push("You have conquered The Glass Catacombs!".to_owned());
        }
        return logs;
    }

    // Enemy phase — targets a party member (50% actor, 50% random alive)
    let target = pick_enemy_target(session, actor);
    logs.extend(enemy_turn(session, target));

    // Tick player effects (DoT damage)
    let (effect_logs, tick_dmg) = tick_effects(&mut session.player_mut(actor).effects);
    logs.extend(effect_logs);
    if tick_dmg > 0 {
        let player = session.player_mut(actor);
        player.hp -= tick_dmg;
        if player.hp <= 0 {
            player.alive = false;
            if session.all_players_dead() {
                session.phase = GamePhase::GameOver(GameOverReason::Defeated);
            }
            logs.push("You succumbed to your afflictions...".to_owned());
        }
    }

    // Tick enemy effects (DoT damage)
    if let Some(ref mut enemy) = session.enemy {
        let (enemy_effect_logs, enemy_tick_dmg) = tick_effects(&mut enemy.effects);
        for log in enemy_effect_logs {
            logs.push(format!("[{}] {}", enemy.name, log));
        }
        if enemy_tick_dmg > 0 {
            enemy.hp -= enemy_tick_dmg;
        }
    }
    // Check enemy death from DoT
    let enemy_dot_dead = session.enemy.as_ref().is_some_and(|e| e.hp <= 0);
    if enemy_dot_dead {
        let enemy_name = session.enemy.as_ref().unwrap().name.clone();
        let loot_id = session.enemy.as_ref().unwrap().loot_table_id;
        let gold = rand::thread_rng().gen_range(5..=15);
        session.player_mut(actor).gold += gold;
        logs.push(format!(
            "The {} succumbed to its afflictions! (+{} gold)",
            enemy_name, gold
        ));
        logs.extend(roll_and_add_loot(
            loot_id,
            &mut session.player_mut(actor).inventory,
        ));
        session.enemy = None;
        session.phase = GamePhase::Exploring;
    }

    // Reset temporary defend bonus
    if player_action == GameAction::Defend {
        session.player_mut(actor).armor -= 3;
    }

    logs
}

/// Execute the enemy's telegraphed intent against the target player.
fn enemy_turn(session: &mut SessionState, target: serenity::UserId) -> Vec<String> {
    let mut logs = Vec::new();
    let mut rng = rand::thread_rng();

    // Compute Cursed multiplier before mutable borrows
    let cursed_mult = session
        .room
        .modifiers
        .iter()
        .filter_map(|m| {
            if let RoomModifier::Cursed { dmg_multiplier } = m {
                Some(*dmg_multiplier)
            } else {
                None
            }
        })
        .fold(1.0f32, |a, b| a * b);

    // Read target player stats for damage calculation
    let target_name = session.player(target).name.clone();
    let target_armor = session.player(target).armor;
    let target_shielded = session
        .player(target)
        .effects
        .iter()
        .any(|e| e.kind == EffectKind::Shielded);

    // Compute damage/effect from enemy intent, then apply separately to avoid borrow conflicts
    enum EnemyAction {
        DealDamage { dmg: i32, msg: String },
        BuffSelf,
        Flee,
    }

    let action = if let Some(ref mut enemy) = session.enemy {
        match &enemy.intent {
            Intent::Attack { dmg } => {
                let base = (*dmg - target_armor).max(1);
                let actual = (base as f32 * cursed_mult).round() as i32;
                let final_dmg = if target_shielded { actual / 2 } else { actual };
                EnemyAction::DealDamage {
                    dmg: final_dmg,
                    msg: format!(
                        "{} attacks {} for {} damage!",
                        enemy.name, target_name, final_dmg
                    ),
                }
            }
            Intent::HeavyAttack { dmg } => {
                let base = (*dmg - target_armor).max(1);
                let actual = (base as f32 * cursed_mult).round() as i32;
                EnemyAction::DealDamage {
                    dmg: actual,
                    msg: format!(
                        "{} unleashes a devastating blow on {} for {} damage!",
                        enemy.name, target_name, actual
                    ),
                }
            }
            Intent::Defend { armor } => {
                enemy.armor += armor;
                logs.push(format!(
                    "{} fortifies its defenses. (+{} armor)",
                    enemy.name, armor
                ));
                EnemyAction::BuffSelf
            }
            Intent::Charge => {
                enemy.charged = true;
                logs.push(format!("{} is gathering power...", enemy.name));
                EnemyAction::BuffSelf
            }
            Intent::Flee => {
                logs.push(format!("The {} flees!", enemy.name));
                EnemyAction::Flee
            }
        }
    } else {
        return logs;
    };

    // Apply damage to player (separate from enemy borrow)
    match action {
        EnemyAction::DealDamage { dmg, msg } => {
            session.player_mut(target).hp -= dmg;
            logs.push(msg);
        }
        EnemyAction::Flee => {
            session.enemy = None;
            session.phase = GamePhase::Exploring;
            return logs;
        }
        EnemyAction::BuffSelf => {}
    }

    // Generate new intent — charged forces a boosted heavy attack
    if let Some(ref mut enemy) = session.enemy {
        if enemy.charged {
            enemy.charged = false;
            enemy.intent = Intent::HeavyAttack {
                dmg: 12 + enemy.level as i32 * 3,
            };
        } else {
            enemy.intent = match rng.gen_range(0..5) {
                0 => Intent::Attack {
                    dmg: 5 + enemy.level as i32,
                },
                1 => Intent::HeavyAttack {
                    dmg: 8 + enemy.level as i32 * 2,
                },
                2 => Intent::Defend { armor: 3 },
                3 => Intent::Charge,
                _ => Intent::Attack {
                    dmg: 4 + enemy.level as i32,
                },
            };
        }
    }

    // Check target player death
    let player = session.player_mut(target);
    if player.hp <= 0 {
        player.alive = false;
        let defeated_name = player.name.clone();
        if session.all_players_dead() {
            session.phase = GamePhase::GameOver(GameOverReason::Defeated);
        }
        logs.push(format!("{} has been defeated...", defeated_name));
    }

    logs
}

// ── Flee resolution ─────────────────────────────────────────────────

fn resolve_flee(session: &mut SessionState, actor: serenity::UserId) -> Vec<String> {
    let mut rng = rand::thread_rng();

    // Base 60% success, -5% per room depth, min 30%
    let flee_chance = (0.60 - session.room.index as f32 * 0.05).max(0.30);
    let roll: f32 = rng.r#gen();

    if roll < flee_chance {
        // Success — escape to hallway
        let hallway = content::generate_hallway_room(session.room.index);
        session.room = hallway;
        session.enemy = None;
        session.phase = GamePhase::Exploring;
        vec!["You dash through a narrow passage, escaping the fight!".to_owned()]
    } else {
        // Failure — enemy gets a free hit on the fleeing player
        let mut logs = vec!["You stumble trying to flee! The enemy strikes!".to_owned()];
        logs.extend(enemy_turn(session, actor)); // Always hits the fleeing player
        logs
    }
}

// ── Item usage ──────────────────────────────────────────────────────

fn apply_item(
    session: &mut SessionState,
    item_id: &str,
    actor: serenity::UserId,
) -> Result<String, String> {
    let player = session.player_mut(actor);
    let stack = player
        .inventory
        .iter_mut()
        .find(|s| s.item_id == item_id)
        .ok_or_else(|| "You don't have that item.".to_owned())?;

    if stack.qty == 0 {
        return Err("No more of that item remaining.".to_owned());
    }

    let def = content::find_item(item_id).ok_or_else(|| "Unknown item.".to_owned())?;

    let msg = match &def.use_effect {
        Some(UseEffect::Heal { amount }) => {
            let player = session.player_mut(actor);
            player.hp = (player.hp + amount).min(player.max_hp);
            format!("Used {}! Restored {} HP.", def.name, amount)
        }
        Some(UseEffect::DamageEnemy { amount }) => {
            if let Some(ref mut enemy) = session.enemy {
                enemy.hp -= amount;
                format!(
                    "Used {}! Dealt {} damage to {}.",
                    def.name, amount, enemy.name
                )
            } else {
                return Err("No enemy to target.".to_owned());
            }
        }
        Some(UseEffect::ApplyEffect {
            kind,
            stacks,
            turns,
        }) => {
            session.player_mut(actor).effects.push(EffectInstance {
                kind: kind.clone(),
                stacks: *stacks,
                turns_left: *turns,
            });
            format!("Used {}! Gained {:?} for {} turns.", def.name, kind, turns)
        }
        Some(UseEffect::RemoveEffect { kind }) => {
            session
                .player_mut(actor)
                .effects
                .retain(|e| e.kind != *kind);
            format!("Used {}! Removed {:?}.", def.name, kind)
        }
        None => {
            return Err("That item has no use effect.".to_owned());
        }
    };

    // Handle bandage special: also removes bleed
    if item_id == "bandage" {
        session
            .player_mut(actor)
            .effects
            .retain(|e| e.kind != EffectKind::Bleed);
    }

    // Decrement stack quantity
    let player = session.player_mut(actor);
    if let Some(stack) = player.inventory.iter_mut().find(|s| s.item_id == item_id) {
        stack.qty -= 1;
    }
    session.show_items = false;

    Ok(msg)
}

// ── Room advancement ────────────────────────────────────────────────

fn advance_room(session: &mut SessionState) -> Vec<String> {
    let mut logs = Vec::new();
    let next_index = session.room.index + 1;
    session.room = content::generate_room(next_index);

    logs.push(format!(
        "You enter Room {}: {}.",
        next_index + 1,
        session.room.name
    ));

    // Apply room hazards on entry to ALL alive players
    let hazards = session.room.hazards.clone();
    let alive_ids: Vec<serenity::UserId> = session
        .players
        .iter()
        .filter(|(_, p)| p.alive)
        .map(|(id, _)| *id)
        .collect();

    for hazard in &hazards {
        for &uid in &alive_ids {
            match hazard {
                Hazard::Spikes { dmg } => {
                    session.player_mut(uid).hp -= dmg;
                    logs.push(format!(
                        "Spikes jut from the ground! {} takes {} damage.",
                        session.player(uid).name,
                        dmg
                    ));
                }
                Hazard::Gas {
                    effect,
                    stacks,
                    turns,
                } => {
                    session.player_mut(uid).effects.push(EffectInstance {
                        kind: effect.clone(),
                        stacks: *stacks,
                        turns_left: *turns,
                    });
                    logs.push(format!(
                        "A cloud of noxious gas fills the room! {} gained {:?}.",
                        session.player(uid).name,
                        effect
                    ));
                }
            }
        }
    }

    // Check if hazards killed any players
    for &uid in &alive_ids {
        let player = session.player_mut(uid);
        if player.hp <= 0 {
            player.alive = false;
        }
    }
    if session.all_players_dead() {
        session.phase = GamePhase::GameOver(GameOverReason::Defeated);
        logs.push("The hazards proved fatal...".to_owned());
        return logs;
    }

    match session.room.room_type {
        RoomType::Combat | RoomType::Boss => {
            let enemy = content::spawn_enemy(next_index);
            logs.push(format!(
                "A {} (Lv.{}) blocks your path!",
                enemy.name, enemy.level
            ));
            session.enemy = Some(enemy);
            session.phase = GamePhase::Combat;
        }
        RoomType::Treasure => {
            let gold = 10 + next_index as i32 * 3;
            // Give gold to all alive players
            for player in session.players.values_mut() {
                if player.alive {
                    player.gold += gold;
                }
            }
            logs.push(format!("You found a treasure chest! (+{} gold)", gold));
            session.phase = GamePhase::Exploring;
        }
        RoomType::RestShrine => {
            let mut heal = 15;
            for m in &session.room.modifiers {
                if let RoomModifier::Blessing { heal_bonus } = m {
                    heal += heal_bonus;
                }
            }
            // Heal all alive players
            for player in session.players.values_mut() {
                if player.alive {
                    player.hp = (player.hp + heal).min(player.max_hp);
                }
            }
            logs.push(format!("The shrine's warmth restores {} HP.", heal));
            session.phase = GamePhase::Rest;
        }
        RoomType::Trap => {
            let dmg = 5 + next_index as i32;
            for player in session.players.values_mut() {
                if player.alive {
                    player.hp -= dmg;
                    if player.hp <= 0 {
                        player.alive = false;
                    }
                }
            }
            logs.push(format!("A trap springs! You take {} damage.", dmg));
            if session.all_players_dead() {
                session.phase = GamePhase::GameOver(GameOverReason::Defeated);
                logs.push("The trap proved fatal...".to_owned());
            } else {
                session.phase = GamePhase::Exploring;
            }
        }
        RoomType::Merchant => {
            session.room.merchant_stock = content::generate_merchant_stock(next_index);
            logs.push(
                "A cloaked merchant gestures at wares spread across a weathered blanket."
                    .to_owned(),
            );
            session.phase = GamePhase::Merchant;
        }
        RoomType::Story => {
            session.room.story_event = Some(content::generate_story_event());
            if let Some(ref event) = session.room.story_event {
                logs.push(event.prompt.clone());
            }
            session.phase = GamePhase::Event;
        }
        RoomType::Hallway => {
            // Hallways are safe — just exploring
            session.phase = GamePhase::Exploring;
        }
        RoomType::UndergroundCity => {
            session.room.merchant_stock = content::generate_merchant_stock(next_index);
            logs.push(
                "You emerge into an underground city. Torches flicker along carved stone walls."
                    .to_owned(),
            );
            session.phase = GamePhase::City;
        }
    }

    logs
}

// ── Effect ticking ──────────────────────────────────────────────────

/// Tick all effects: apply DoT damage, decrement turns, remove expired.
/// Returns (log messages, total tick damage to apply to the entity).
fn tick_effects(effects: &mut Vec<EffectInstance>) -> (Vec<String>, i32) {
    let mut logs = Vec::new();
    let mut tick_dmg = 0i32;

    for effect in effects.iter_mut() {
        let dmg = match effect.kind {
            EffectKind::Poison => 2 * effect.stacks as i32,
            EffectKind::Burning => 3 * effect.stacks as i32,
            EffectKind::Bleed => 1 * effect.stacks as i32,
            _ => 0,
        };
        if dmg > 0 {
            tick_dmg += dmg;
            logs.push(format!("{:?} deals {} damage.", effect.kind, dmg));
        }

        effect.turns_left = effect.turns_left.saturating_sub(1);
        if effect.turns_left == 0 {
            logs.push(format!("{:?} wore off.", effect.kind));
        }
    }

    effects.retain(|e| e.turns_left > 0);
    (logs, tick_dmg)
}

// ── Merchant ────────────────────────────────────────────────────────

fn apply_buy(
    session: &mut SessionState,
    item_id: &str,
    actor: serenity::UserId,
) -> Result<String, String> {
    let offer = session
        .room
        .merchant_stock
        .iter()
        .find(|o| o.item_id == item_id)
        .ok_or_else(|| "That item is not for sale.".to_owned())?;

    let player = session.player(actor);
    if player.gold < offer.price {
        return Err(format!(
            "Not enough gold. Need {} but have {}.",
            offer.price, player.gold
        ));
    }

    let price = offer.price;
    let player = session.player_mut(actor);
    player.gold -= price;

    add_item_to_inventory(&mut session.player_mut(actor).inventory, item_id);

    let name = content::find_item(item_id).map(|d| d.name).unwrap_or("???");
    Ok(format!("Purchased {} for {} gold.", name, price))
}

// ── Story events ────────────────────────────────────────────────────

fn apply_story_choice(
    session: &mut SessionState,
    idx: usize,
    actor: serenity::UserId,
) -> Result<Vec<String>, String> {
    let event = session
        .room
        .story_event
        .as_ref()
        .ok_or_else(|| "No story event active.".to_owned())?;

    if idx >= event.choices.len() {
        return Err("Invalid choice.".to_owned());
    }

    let outcome = content::resolve_story_choice(&event.prompt, idx);
    let mut logs = vec![outcome.log_message];

    let player = session.player_mut(actor);
    player.hp = (player.hp + outcome.hp_change).min(player.max_hp);
    player.gold += outcome.gold_change;

    if let Some(item_id) = outcome.item_gain {
        add_item_to_inventory(&mut session.player_mut(actor).inventory, item_id);
        if let Some(def) = content::find_item(item_id) {
            logs.push(format!("Gained: {}!", def.name));
        }
    }

    if let Some((kind, stacks, turns)) = outcome.effect_gain {
        session.player_mut(actor).effects.push(EffectInstance {
            kind,
            stacks,
            turns_left: turns,
        });
    }

    let player = session.player(actor);
    if player.hp <= 0 {
        session.player_mut(actor).alive = false;
        if session.all_players_dead() {
            session.phase = GamePhase::GameOver(GameOverReason::Defeated);
        }
        logs.push("The choice proved fatal...".to_owned());
    } else {
        session.phase = GamePhase::Exploring;
    }

    Ok(logs)
}

// ── Loot helpers ────────────────────────────────────────────────────

fn roll_and_add_loot(loot_table_id: &str, inventory: &mut Vec<ItemStack>) -> Vec<String> {
    let mut logs = Vec::new();
    if let Some(item_id) = content::roll_loot(loot_table_id) {
        if let Some(def) = content::find_item(item_id) {
            add_item_to_inventory(inventory, item_id);
            logs.push(format!("Dropped: {}!", def.name));
        }
    }
    logs
}

fn add_item_to_inventory(inventory: &mut Vec<ItemStack>, item_id: &str) {
    if let Some(stack) = inventory.iter_mut().find(|s| s.item_id == item_id) {
        stack.qty = stack.qty.saturating_add(1);
    } else {
        inventory.push(ItemStack {
            item_id: item_id.to_owned(),
            qty: 1,
        });
    }
}

// ── Helpers ─────────────────────────────────────────────────────────

fn effective_accuracy(session: &SessionState, actor: serenity::UserId) -> f32 {
    let mut acc = session.player(actor).accuracy;
    for modifier in &session.room.modifiers {
        if let RoomModifier::Fog { accuracy_penalty } = modifier {
            acc -= accuracy_penalty;
        }
    }
    acc.max(0.1)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::HashMap;
    use std::time::Instant;

    const OWNER: serenity::UserId = serenity::UserId::new(1);

    fn test_session() -> SessionState {
        let (id, short_id) = new_short_sid();
        let mut player = PlayerState::default();
        player.inventory = content::starting_inventory();

        let mut players = HashMap::new();
        players.insert(OWNER, player);

        SessionState {
            id,
            short_id,
            owner: OWNER,
            party: Vec::new(),
            mode: SessionMode::Solo,
            phase: GamePhase::Exploring,
            channel_id: serenity::ChannelId::new(1),
            message_id: serenity::MessageId::new(1),
            created_at: Instant::now(),
            last_action_at: Instant::now(),
            turn: 0,
            players,
            enemy: None,
            room: content::generate_room(0),
            log: Vec::new(),
            show_items: false,
        }
    }

    #[test]
    fn attack_not_allowed_outside_combat() {
        let mut session = test_session();
        session.phase = GamePhase::Exploring;
        let result = apply_action(&mut session, GameAction::Attack, OWNER);
        assert!(result.is_err());
    }

    #[test]
    fn explore_advances_room() {
        let mut session = test_session();
        session.phase = GamePhase::Exploring;
        let result = apply_action(&mut session, GameAction::Explore, OWNER);
        assert!(result.is_ok());
        assert_eq!(session.room.index, 1);
    }

    #[test]
    fn flee_only_in_combat() {
        let mut session = test_session();
        session.phase = GamePhase::Exploring;
        let result = apply_action(&mut session, GameAction::Flee, OWNER);
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("only flee during combat"));
    }

    #[test]
    fn flee_from_combat() {
        let mut session = test_session();
        session.phase = GamePhase::Combat;
        session.enemy = Some(content::spawn_enemy(0));
        // Run flee multiple times to cover both success/failure paths
        for _ in 0..20 {
            let mut s = test_session();
            s.phase = GamePhase::Combat;
            s.enemy = Some(content::spawn_enemy(0));
            let result = apply_action(&mut s, GameAction::Flee, OWNER);
            assert!(result.is_ok());
            // On success: Hallway + Exploring. On failure: still Combat.
            assert!(
                s.phase == GamePhase::Exploring
                    || s.phase == GamePhase::Combat
                    || matches!(s.phase, GamePhase::GameOver(_))
            );
            if s.phase == GamePhase::Exploring {
                assert_eq!(s.room.room_type, RoomType::Hallway);
                assert!(s.enemy.is_none());
            }
        }
    }

    #[test]
    fn wrong_actor_rejected() {
        let mut session = test_session();
        let result = apply_action(
            &mut session,
            GameAction::Explore,
            serenity::UserId::new(999),
        );
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("not part of this session"));
    }

    #[test]
    fn party_member_can_act() {
        let mut session = test_session();
        session.mode = SessionMode::Party;
        let member_id = serenity::UserId::new(42);
        session.party.push(member_id);
        let mut member_player = PlayerState::default();
        member_player.inventory = content::starting_inventory();
        session.players.insert(member_id, member_player);
        let result = apply_action(&mut session, GameAction::Explore, member_id);
        assert!(result.is_ok());
    }

    #[test]
    fn use_item_heals() {
        let mut session = test_session();
        session.player_mut(OWNER).hp = 30;
        let result = apply_action(
            &mut session,
            GameAction::UseItem("potion".to_owned()),
            OWNER,
        );
        assert!(result.is_ok());
        assert_eq!(session.player(OWNER).hp, 45); // 30 + 15
    }

    #[test]
    fn use_item_capped_at_max_hp() {
        let mut session = test_session();
        session.player_mut(OWNER).hp = 48;
        let _ = apply_action(
            &mut session,
            GameAction::UseItem("potion".to_owned()),
            OWNER,
        );
        assert_eq!(session.player(OWNER).hp, 50); // capped at max_hp
    }

    #[test]
    fn toggle_items_flips_flag() {
        let mut session = test_session();
        assert!(!session.show_items);
        let _ = apply_action(&mut session, GameAction::ToggleItems, OWNER);
        assert!(session.show_items);
    }

    #[test]
    fn game_over_blocks_actions() {
        let mut session = test_session();
        session.phase = GamePhase::GameOver(GameOverReason::Defeated);
        let result = apply_action(&mut session, GameAction::Explore, OWNER);
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("over"));
    }

    #[test]
    fn tick_effects_removes_expired() {
        let mut effects = vec![
            EffectInstance {
                kind: EffectKind::Poison,
                stacks: 1,
                turns_left: 1,
            },
            EffectInstance {
                kind: EffectKind::Shielded,
                stacks: 1,
                turns_left: 3,
            },
        ];
        let (logs, dmg) = tick_effects(&mut effects);
        assert_eq!(effects.len(), 1);
        assert_eq!(effects[0].kind, EffectKind::Shielded);
        assert_eq!(effects[0].turns_left, 2);
        assert!(logs.iter().any(|l| l.contains("Poison")));
        assert_eq!(dmg, 2); // Poison deals 2 per stack
    }

    #[test]
    fn tick_effects_deals_poison_damage() {
        let mut effects = vec![EffectInstance {
            kind: EffectKind::Poison,
            stacks: 2,
            turns_left: 3,
        }];
        let (logs, dmg) = tick_effects(&mut effects);
        assert_eq!(dmg, 4); // 2 dmg * 2 stacks
        assert!(logs.iter().any(|l| l.contains("4 damage")));
    }

    #[test]
    fn tick_effects_no_damage_for_shielded() {
        let mut effects = vec![EffectInstance {
            kind: EffectKind::Shielded,
            stacks: 1,
            turns_left: 2,
        }];
        let (_logs, dmg) = tick_effects(&mut effects);
        assert_eq!(dmg, 0);
    }

    #[test]
    fn tick_effects_burning_stacks() {
        let mut effects = vec![EffectInstance {
            kind: EffectKind::Burning,
            stacks: 3,
            turns_left: 2,
        }];
        let (_logs, dmg) = tick_effects(&mut effects);
        assert_eq!(dmg, 9); // 3 dmg * 3 stacks
    }

    #[test]
    fn player_dies_from_dot() {
        let mut session = test_session();
        session.phase = GamePhase::Combat;
        session.enemy = Some(content::spawn_enemy(0));
        session.player_mut(OWNER).hp = 1;
        session.player_mut(OWNER).effects.push(EffectInstance {
            kind: EffectKind::Poison,
            stacks: 1,
            turns_left: 3,
        });
        let _ = apply_action(&mut session, GameAction::Defend, OWNER);
        assert_eq!(session.phase, GamePhase::GameOver(GameOverReason::Defeated));
    }

    #[test]
    fn merchant_buy_deducts_gold() {
        let mut session = test_session();
        session.phase = GamePhase::Merchant;
        session.player_mut(OWNER).gold = 50;
        session.room.merchant_stock = vec![MerchantOffer {
            item_id: "potion".to_owned(),
            price: 10,
        }];
        let result = apply_action(&mut session, GameAction::Buy("potion".to_owned()), OWNER);
        assert!(result.is_ok());
        assert_eq!(session.player(OWNER).gold, 40);
    }

    #[test]
    fn merchant_buy_insufficient_gold() {
        let mut session = test_session();
        session.phase = GamePhase::Merchant;
        session.player_mut(OWNER).gold = 5;
        session.room.merchant_stock = vec![MerchantOffer {
            item_id: "potion".to_owned(),
            price: 10,
        }];
        let result = apply_action(&mut session, GameAction::Buy("potion".to_owned()), OWNER);
        assert!(result.is_err());
    }

    #[test]
    fn story_choice_applies_outcome() {
        let mut session = test_session();
        session.phase = GamePhase::Event;
        session.room.story_event = Some(StoryEvent {
            prompt: "A mirror whispers your name...".to_owned(),
            choices: vec![
                StoryChoice {
                    label: "Listen".to_owned(),
                    description: "Lean closer.".to_owned(),
                },
                StoryChoice {
                    label: "Smash".to_owned(),
                    description: "Break it.".to_owned(),
                },
            ],
        });
        let hp_before = session.player(OWNER).hp;
        let result = apply_action(&mut session, GameAction::StoryChoice(0), OWNER);
        assert!(result.is_ok());
        assert_eq!(
            session.player(OWNER).hp,
            (hp_before + 10).min(session.player(OWNER).max_hp)
        );
        assert_eq!(session.phase, GamePhase::Exploring);
    }

    #[test]
    fn story_choice_invalid_index() {
        let mut session = test_session();
        session.phase = GamePhase::Event;
        session.room.story_event = Some(StoryEvent {
            prompt: "A mirror whispers your name...".to_owned(),
            choices: vec![StoryChoice {
                label: "Listen".to_owned(),
                description: "Lean closer.".to_owned(),
            }],
        });
        let result = apply_action(&mut session, GameAction::StoryChoice(5), OWNER);
        assert!(result.is_err());
    }

    #[test]
    fn buy_not_allowed_outside_merchant() {
        let mut session = test_session();
        session.phase = GamePhase::Exploring;
        let result = apply_action(&mut session, GameAction::Buy("potion".to_owned()), OWNER);
        assert!(result.is_err());
    }

    #[test]
    fn combat_turn_damages_enemy() {
        let mut session = test_session();
        session.phase = GamePhase::Combat;
        session.enemy = Some(content::spawn_enemy(0));

        let starting_hp = session.enemy.as_ref().unwrap().hp;
        // Run multiple attacks to account for possible miss
        for _ in 0..10 {
            if session.enemy.is_none() || !matches!(session.phase, GamePhase::Combat) {
                break;
            }
            let _ = apply_action(&mut session, GameAction::Attack, OWNER);
        }
        // Enemy should either be dead or have taken damage
        if let Some(ref enemy) = session.enemy {
            assert!(enemy.hp < starting_hp);
        }
    }

    #[test]
    fn city_rest_heals_fully() {
        let mut session = test_session();
        session.phase = GamePhase::City;
        session.player_mut(OWNER).hp = 10;
        session.player_mut(OWNER).gold = 100;
        session.player_mut(OWNER).effects.push(EffectInstance {
            kind: EffectKind::Poison,
            stacks: 1,
            turns_left: 3,
        });
        let result = apply_action(&mut session, GameAction::Rest, OWNER);
        assert!(result.is_ok());
        assert_eq!(session.player(OWNER).hp, 50); // max_hp
        assert!(session.player(OWNER).effects.is_empty());
    }

    #[test]
    fn city_rest_insufficient_gold() {
        let mut session = test_session();
        session.phase = GamePhase::City;
        session.player_mut(OWNER).gold = 0;
        let result = apply_action(&mut session, GameAction::Rest, OWNER);
        assert!(result.is_err());
    }

    #[test]
    fn rest_not_allowed_outside_city() {
        let mut session = test_session();
        session.phase = GamePhase::Exploring;
        let result = apply_action(&mut session, GameAction::Rest, OWNER);
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("only rest in a city"));
    }

    #[test]
    fn buy_allowed_in_city() {
        let mut session = test_session();
        session.phase = GamePhase::City;
        session.player_mut(OWNER).gold = 50;
        session.room.merchant_stock = vec![MerchantOffer {
            item_id: "potion".to_owned(),
            price: 10,
        }];
        let result = apply_action(&mut session, GameAction::Buy("potion".to_owned()), OWNER);
        assert!(result.is_ok());
    }

    #[test]
    fn dead_player_cannot_act() {
        let mut session = test_session();
        session.player_mut(OWNER).alive = false;
        let result = apply_action(&mut session, GameAction::Explore, OWNER);
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("defeated"));
    }

    #[test]
    fn pick_enemy_target_solo_always_actor() {
        let session = test_session();
        for _ in 0..20 {
            let target = pick_enemy_target(&session, OWNER);
            assert_eq!(target, OWNER);
        }
    }

    #[test]
    fn pick_enemy_target_party_returns_alive() {
        let mut session = test_session();
        session.mode = SessionMode::Party;
        let member_id = serenity::UserId::new(42);
        session.party.push(member_id);
        session.players.insert(
            member_id,
            PlayerState {
                name: "PartyMember".to_owned(),
                inventory: content::starting_inventory(),
                ..PlayerState::default()
            },
        );

        let mut saw_owner = false;
        let mut saw_member = false;
        for _ in 0..100 {
            let target = pick_enemy_target(&session, OWNER);
            assert!(target == OWNER || target == member_id);
            if target == OWNER {
                saw_owner = true;
            }
            if target == member_id {
                saw_member = true;
            }
        }
        // With 100 tries at 50/50, both should appear
        assert!(saw_owner, "Expected owner to be targeted at least once");
        assert!(saw_member, "Expected member to be targeted at least once");
    }

    #[test]
    fn pick_enemy_target_skips_dead() {
        let mut session = test_session();
        session.mode = SessionMode::Party;
        let member_id = serenity::UserId::new(42);
        session.party.push(member_id);
        let mut dead_player = PlayerState::default();
        dead_player.alive = false;
        session.players.insert(member_id, dead_player);

        // Only owner is alive, so target should always be owner
        for _ in 0..20 {
            let target = pick_enemy_target(&session, OWNER);
            assert_eq!(target, OWNER);
        }
    }

    #[test]
    fn party_one_dead_session_continues() {
        let mut session = test_session();
        session.mode = SessionMode::Party;
        let member_id = serenity::UserId::new(42);
        session.party.push(member_id);
        let mut member_player = PlayerState::default();
        member_player.inventory = content::starting_inventory();
        session.players.insert(member_id, member_player);

        // Kill the owner
        session.player_mut(OWNER).alive = false;
        session.player_mut(OWNER).hp = 0;

        // Session should NOT be game over — member is still alive
        assert!(!session.all_players_dead());

        // Member can still act
        let result = apply_action(&mut session, GameAction::Explore, member_id);
        assert!(result.is_ok());
    }
}
