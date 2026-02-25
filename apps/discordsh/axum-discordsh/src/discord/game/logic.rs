use poise::serenity_prelude as serenity;
use rand::Rng;

use super::content;
use super::types::*;

// ── Action validation ───────────────────────────────────────────────

/// Check if the actor is allowed to take actions in this session.
fn validate_actor(session: &SessionState, actor: serenity::UserId) -> Result<(), String> {
    if session.owner == actor {
        return Ok(());
    }
    if session.mode == SessionMode::Party && session.party.contains(&actor) {
        return Ok(());
    }
    Err("You are not part of this session.".to_owned())
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
            if session.phase != GamePhase::Merchant {
                return Err("You can only buy from a merchant.".to_owned());
            }
        }
        GameAction::StoryChoice(_) => {
            if session.phase != GamePhase::Event {
                return Err("No story event active.".to_owned());
            }
        }
        GameAction::UseItem(_) | GameAction::ToggleItems | GameAction::Flee => {}
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
        GameAction::Attack => resolve_combat_turn(session, GameAction::Attack),
        GameAction::Defend => resolve_combat_turn(session, GameAction::Defend),
        GameAction::UseItem(ref item_id) => {
            let msg = apply_item(session, item_id)?;
            let mut logs = vec![msg];
            if session.phase == GamePhase::Combat {
                logs.extend(enemy_turn(session));
            }
            logs
        }
        GameAction::Explore => advance_room(session),
        GameAction::Flee => {
            session.phase = GamePhase::GameOver(GameOverReason::Escaped);
            vec!["You fled the dungeon!".to_owned()]
        }
        GameAction::Buy(ref item_id) => {
            let msg = apply_buy(session, item_id)?;
            vec![msg]
        }
        GameAction::StoryChoice(idx) => apply_story_choice(session, idx)?,
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

