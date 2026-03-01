use std::collections::HashMap;
use std::time::Instant;

use poise::serenity_prelude as serenity;

use kbve::MemberStatus;

use crate::discord::bot::{Context, Error};
use crate::discord::game::{self, card, content, render, types::*};

/// Dungeon crawler game — stress-test embeds, buttons, and select menus.
#[poise::command(slash_command, subcommands("start", "join", "leave", "status", "end"))]
pub async fn dungeon(_ctx: Context<'_>) -> Result<(), Error> {
    Ok(())
}

/// Start a new dungeon session.
#[poise::command(slash_command)]
async fn start(
    ctx: Context<'_>,
    #[description = "Session mode"] mode: Option<String>,
    #[description = "Choose your class (warrior/rogue/cleric)"] class: Option<String>,
) -> Result<(), Error> {
    let user = ctx.author().id;
    let channel = ctx.channel_id();

    // Check for existing session in this channel
    if let Some(existing) = ctx.data().app.sessions.find_by_channel(channel) {
        ctx.send(
            poise::CreateReply::default()
                .content(format!(
                    "There's already an active session in this channel ({}). End it first with `/dungeon end`.",
                    existing
                ))
                .ephemeral(true),
        )
        .await?;
        return Ok(());
    }

    let session_mode = match mode.as_deref() {
        Some("party") => SessionMode::Party,
        _ => SessionMode::Solo,
    };

    let player_class = match class.as_deref() {
        Some("rogue") => ClassType::Rogue,
        Some("cleric") => ClassType::Cleric,
        _ => ClassType::Warrior,
    };

    let (id, short_id) = game::new_short_sid();
    let map = content::generate_initial_map(&id);
    let room = content::room_from_tile(map.tiles.get(&map.position).unwrap());
    let phase = GamePhase::City;
    let enemies = Vec::new();

    // Membership lookup (cached, gracefully degrades to Guest)
    let member_status_raw = ctx.data().app.members.lookup(user.get()).await;
    let (player_name, member_tag) = match &member_status_raw {
        MemberStatus::Member(profile) => (
            profile
                .discord_username
                .clone()
                .unwrap_or_else(|| ctx.author().name.clone()),
            MemberStatusTag::Member {
                username: profile
                    .discord_username
                    .clone()
                    .unwrap_or_else(|| ctx.author().name.clone()),
            },
        ),
        MemberStatus::Guest { .. } => (ctx.author().name.clone(), MemberStatusTag::Guest),
    };

    let (class_hp, class_armor, class_dmg, class_crit, class_gold) =
        content::class_starting_stats(&player_class);

    let player = PlayerState {
        name: player_name,
        inventory: content::starting_inventory(),
        member_status: member_tag,
        class: player_class,
        max_hp: class_hp,
        hp: class_hp,
        armor: class_armor,
        gold: class_gold,
        base_damage_bonus: class_dmg,
        crit_chance: class_crit,
        ..PlayerState::default()
    };

    // We need to send the message first to get the MessageId
    let session_state = SessionState {
        id,
        short_id: short_id.clone(),
        owner: user,
        party: Vec::new(),
        mode: session_mode.clone(),
        phase,
        channel_id: channel,
        message_id: serenity::MessageId::new(1), // placeholder, updated below
        created_at: Instant::now(),
        last_action_at: Instant::now(),
        turn: 0,
        players: HashMap::from([(user, player)]),
        enemies,
        room,
        log: vec![
            "You arrive at the Underground City. Prepare your party before venturing out..."
                .to_owned(),
        ],
        show_items: false,
        pending_actions: HashMap::new(),
        map,
        show_map: true,
        pending_destination: None,
    };

    let components = render::render_components(&session_state);

    // Render game card PNG (CPU-bound, runs on blocking thread)
    let fontdb = ctx.data().app.fontdb.clone();
    let card_png = card::render_game_card(&session_state, fontdb).await;
    if let Err(ref e) = card_png {
        tracing::warn!(error = %e, "Failed to render game card for /dungeon start");
    }
    let has_card = card_png.is_ok();
    let embed = render::render_embed(&session_state, has_card);

    let mode_label = match session_mode {
        SessionMode::Solo => "Solo",
        SessionMode::Party => "Party",
    };

    let mut create_reply = poise::CreateReply::default()
        .content(format!(
            "**Embed Dungeon** started! ({} mode, session `{}`)",
            mode_label, short_id
        ))
        .embed(embed)
        .components(components);

    if let Ok(png) = card_png {
        create_reply =
            create_reply.attachment(serenity::CreateAttachment::bytes(png, "game_card.png"));
    }

    let reply = ctx.send(create_reply).await?;

    // Get the message ID from the reply
    let msg = reply.message().await?;
    let mut final_state = session_state;
    final_state.message_id = msg.id;

    ctx.data().app.sessions.create(final_state);

    // One-time guest notice
    if let MemberStatus::Guest { notified } = &member_status_raw {
        if !notified {
            ctx.send(
                poise::CreateReply::default()
                    .content(
                        "You're playing as a **Guest**. Link your Discord account at \
                         <https://kbve.com> to unlock Member perks!",
                    )
                    .ephemeral(true),
            )
            .await?;
            ctx.data().app.members.mark_notified(user.get());
        }
    }

    Ok(())
}

