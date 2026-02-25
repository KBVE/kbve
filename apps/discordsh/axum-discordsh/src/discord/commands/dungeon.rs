use std::time::Instant;

use poise::serenity_prelude as serenity;

use crate::discord::bot::{Context, Error};
use crate::discord::game::{self, content, render, types::*};

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

    let (id, short_id) = game::new_short_sid();
    let room = content::generate_room(0);

    // First room is combat — spawn enemy
    let enemy = if room.room_type == RoomType::Combat {
        Some(content::spawn_enemy(0))
    } else {
        None
    };

    let phase = if enemy.is_some() {
        GamePhase::Combat
    } else {
        GamePhase::Exploring
    };

    let player = PlayerState {
        name: ctx.author().name.clone(),
        inventory: content::starting_inventory(),
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
        player,
        enemy,
        room,
        log: vec!["You descend into The Glass Catacombs...".to_owned()],
        show_items: false,
    };

    let embed = render::render_embed(&session_state);
    let components = render::render_components(&session_state);

    let mode_label = match session_mode {
        SessionMode::Solo => "Solo",
        SessionMode::Party => "Party",
    };

    let reply = ctx
        .send(
            poise::CreateReply::default()
                .content(format!(
                    "**Embed Dungeon** started! ({} mode, session `{}`)",
                    mode_label, short_id
                ))
                .embed(embed)
                .components(components),
        )
        .await?;

    // Get the message ID from the reply
    let msg = reply.message().await?;
    let mut final_state = session_state;
    final_state.message_id = msg.id;

    ctx.data().app.sessions.create(final_state);

    Ok(())
}

/// Join an active party session in this channel.
#[poise::command(slash_command)]
async fn join(ctx: Context<'_>) -> Result<(), Error> {
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

    let mut session = handle.lock().await;

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

    session.party.push(user);
    session
        .log
        .push(format!("{} joined the party!", ctx.author().name));

    ctx.send(
        poise::CreateReply::default()
            .content(format!("{} joined the dungeon party!", ctx.author().name)),
    )
    .await?;

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
    let embed = render::render_embed(&session);

    ctx.send(poise::CreateReply::default().embed(embed).ephemeral(true))
        .await?;

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
