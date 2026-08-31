use std::collections::HashMap;
use std::time::Instant;

use crate::content;
use crate::player::PlayerId;
use crate::types::{
    ClassType, GamePhase, PlayerState, QuestJournal, SessionMode, SessionState, new_short_sid,
};

/// Start a fresh solo run in the city, with a generated map and a
/// class-appropriate loadout.
///
/// Front ends that need more (party mode, a persisted profile applied over
/// the top, Discord transport ids) build on the returned state rather than
/// reimplementing the setup.
pub fn start_solo(owner: PlayerId, name: &str, class: ClassType) -> SessionState {
    let (id, short_id) = new_short_sid();

    let map = content::generate_initial_map(&id);
    let room = map
        .tiles
        .get(&map.position)
        .map(content::room_from_tile)
        .unwrap_or_else(|| content::generate_room(0));

    let (hp, armor, damage_bonus, crit_chance, gold) = content::class_starting_stats(&class);

    let player = PlayerState {
        name: name.to_owned(),
        inventory: content::starting_inventory(),
        class,
        max_hp: hp,
        hp,
        armor,
        gold,
        base_damage_bonus: damage_bonus,
        crit_chance,
        ..PlayerState::default()
    };

    SessionState {
        id,
        short_id,
        owner,
        party: Vec::new(),
        mode: SessionMode::Solo,
        phase: GamePhase::City,
        created_at: Instant::now(),
        last_action_at: Instant::now(),
        turn: 0,
        players: HashMap::from([(owner, player)]),
        enemies: Vec::new(),
        room,
        log: vec!["You arrive at the Underground City.".to_owned()],
        show_items: false,
        pending_actions: HashMap::new(),
        map,
        show_map: false,
        show_inventory: false,
        pending_destination: None,
        enemies_had_first_strike: false,
        quest_journal: QuestJournal::default(),
        active_dialogue: None,
        dialogue_memory: Default::default(),
        pursuers: Vec::new(),
    }
}