/// Join an active party session in this channel.
#[poise::command(slash_command)]
async fn join(
    ctx: Context<'_>,
    #[description = "Choose your class (warrior/rogue/cleric)"] class: Option<String>,
) -> Result<(), Error> {
    let user = ctx.author().id;
    let channel = ctx.channel_id();

    let sid = match ctx.data().app.sessions.find_by_channel(channel) {
        Some(s) => s,
        None => {
            ctx.send(
                poise::CreateReply::default()
                    .content("No active session in this channel.")
                    .ephemeral(true),
            )
            .await?;
            return Ok(());
        }
    };

    let handle = match ctx.data().app.sessions.get(&sid) {
        Some(h) => h,
        None => {
            ctx.send(
                poise::CreateReply::default()
                    .content("Session not found.")
                    .ephemeral(true),
            )
            .await?;
            return Ok(());
        }
    };

    // Pre-validate with lock, then drop before async membership lookup
    {
        let session = handle.lock().await;

        if session.mode != SessionMode::Party {
            ctx.send(
                poise::CreateReply::default()
                    .content(
                        "This is a solo session. Start a party session with `/dungeon start party`.",
                    )
                    .ephemeral(true),
            )
            .await?;
            return Ok(());
        }

        if session.owner == user || session.party.contains(&user) {
            ctx.send(
                poise::CreateReply::default()
                    .content("You're already in this session.")
                    .ephemeral(true),
            )
            .await?;
            return Ok(());
        }

        if session.party.len() >= 3 {
            ctx.send(
                poise::CreateReply::default()
                    .content("Party is full (max 4 players including owner).")
                    .ephemeral(true),
            )
            .await?;
            return Ok(());
        }
    } // Lock dropped here before async lookup

    // Membership lookup for joining player
    let member_status_raw = ctx.data().app.members.lookup(user.get()).await;
    let (joiner_name, joiner_tag) = match &member_status_raw {
        MemberStatus::Member(profile) => (
            profile
                .discord_username
                .clone()
                .unwrap_or_else(|| ctx.author().name.clone()),
            MemberStatusTag::Member {
                username: profile
                    .discord_username
                    .clone()
                    .unwrap_or_else(|| ctx.author().name.clone()),
            },
        ),
        MemberStatus::Guest { .. } => (ctx.author().name.clone(), MemberStatusTag::Guest),
    };

    // Re-acquire lock and re-validate (another player may have joined)
    let mut session = handle.lock().await;

    if session.party.contains(&user) {
        ctx.send(
            poise::CreateReply::default()
                .content("You're already in this session.")
                .ephemeral(true),
        )
        .await?;
        return Ok(());
    }

    if session.party.len() >= 3 {
        ctx.send(
            poise::CreateReply::default()
                .content("Party is full (max 4 players including owner).")
                .ephemeral(true),
        )
        .await?;
        return Ok(());
    }

    session.party.push(user);

    let joiner_class = match class.as_deref() {
        Some("rogue") => ClassType::Rogue,
        Some("cleric") => ClassType::Cleric,
        _ => ClassType::Warrior,
    };
    let (class_hp, class_armor, class_dmg, class_crit, class_gold) =
        content::class_starting_stats(&joiner_class);

    let joiner_player = PlayerState {
        name: joiner_name,
        inventory: content::starting_inventory(),
        member_status: joiner_tag,
        class: joiner_class,
        max_hp: class_hp,
        hp: class_hp,
        armor: class_armor,
        gold: class_gold,
        base_damage_bonus: class_dmg,
        crit_chance: class_crit,
        ..PlayerState::default()
    };
    session.players.insert(user, joiner_player);

    session
        .log
        .push(format!("{} joined the party!", ctx.author().name));

    // Drop lock before sending response
    drop(session);

    ctx.send(
        poise::CreateReply::default()
            .content(format!("{} joined the dungeon party!", ctx.author().name)),
    )
    .await?;

    // One-time guest notice for joining player
    if let MemberStatus::Guest { notified } = &member_status_raw {
        if !notified {
            ctx.send(
                poise::CreateReply::default()
                    .content(
                        "You're playing as a **Guest**. Link your Discord account at \
                         <https://kbve.com> to unlock Member perks!",
                    )
                    .ephemeral(true),
            )
            .await?;
            ctx.data().app.members.mark_notified(user.get());
        }
    }

    Ok(())
}

