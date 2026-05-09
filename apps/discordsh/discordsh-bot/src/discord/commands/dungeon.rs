use poise::serenity_prelude as serenity;

use kbve::MemberStatus;

use crate::discord::bot::{Context, Error};
use crate::discord::components::class_picker;
use crate::discord::game::{card, content, launch, pathfinding, persistence, render, types::*};

/// Dungeon crawler game — stress-test embeds, buttons, and select menus.
#[poise::command(
    slash_command,
    subcommands("start", "join", "leave", "status", "end", "leaderboard", "route")
)]
pub async fn dungeon(_ctx: Context<'_>) -> Result<(), Error> {
    Ok(())
}

/// Start a Party-mode dungeon session. First-time players pick a class.
#[poise::command(slash_command)]
async fn start(ctx: Context<'_>) -> Result<(), Error> {
    let user = ctx.author().id;
    let channel = ctx.channel_id();
    let app = &ctx.data().app;

    // Bail if a session already exists in this channel.
    if let Some(existing) = app.sessions.find_by_channel(channel) {
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

    // Resolve the player's class from their saved profile, or send an
    // ephemeral class picker if they don't have one yet. The picker's
    // button handler resumes this same launch flow.
    let saved_profile = app.profiles.load(user.get()).await;
    let resolved_class = saved_profile
        .as_ref()
        .and_then(persistence::class_from_profile);
    let Some(player_class) = resolved_class else {
        let embed = class_picker::picker_embed();
        let components = class_picker::picker_components();
        ctx.send(
            poise::CreateReply::default()
                .content("You don't have a character yet — pick a class to begin.")
                .embed(embed)
                .components(components)
                .ephemeral(true),
        )
        .await?;
        return Ok(());
    };

    let user_display_name = ctx.author().name.clone();
    let launched =
        match launch::prepare_launch(app, user, &user_display_name, channel, player_class).await {
            Ok(l) => l,
            Err(reason) => {
                ctx.send(
                    poise::CreateReply::default()
                        .content(format!("Cannot start dungeon: {}", reason))
                        .ephemeral(true),
                )
                .await?;
                return Ok(());
            }
        };

    let launch::Launched {
        session_state,
        mode_guard,
        embed,
        components,
        card_png,
        member_status,
        short_id,
        ..
    } = launched;

    let mut create_reply = poise::CreateReply::default()
        .content(format!(
            "**Embed Dungeon** started! (Party mode, session `{}`)",
            short_id
        ))
        .embed(embed)
        .components(components);

    if let Some(png) = card_png {
        create_reply =
            create_reply.attachment(serenity::CreateAttachment::bytes(png, "game_card.png"));
    }

    let reply = ctx.send(create_reply).await?;
    let msg = reply.message().await?;
    let message_id = msg.id;

    let member_status_for_notice = member_status;
    launch::commit_launch(app, session_state, mode_guard, message_id);

    if let MemberStatus::Guest { notified } = &member_status_for_notice
        && !notified
    {
        ctx.send(
            poise::CreateReply::default()
                .content(
                    "You're playing as a **Guest**. Link your Discord account at \
                         <https://kbve.com> to unlock Member perks!",
                )
                .ephemeral(true),
        )
        .await?;
        app.members.mark_notified(user.get());
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

    // Claim the play mode lock for the joining party member.
    // Each player has their own lock — joining a party means claiming
    // the discord mode for that player too. Returns a RAII guard that
    // auto-releases on drop unless we commit() after the player is added.
    let mode_guard = match ctx
        .data()
        .app
        .profiles
        .claim_mode(user.get(), &sid, false)
        .await
    {
        Ok(g) => g,
        Err(reason) => {
            ctx.send(
                poise::CreateReply::default()
                    .content(format!("Cannot join dungeon: {}", reason))
                    .ephemeral(true),
            )
            .await?;
            return Ok(());
        }
    };

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

    let mut joiner_player = PlayerState {
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

    // Load persisted profile for joining player
    let saved_profile = ctx.data().app.profiles.load(user.get()).await;
    if let Some(ref profile) = saved_profile {
        persistence::apply_profile_to_player(
            profile,
            &mut joiner_player,
            &mut session.quest_journal,
        );
        joiner_player.saved_snapshot = Some(profile.clone());
    }

    session.players.insert(user, joiner_player);

    session
        .log
        .push(format!("{} joined the party!", ctx.author().name));

    // Drop lock before sending response
    drop(session);

    // Player is now in the session — commit the mode lock guard so it
    // doesn't release on drop. Future release will happen via save_all_players
    // when the session ends.
    mode_guard.commit();

    ctx.send(
        poise::CreateReply::default()
            .content(format!("{} joined the dungeon party!", ctx.author().name)),
    )
    .await?;

    // One-time guest notice for joining player
    if let MemberStatus::Guest { notified } = &member_status_raw
        && !notified
    {
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
        // Owner leaving ends the session — save all players
        session.phase = GamePhase::GameOver(GameOverReason::Escaped);
        persistence::save_all_players(&ctx.data().app.profiles, &session, &GameOverReason::Escaped);
        drop(session);
        ctx.data().app.sessions.remove(&sid);
        ctx.send(poise::CreateReply::default().content("Session ended (owner left)."))
            .await?;
    } else {
        // Save the leaving player's progress (escaped)
        if let Some(player) = session.players.get(&user) {
            let (profile, run) = persistence::extract_save_payload(
                user.get(),
                &player.name,
                player,
                &session.quest_journal,
                &GameOverReason::Escaped,
                player.saved_snapshot.as_ref(),
                &session,
            );
            ctx.data().app.profiles.save_async(profile, run);
        }
        // Release the leaving player's mode lock so they can switch modes.
        ctx.data()
            .app
            .profiles
            .release_mode_async(user.get(), session.short_id.clone());
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

    // Save all players before ending
    persistence::save_all_players(&ctx.data().app.profiles, &session, &GameOverReason::Escaped);

    drop(session);
    ctx.data().app.sessions.remove(&sid);

    ctx.send(poise::CreateReply::default().content(format!("Dungeon session `{}` ended.", sid)))
        .await?;

    Ok(())
}

/// View the dungeon leaderboard.
#[poise::command(slash_command)]
async fn leaderboard(
    ctx: Context<'_>,
    #[description = "Category: xp, kills, bosses, rooms, gold"] category: Option<String>,
) -> Result<(), Error> {
    let (cat_id, cat_label) = match category.as_deref() {
        Some("kills") => (2i16, "Kills"),
        Some("bosses") => (3i16, "Bosses Defeated"),
        Some("rooms") => (4i16, "Rooms Cleared"),
        Some("gold") => (5i16, "Gold Earned"),
        _ => (1i16, "XP"),
    };

    let entries = ctx.data().app.profiles.leaderboard(cat_id, 10).await;

    if entries.is_empty() {
        ctx.send(
            poise::CreateReply::default()
                .content("No leaderboard data yet. Play some dungeons!")
                .ephemeral(true),
        )
        .await?;
        return Ok(());
    }

    let mut lines = Vec::new();
    for entry in &entries {
        let medal = match entry.rank {
            1 => "\u{1F947}",
            2 => "\u{1F948}",
            3 => "\u{1F949}",
            _ => "\u{25AB}",
        };
        lines.push(format!(
            "{} **#{}** {} — Lv.{} | {} **{}**",
            medal, entry.rank, entry.discord_name, entry.level, cat_label, entry.value
        ));
    }

    let embed = serenity::CreateEmbed::new()
        .title(format!("Dungeon Leaderboard — {}", cat_label))
        .description(lines.join("\n"))
        .color(0xFFD700);

    ctx.send(poise::CreateReply::default().embed(embed)).await?;

    Ok(())
}

/// Shortest revealed-tile route to a room kind or named landmark.
#[poise::command(slash_command)]
async fn route(
    ctx: Context<'_>,
    #[description = "Room kind: boss / city / merchant / rest / treasure / story"] target: Option<
        String,
    >,
    #[description = "Landmark slug (e.g. shattered-crown, goblin-cave)"] landmark: Option<String>,
) -> Result<(), Error> {
    let user = ctx.author().id;

    enum ResolvedGoal {
        Room(RoomType),
        Landmark(String),
    }

    let goal = match (target.as_deref(), landmark.as_deref()) {
        (Some(_), Some(_)) => {
            ctx.send(
                poise::CreateReply::default()
                    .content("Pick one of `target` or `landmark`, not both.")
                    .ephemeral(true),
            )
            .await?;
            return Ok(());
        }
        (None, None) => {
            ctx.send(
                poise::CreateReply::default()
                    .content(
                        "Pass either a `target` (boss / city / merchant / rest / treasure / story) \
                         or a `landmark` slug.",
                    )
                    .ephemeral(true),
            )
            .await?;
            return Ok(());
        }
        (Some(t), None) => {
            let room_type = match t.to_lowercase().as_str() {
                "boss" => RoomType::Boss,
                "city" | "town" => RoomType::UndergroundCity,
                "merchant" | "market" | "shop" => RoomType::Merchant,
                "rest" | "shrine" | "campfire" => RoomType::RestShrine,
                "treasure" | "loot" => RoomType::Treasure,
                "story" | "lore" => RoomType::Story,
                other => {
                    ctx.send(
                        poise::CreateReply::default()
                            .content(format!(
                                "Unknown target `{other}`. Try: boss / city / merchant / rest / treasure / story.",
                            ))
                            .ephemeral(true),
                    )
                    .await?;
                    return Ok(());
                }
            };
            ResolvedGoal::Room(room_type)
        }
        (None, Some(slug)) => {
            let slug = slug.trim().to_lowercase();
            if slug.is_empty() {
                ctx.send(
                    poise::CreateReply::default()
                        .content("Landmark slug is empty.")
                        .ephemeral(true),
                )
                .await?;
                return Ok(());
            }
            ResolvedGoal::Landmark(slug)
        }
    };

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
    let from = session.map.position;
    let goal_kind = match &goal {
        ResolvedGoal::Room(rt) => pathfinding::GoalKind::Room(rt.clone()),
        ResolvedGoal::Landmark(slug) => pathfinding::GoalKind::Landmark(slug),
    };
    let path = pathfinding::path_to_goal(&session.map, from, goal_kind);
    let goal_tile = path
        .as_ref()
        .and_then(|p| p.last())
        .and_then(|p| session.map.tiles.get(p))
        .cloned();
    drop(session);

    let target_label: String = match &goal {
        ResolvedGoal::Room(rt) => match rt {
            RoomType::Boss => "boss arena",
            RoomType::UndergroundCity => "underground city",
            RoomType::Merchant => "merchant",
            RoomType::RestShrine => "rest shrine",
            RoomType::Treasure => "treasure room",
            RoomType::Story => "story room",
            _ => "tile",
        }
        .to_owned(),
        ResolvedGoal::Landmark(slug) => crate::discord::game::proto_bridge::landmark_name(slug)
            .map(|n| format!("landmark `{n}`"))
            .unwrap_or_else(|| format!("landmark `{slug}`")),
    };

    let body = match (path, goal_tile) {
        (Some(path), Some(goal_tile)) if path.len() >= 2 => {
            let dirs = pathfinding::directions_along_path(&path);
            let route = dirs
                .iter()
                .map(|d| d.label())
                .collect::<Vec<_>>()
                .join(" \u{2192} "); // " → "
            let hops = dirs.len();
            format!(
                "{} hop(s) to **{}** ({}):\n{}",
                hops, goal_tile.name, target_label, route
            )
        }
        (Some(path), Some(goal_tile)) if path.len() == 1 => format!(
            "You're already in **{}** ({}).",
            goal_tile.name, target_label
        ),
        _ => match &goal {
            ResolvedGoal::Landmark(slug) => format!(
                "No revealed path to landmark `{slug}` from your current room. \
                 Either it isn't on the map yet, or you haven't explored \
                 close enough to reveal a route."
            ),
            ResolvedGoal::Room(_) => format!(
                "No revealed path to a {} from your current room. Explore further first.",
                target_label
            ),
        },
    };

    ctx.send(poise::CreateReply::default().content(body).ephemeral(true))
        .await?;

    Ok(())
}
