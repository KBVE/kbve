//! Shared dungeon-session launch path.
//!
//! Both `/dungeon start` (slash command) and the class-picker button
//! handler need to build the same initial session state and assets.
//! This module owns the build step — claim the play-mode lock, generate
//! the initial map, hydrate the player from any persisted profile, and
//! pre-render the embed/components/card. Callers handle the
//! context-specific message I/O (poise reply vs. component followup)
//! and finish up by calling [`commit_launch`] once the message has
//! been delivered.

use std::collections::HashMap;
use std::sync::Arc;
use std::time::Instant;

use poise::serenity_prelude as serenity;

use kbve::MemberStatus;

use crate::discord::game::{card, content, persistence, render, types::*};
use crate::state::AppState;

/// Pre-built session payload returned by [`prepare_launch`]. The caller
/// sends `embed` + `components` (+ `card_png` if `Some`) to its
/// channel, then calls [`commit_launch`] with the resulting message id.
pub struct Launched {
    /// Fully populated session, except for `message_id` which the
    /// caller fills in once the public dungeon message has been sent.
    pub session_state: SessionState,
    /// RAII guard for the play-mode lock. `commit_launch` consumes it
    /// once the session is registered.
    pub mode_guard: persistence::ModeLockGuard,
    pub embed: serenity::CreateEmbed,
    pub components: Vec<serenity::CreateActionRow>,
    pub card_png: Option<Vec<u8>>,
    pub member_status: MemberStatus,
    pub short_id: ShortSid,
    pub user_id: serenity::UserId,
}

/// Build a fresh dungeon session for `user` in `channel` using `class`.
///
/// Returns `Err(reason)` when the play-mode lock can't be claimed —
/// the caller should surface `reason` as an ephemeral error.
pub async fn prepare_launch(
    app: &Arc<AppState>,
    user: serenity::UserId,
    user_display_name: &str,
    channel: serenity::ChannelId,
    class: ClassType,
) -> Result<Launched, String> {
    let (id, short_id) = super::new_short_sid();

    let mode_guard = app
        .profiles
        .claim_mode(user.get(), &short_id, false)
        .await?;

    let map = content::generate_initial_map(&id);
    let room = content::room_from_tile(map.tiles.get(&map.position).unwrap());
    let phase = GamePhase::City;

    let member_status = app.members.lookup(user.get()).await;
    let (player_name, member_tag) = match &member_status {
        MemberStatus::Member(profile) => {
            let username = profile
                .discord_username
                .clone()
                .unwrap_or_else(|| user_display_name.to_owned());
            (username.clone(), MemberStatusTag::Member { username })
        }
        MemberStatus::Guest { .. } => (user_display_name.to_owned(), MemberStatusTag::Guest),
    };

    let (class_hp, class_armor, class_dmg, class_crit, class_gold) =
        content::class_starting_stats(&class);

    let mut player = PlayerState {
        name: player_name,
        inventory: content::starting_inventory(),
        member_status: member_tag,
        class,
        max_hp: class_hp,
        hp: class_hp,
        armor: class_armor,
        gold: class_gold,
        base_damage_bonus: class_dmg,
        crit_chance: class_crit,
        ..PlayerState::default()
    };

    let mut quest_journal = QuestJournal::default();
    let saved_profile = app.profiles.load(user.get()).await;
    if let Some(ref profile) = saved_profile {
        persistence::apply_profile_to_player(profile, &mut player, &mut quest_journal);
        player.saved_snapshot = Some(profile.clone());
    }

    let session_state = SessionState {
        id,
        short_id: short_id.clone(),
        owner: user,
        party: Vec::new(),
        // Phase 1 of the redesign always launches into Party so the
        // dungeon embed exposes the join button. Solo mode stays in the
        // enum for any internal callers that still need it.
        mode: SessionMode::Party,
        phase,
        channel_id: channel,
        message_id: serenity::MessageId::new(1), // placeholder, filled by caller
        created_at: Instant::now(),
        last_action_at: Instant::now(),
        turn: 0,
        players: HashMap::from([(user, player)]),
        enemies: Vec::new(),
        room,
        log: vec![
            "You arrive at the Underground City. Prepare your party before venturing out..."
                .to_owned(),
        ],
        show_items: false,
        pending_actions: HashMap::new(),
        map,
        show_map: true,
        show_inventory: false,
        pending_destination: None,
        enemies_had_first_strike: false,
        quest_journal,
        active_dialogue: None,
    };

    let components = render::render_components(&session_state);

    let fontdb = app.fontdb.clone();
    let card_png = match card::render_game_card(&session_state, fontdb).await {
        Ok(bytes) => Some(bytes),
        Err(e) => {
            tracing::warn!(error = %e, "Failed to render game card for dungeon start");
            None
        }
    };
    let embed = render::render_embed(&session_state, card_png.is_some());

    Ok(Launched {
        session_state,
        mode_guard,
        embed,
        components,
        card_png,
        member_status,
        short_id,
        user_id: user,
    })
}

/// Finalise a launch after the dungeon message has been delivered.
/// Sets the message id on the session, registers it with the session
/// store, and commits the play-mode lock so it isn't released by the
/// guard's `Drop`.
pub fn commit_launch(
    app: &Arc<AppState>,
    mut session_state: SessionState,
    mode_guard: persistence::ModeLockGuard,
    message_id: serenity::MessageId,
) {
    session_state.message_id = message_id;
    app.sessions.create(session_state);
    mode_guard.commit();
}