/// Leave the current dungeon session.
#[poise::command(slash_command)]
async fn leave(ctx: Context<'_>) -> Result<(), Error> {
    let user = ctx.author().id;

    let sid = match ctx.data().app.sessions.find_by_user(user) {
        Some(s) => s,
        None => {
            ctx.send(
                poise::CreateReply::default()
                    .content("You're not in any active session.")
                    .ephemeral(true),
            )
            .await?;
            return Ok(());
        }
    };

    let handle = match ctx.data().app.sessions.get(&sid) {
        Some(h) => h,
        None => return Ok(()),
    };

    let mut session = handle.lock().await;

    if session.owner == user {
        // Owner leaving ends the session
        session.phase = GamePhase::GameOver(GameOverReason::Escaped);
        drop(session);
        ctx.data().app.sessions.remove(&sid);
        ctx.send(poise::CreateReply::default().content("Session ended (owner left)."))
            .await?;
    } else {
        session.party.retain(|&id| id != user);
        session.players.remove(&user);
        session
            .log
            .push(format!("{} left the party.", ctx.author().name));
        ctx.send(
            poise::CreateReply::default().content(format!("{} left the party.", ctx.author().name)),
        )
        .await?;
    }

    Ok(())
}

/// Show the current status of your dungeon session.
#[poise::command(slash_command)]
async fn status(ctx: Context<'_>) -> Result<(), Error> {
    let user = ctx.author().id;

    let sid = match ctx.data().app.sessions.find_by_user(user) {
        Some(s) => s,
        None => {
            ctx.send(
                poise::CreateReply::default()
                    .content("You're not in any active session.")
                    .ephemeral(true),
            )
            .await?;
            return Ok(());
        }
    };

    let handle = match ctx.data().app.sessions.get(&sid) {
        Some(h) => h,
        None => return Ok(()),
    };

    let session = handle.lock().await;
    let session_clone = session.clone();
    drop(session);

    // Render game card PNG
    let fontdb = ctx.data().app.fontdb.clone();
    let card_png = card::render_game_card(&session_clone, fontdb).await;
    if let Err(ref e) = card_png {
        tracing::warn!(error = %e, "Failed to render game card for /dungeon status");
    }
    let has_card = card_png.is_ok();
    let embed = render::render_embed(&session_clone, has_card);

    let mut reply = poise::CreateReply::default().embed(embed).ephemeral(true);
    if let Ok(png) = card_png {
        reply = reply.attachment(serenity::CreateAttachment::bytes(png, "game_card.png"));
    }

    ctx.send(reply).await?;

    Ok(())
}

/// End the current dungeon session (owner only).
#[poise::command(slash_command)]
async fn end(ctx: Context<'_>) -> Result<(), Error> {
    let user = ctx.author().id;

    let sid = match ctx.data().app.sessions.find_by_user(user) {
        Some(s) => s,
        None => {
            ctx.send(
                poise::CreateReply::default()
                    .content("You're not in any active session.")
                    .ephemeral(true),
            )
            .await?;
            return Ok(());
        }
    };

    let handle = match ctx.data().app.sessions.get(&sid) {
        Some(h) => h,
        None => return Ok(()),
    };

    let session = handle.lock().await;

    if session.owner != user {
        ctx.send(
            poise::CreateReply::default()
                .content("Only the session owner can end the dungeon.")
                .ephemeral(true),
        )
        .await?;
        return Ok(());
    }

    drop(session);
    ctx.data().app.sessions.remove(&sid);

    ctx.send(poise::CreateReply::default().content(format!("Dungeon session `{}` ended.", sid)))
        .await?;

    Ok(())
}