fn resolve_combat_turn(session: &mut SessionState, player_action: GameAction) -> Vec<String> {
    let mut logs = Vec::new();
    let mut rng = rand::thread_rng();

    // Compute accuracy before mutable borrows
    let accuracy = effective_accuracy(session);

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
            session.player.armor += 3;
            logs.push("You raise your guard. (+3 armor this turn)".to_owned());
        }
        _ => {}
    }

    // Check enemy death
    if let Some(ref enemy) = session.enemy
        && enemy.hp <= 0
    {
        let gold = rng.gen_range(5..=15);
        session.player.gold += gold;
        logs.push(format!("The {} is defeated! (+{} gold)", enemy.name, gold));

        // Roll loot drop
        logs.extend(roll_and_add_loot(
            enemy.loot_table_id,
            &mut session.player.inventory,
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

    // Enemy phase
    logs.extend(enemy_turn(session));

    // Tick player effects (DoT damage)
    let (effect_logs, tick_dmg) = tick_effects(&mut session.player.effects);
    logs.extend(effect_logs);
    if tick_dmg > 0 {
        session.player.hp -= tick_dmg;
        if session.player.hp <= 0 {
            session.phase = GamePhase::GameOver(GameOverReason::Defeated);
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
    if let Some(ref enemy) = session.enemy
        && enemy.hp <= 0
    {
        let gold = rand::thread_rng().gen_range(5..=15);
        session.player.gold += gold;
        logs.push(format!(
            "The {} succumbed to its afflictions! (+{} gold)",
            enemy.name, gold
        ));
        logs.extend(roll_and_add_loot(
            enemy.loot_table_id,
            &mut session.player.inventory,
        ));
        session.enemy = None;
        session.phase = GamePhase::Exploring;
    }

    // Reset temporary defend bonus
    if player_action == GameAction::Defend {
        session.player.armor -= 3;
    }

    logs
}

/// Execute the enemy's telegraphed intent.
fn enemy_turn(session: &mut SessionState) -> Vec<String> {
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

    if let Some(ref mut enemy) = session.enemy {
        match &enemy.intent {
            Intent::Attack { dmg } => {
                let base = (*dmg - session.player.armor).max(1);
                let actual = (base as f32 * cursed_mult).round() as i32;
                let shielded = session
                    .player
                    .effects
                    .iter()
                    .any(|e| e.kind == EffectKind::Shielded);
                let final_dmg = if shielded { actual / 2 } else { actual };
                session.player.hp -= final_dmg;
                logs.push(format!("{} attacks for {} damage!", enemy.name, final_dmg));
            }
            Intent::HeavyAttack { dmg } => {
                let base = (*dmg - session.player.armor).max(1);
                let actual = (base as f32 * cursed_mult).round() as i32;
                session.player.hp -= actual;
                logs.push(format!(
                    "{} unleashes a devastating blow for {} damage!",
                    enemy.name, actual
                ));
            }
            Intent::Defend { armor } => {
                enemy.armor += armor;
                logs.push(format!(
                    "{} fortifies its defenses. (+{} armor)",
                    enemy.name, armor
                ));
            }
            Intent::Charge => {
                enemy.charged = true;
                logs.push(format!("{} is gathering power...", enemy.name));
            }
            Intent::Flee => {
                logs.push(format!("The {} flees!", enemy.name));
                session.enemy = None;
                session.phase = GamePhase::Exploring;
                return logs;
            }
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
    }

    // Check player death
    if session.player.hp <= 0 {
        session.phase = GamePhase::GameOver(GameOverReason::Defeated);
        logs.push("You have been defeated...".to_owned());
    }

    logs
}

// ── Item usage ──────────────────────────────────────────────────────

fn apply_item(session: &mut SessionState, item_id: &str) -> Result<String, String> {
    let stack = session
        .player
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
            session.player.hp = (session.player.hp + amount).min(session.player.max_hp);
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
            session.player.effects.push(EffectInstance {
                kind: kind.clone(),
                stacks: *stacks,
                turns_left: *turns,
            });
            format!("Used {}! Gained {:?} for {} turns.", def.name, kind, turns)
        }
        Some(UseEffect::RemoveEffect { kind }) => {
            session.player.effects.retain(|e| e.kind != *kind);
            format!("Used {}! Removed {:?}.", def.name, kind)
        }
        None => {
            return Err("That item has no use effect.".to_owned());
        }
    };

    // Handle bandage special: also removes bleed
    if item_id == "bandage" {
        session
            .player
            .effects
            .retain(|e| e.kind != EffectKind::Bleed);
    }

    stack.qty -= 1;
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

    // Apply room hazards on entry
    for hazard in &session.room.hazards {
        match hazard {
            Hazard::Spikes { dmg } => {
                session.player.hp -= dmg;
                logs.push(format!(
                    "Spikes jut from the ground! You take {} damage.",
                    dmg
                ));
            }
            Hazard::Gas {
                effect,
                stacks,
                turns,
            } => {
                session.player.effects.push(EffectInstance {
                    kind: effect.clone(),
                    stacks: *stacks,
                    turns_left: *turns,
                });
                logs.push(format!(
                    "A cloud of noxious gas fills the room! Gained {:?}.",
                    effect
                ));
            }
        }
    }

    // Check if hazards killed the player
    if session.player.hp <= 0 {
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
            session.player.gold += gold;
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
            session.player.hp = (session.player.hp + heal).min(session.player.max_hp);
            logs.push(format!("The shrine's warmth restores {} HP.", heal));
            session.phase = GamePhase::Rest;
        }
        RoomType::Trap => {
            let dmg = 5 + next_index as i32;
            session.player.hp -= dmg;
            logs.push(format!("A trap springs! You take {} damage.", dmg));
            if session.player.hp <= 0 {
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

fn apply_buy(session: &mut SessionState, item_id: &str) -> Result<String, String> {
    let offer = session
        .room
        .merchant_stock
        .iter()
        .find(|o| o.item_id == item_id)
        .ok_or_else(|| "That item is not for sale.".to_owned())?;

    if session.player.gold < offer.price {
        return Err(format!(
            "Not enough gold. Need {} but have {}.",
            offer.price, session.player.gold
        ));
    }

    let price = offer.price;
    session.player.gold -= price;

    add_item_to_inventory(&mut session.player.inventory, item_id);

    let name = content::find_item(item_id).map(|d| d.name).unwrap_or("???");
    Ok(format!("Purchased {} for {} gold.", name, price))
}

// ── Story events ────────────────────────────────────────────────────

fn apply_story_choice(session: &mut SessionState, idx: usize) -> Result<Vec<String>, String> {
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

    session.player.hp = (session.player.hp + outcome.hp_change).min(session.player.max_hp);
    session.player.gold += outcome.gold_change;

    if let Some(item_id) = outcome.item_gain {
        add_item_to_inventory(&mut session.player.inventory, item_id);
        if let Some(def) = content::find_item(item_id) {
            logs.push(format!("Gained: {}!", def.name));
        }
    }

    if let Some((kind, stacks, turns)) = outcome.effect_gain {
        session.player.effects.push(EffectInstance {
            kind,
            stacks,
            turns_left: turns,
        });
    }

    if session.player.hp <= 0 {
        session.phase = GamePhase::GameOver(GameOverReason::Defeated);
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

fn effective_accuracy(session: &SessionState) -> f32 {
    let mut acc = session.player.accuracy;
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
    use std::time::Instant;

    fn test_session() -> SessionState {
        let (id, short_id) = new_short_sid();
        let mut player = PlayerState::default();
        player.inventory = content::starting_inventory();

        SessionState {
            id,
            short_id,
            owner: serenity::UserId::new(1),
            party: Vec::new(),
            mode: SessionMode::Solo,
            phase: GamePhase::Exploring,
            channel_id: serenity::ChannelId::new(1),
            message_id: serenity::MessageId::new(1),
            created_at: Instant::now(),
            last_action_at: Instant::now(),
            turn: 0,
            player,
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
        let result = apply_action(&mut session, GameAction::Attack, serenity::UserId::new(1));
        assert!(result.is_err());
    }

    #[test]
    fn explore_advances_room() {
        let mut session = test_session();
        session.phase = GamePhase::Exploring;
        let result = apply_action(&mut session, GameAction::Explore, serenity::UserId::new(1));
        assert!(result.is_ok());
        assert_eq!(session.room.index, 1);
    }

    #[test]
    fn flee_ends_session() {
        let mut session = test_session();
        let result = apply_action(&mut session, GameAction::Flee, serenity::UserId::new(1));
        assert!(result.is_ok());
        assert_eq!(session.phase, GamePhase::GameOver(GameOverReason::Escaped));
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
        session.party.push(serenity::UserId::new(42));
        let result = apply_action(&mut session, GameAction::Explore, serenity::UserId::new(42));
        assert!(result.is_ok());
    }

    #[test]
    fn use_item_heals() {
        let mut session = test_session();
        session.player.hp = 30;
        let result = apply_action(
            &mut session,
            GameAction::UseItem("potion".to_owned()),
            serenity::UserId::new(1),
        );
        assert!(result.is_ok());
        assert_eq!(session.player.hp, 45); // 30 + 15
    }

    #[test]
    fn use_item_capped_at_max_hp() {
        let mut session = test_session();
        session.player.hp = 48;
        let _ = apply_action(
            &mut session,
            GameAction::UseItem("potion".to_owned()),
            serenity::UserId::new(1),
        );
        assert_eq!(session.player.hp, 50); // capped at max_hp
    }

    #[test]
    fn toggle_items_flips_flag() {
        let mut session = test_session();
        assert!(!session.show_items);
        let _ = apply_action(
            &mut session,
            GameAction::ToggleItems,
            serenity::UserId::new(1),
        );
        assert!(session.show_items);
    }

    #[test]
    fn game_over_blocks_actions() {
        let mut session = test_session();
        session.phase = GamePhase::GameOver(GameOverReason::Defeated);
        let result = apply_action(&mut session, GameAction::Explore, serenity::UserId::new(1));
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
        session.player.hp = 1;
        session.player.effects.push(EffectInstance {
            kind: EffectKind::Poison,
            stacks: 1,
            turns_left: 3,
        });
        let _ = apply_action(&mut session, GameAction::Defend, serenity::UserId::new(1));
        assert_eq!(session.phase, GamePhase::GameOver(GameOverReason::Defeated));
    }

    #[test]
    fn merchant_buy_deducts_gold() {
        let mut session = test_session();
        session.phase = GamePhase::Merchant;
        session.player.gold = 50;
        session.room.merchant_stock = vec![MerchantOffer {
            item_id: "potion".to_owned(),
            price: 10,
        }];
        let result = apply_action(
            &mut session,
            GameAction::Buy("potion".to_owned()),
            serenity::UserId::new(1),
        );
        assert!(result.is_ok());
        assert_eq!(session.player.gold, 40);
    }

    #[test]
    fn merchant_buy_insufficient_gold() {
        let mut session = test_session();
        session.phase = GamePhase::Merchant;
        session.player.gold = 5;
        session.room.merchant_stock = vec![MerchantOffer {
            item_id: "potion".to_owned(),
            price: 10,
        }];
        let result = apply_action(
            &mut session,
            GameAction::Buy("potion".to_owned()),
            serenity::UserId::new(1),
        );
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
        let hp_before = session.player.hp;
        let result = apply_action(
            &mut session,
            GameAction::StoryChoice(0),
            serenity::UserId::new(1),
        );
        assert!(result.is_ok());
        assert_eq!(
            session.player.hp,
            (hp_before + 10).min(session.player.max_hp)
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
        let result = apply_action(
            &mut session,
            GameAction::StoryChoice(5),
            serenity::UserId::new(1),
        );
        assert!(result.is_err());
    }

    #[test]
    fn buy_not_allowed_outside_merchant() {
        let mut session = test_session();
        session.phase = GamePhase::Exploring;
        let result = apply_action(
            &mut session,
            GameAction::Buy("potion".to_owned()),
            serenity::UserId::new(1),
        );
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
            let _ = apply_action(&mut session, GameAction::Attack, serenity::UserId::new(1));
        }
        // Enemy should either be dead or have taken damage
        if let Some(ref enemy) = session.enemy {
            assert!(enemy.hp < starting_hp);
        }
    }
}
