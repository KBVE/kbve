//! Unified duel registry: one code path for PvE trainer duels, the debug battle,
//! and (PR3) PvP. Pure commit/resolve/timeout/forfeit functions wrapped by thin
//! bevy systems; the engine `BattleState` stays the only battle truth.

use std::collections::HashMap;

use bevy::prelude::Entity;

use crate::game;

pub enum DuelSide {
    Human {
        slot: u16,
        name: String,
    },
    Npc {
        trainer: Option<Entity>,
        name: String,
        difficulty: simgrid::AiDifficulty,
    },
}

pub struct Duel {
    pub state: simgrid::BattleState,
    pub sides: [DuelSide; 2],
    pub committed: [Option<simgrid::BattleAction>; 2],
    pub deadline_tick: u32,
}

#[derive(bevy::prelude::Resource, Default)]
pub struct ActiveDuels {
    pub by_id: HashMap<u32, Duel>,
    pub by_slot: HashMap<u16, u32>,
    next_id: u32,
}

pub const DUEL_TURN_TICKS: u32 = 30 * simgrid::SIM_TICK_HZ;

impl ActiveDuels {
    /// Register a new duel, indexing every human side by slot for turn routing.
    pub fn create(&mut self, duel: Duel) -> u32 {
        self.next_id = self.next_id.wrapping_add(1);
        let id = self.next_id;
        for side in &duel.sides {
            if let DuelSide::Human { slot, .. } = side {
                self.by_slot.insert(*slot, id);
            }
        }
        self.by_id.insert(id, duel);
        id
    }

    /// Drop a duel and clear its slot index entries.
    pub fn remove(&mut self, id: u32) -> Option<Duel> {
        let duel = self.by_id.remove(&id)?;
        for side in &duel.sides {
            if let DuelSide::Human { slot, .. } = side {
                self.by_slot.remove(slot);
            }
        }
        Some(duel)
    }
}

fn combatant_from_snapshot(snap: &simgrid::PetSnapshot) -> Option<simgrid::Combatant> {
    let species = game::NPC_DB.get(&snap.species_ref)?;
    let mut fresh = snap.clone();
    fresh.vitals.hp = fresh.vitals.max_hp;
    Some(simgrid::Combatant::from_pet(&fresh, species))
}

/// Fresh full-HP battle copies of the player's persisted roster; empty when the
/// roster is empty (caller falls back to a minted team).
pub fn roster_team(
    bank: &simgrid::PetBank,
    roster: &simgrid::PetRoster,
) -> Vec<simgrid::Combatant> {
    bank.snapshot(roster)
        .iter()
        .filter_map(combatant_from_snapshot)
        .collect()
}

pub fn stream_duel_views(
    bcast: &simgrid::Outbound,
    duel: &Duel,
    events: &[simgrid::proto::PetBattleWireEvent],
    now_tick: u32,
) {
    for (idx, side) in duel.sides.iter().enumerate() {
        if let DuelSide::Human { slot, .. } = side {
            let view = viewer_view(duel, idx, events, now_tick);
            game::send_battle_view(bcast, simgrid::proto::PlayerSlot(*slot), &view);
        }
    }
}

/// Remove a finished duel and free its trainer for the next challenger.
pub fn finish_duel(duels: &mut ActiveDuels, id: u32, commands: &mut bevy::prelude::Commands) {
    if let Some(duel) = duels.remove(id) {
        for side in &duel.sides {
            if let DuelSide::Npc {
                trainer: Some(e), ..
            } = side
            {
                commands.entity(*e).remove::<TrainerBusy>();
            }
        }
    }
}

#[derive(bevy::prelude::Component)]
pub struct Trainer(pub usize);

#[derive(bevy::prelude::Component)]
pub struct TrainerBusy;

pub const TRAINER_REF: &str = "trainer";
const CHALLENGE_RANGE: i32 = 2;

pub struct TrainerDef {
    pub name: &'static str,
    pub team: &'static [(&'static str, u32)],
    pub difficulty: simgrid::AiDifficulty,
}

pub const TRAINERS: &[TrainerDef] = &[TrainerDef {
    name: "Tamer Bryn",
    team: &[("mechamutt", 42), ("mechamutt", 48), ("mechamutt", 55)],
    difficulty: simgrid::AiDifficulty::Tactician,
}];

/// Mint a trainer's authored team as fresh battle combatants.
pub fn trainer_team(def: &TrainerDef) -> Vec<simgrid::Combatant> {
    def.team
        .iter()
        .filter_map(|(species_ref, level)| {
            let species = game::NPC_DB.get(species_ref)?;
            simgrid::mint_pet_from_species(species, *level)
                .map(|snap| simgrid::Combatant::from_pet(&snap, species))
        })
        .collect()
}

/// Chebyshev walk-up range a player must be within to challenge a trainer.
pub fn within_challenge_range(a: simgrid::proto::Tile, b: simgrid::proto::Tile) -> bool {
    (a.x - b.x).abs() <= CHALLENGE_RANGE && (a.y - b.y).abs() <= CHALLENGE_RANGE
}

/// Spawn every authored `TrainerDef` on the ground floor near the player spawn,
/// tagged with its `Trainer` index so a challenge resolves back to its team.
pub fn spawn_trainers(
    registry: &simgrid::KindRegistry,
    spawn: simgrid::proto::Tile,
    commands: &mut bevy::prelude::Commands,
) {
    let Some(kind) = registry.kind_of(TRAINER_REF) else {
        return;
    };
    for (i, _def) in TRAINERS.iter().enumerate() {
        let tile = simgrid::proto::Tile::new(spawn.x + 6 + (i as i32) * 3, spawn.y + 2);
        let spec = simgrid::NpcSpec {
            kind,
            origin: tile,
            floor: game::SPAWN_FLOOR,
            ticks_per_tile: 8,
            max_hp: 50,
            level: 1,
            defense: 0,
            wander: None,
            roam: None,
            aggro: None,
            loot: None,
            respawn_ticks: 0,
            float_steer: false,
            move_profile: None,
        };
        let e = simgrid::spawn_npc_from_spec(commands, &spec);
        commands
            .entity(e)
            .insert((Trainer(i), simgrid::Invulnerable));
    }
}

/// Consume walk-up NPC challenges: validates the trainer exists, is free, and
/// the challenger is in range, then starts a PvE duel and busies the trainer.
/// A `claimed` set guards same-tick double-challenges: `TrainerBusy` inserts are
/// deferred `Commands`, so the `trainers` query snapshot stays stale for the
/// whole drained batch.
#[allow(clippy::too_many_arguments)]
pub fn apply_npc_challenges(
    bcast: bevy::prelude::Res<simgrid::Outbound>,
    clock: bevy::prelude::Res<simgrid::SimClock>,
    mut pending: bevy::prelude::ResMut<simgrid::PendingNpcChallenges>,
    mut duels: bevy::prelude::ResMut<ActiveDuels>,
    index: bevy::prelude::Res<simgrid::EidIndex>,
    spawned: bevy::prelude::Res<simgrid::SpawnedSlots>,
    bank: simgrid::PetBank,
    trainers: bevy::prelude::Query<(&Trainer, &simgrid::GridPos, Option<&TrainerBusy>)>,
    players: bevy::prelude::Query<(
        &simgrid::PlayerSlotTag,
        &simgrid::GridPos,
        Option<&simgrid::PetRoster>,
    )>,
    mut commands: bevy::prelude::Commands,
) {
    if pending.0.is_empty() {
        return;
    }
    let mut claimed: std::collections::HashSet<bevy::prelude::Entity> =
        std::collections::HashSet::new();
    for (slot, npc) in std::mem::take(&mut pending.0) {
        if duels.by_slot.contains_key(&slot.0) {
            continue;
        }
        let Some(&trainer_entity) = index.by_eid.get(&npc.0) else {
            continue;
        };
        if claimed.contains(&trainer_entity) {
            continue;
        }
        let Ok((trainer, trainer_pos, busy)) = trainers.get(trainer_entity) else {
            continue;
        };
        if busy.is_some() {
            continue;
        }
        let Some((_, player_pos, roster)) = players.iter().find(|(tag, _, _)| tag.0 == slot) else {
            continue;
        };
        if !within_challenge_range(player_pos.tile, trainer_pos.tile) {
            continue;
        }
        let def = &TRAINERS[trainer.0];
        let enemy = trainer_team(def);
        if enemy.is_empty() {
            continue;
        }
        let mut team = roster.map(|r| roster_team(&bank, r)).unwrap_or_default();
        if team.is_empty() {
            let Some(species) = game::NPC_DB.get(game::MECHAMUTT_REF) else {
                continue;
            };
            team = game::mechamutt_team(species);
        }
        let root = simgrid::rng::mix32(&[0xD0E1_5EED, slot.0 as u32, clock.tick]);
        let name = spawned
            .by_slot
            .get(&slot.0)
            .map(|(_, n)| n.clone())
            .unwrap_or_default();
        let duel = Duel {
            state: simgrid::BattleState::versus(root, team, enemy),
            sides: [
                DuelSide::Human { slot: slot.0, name },
                DuelSide::Npc {
                    trainer: Some(trainer_entity),
                    name: def.name.into(),
                    difficulty: def.difficulty,
                },
            ],
            committed: [None, None],
            deadline_tick: clock.tick.saturating_add(DUEL_TURN_TICKS),
        };
        claimed.insert(trainer_entity);
        commands.entity(trainer_entity).insert(TrainerBusy);
        let opening = vec![game::info_event(format!(
            "{} challenges you to a pet duel!",
            def.name
        ))];
        let id = duels.create(duel);
        stream_duel_views(&bcast, &duels.by_id[&id], &opening, clock.tick);
    }
}

/// Map a duel side index (0/1) onto the engine's `Side`.
pub fn engine_side(idx: usize) -> simgrid::Side {
    if idx == 0 {
        simgrid::Side::Player
    } else {
        simgrid::Side::Enemy
    }
}

/// Find which duel side index (0/1) a human player slot occupies, if any.
pub fn side_index_of_slot(duel: &Duel, slot: u16) -> Option<usize> {
    duel.sides
        .iter()
        .position(|s| matches!(s, DuelSide::Human { slot: s2, .. } if *s2 == slot))
}

fn ai_rng(duel: &Duel, idx: usize) -> simgrid::rng::Mulberry32 {
    simgrid::rng::stream(
        duel.state.root,
        simgrid::rng::domain::PETBATTLE,
        &[duel.state.turn, game::AI_STREAM, idx as u32],
    )
}

/// Fill commitments for every NPC side that has none. NPC replacement picks are
/// handled inside `resolve_events`, not here.
pub fn npc_commit(duel: &mut Duel) {
    for idx in 0..2 {
        if duel.committed[idx].is_some() {
            continue;
        }
        if let DuelSide::Npc { difficulty, .. } = &duel.sides[idx] {
            let difficulty = *difficulty;
            let mut rng = ai_rng(duel, idx);
            duel.committed[idx] = Some(simgrid::choose_action(
                &duel.state,
                engine_side(idx),
                difficulty,
                &mut rng,
            ));
        }
    }
}

fn resolve_events(duel: &mut Duel) -> Vec<simgrid::BattleEvent> {
    let pa = duel.committed[0]
        .take()
        .unwrap_or(simgrid::BattleAction::Run);
    let ea = duel.committed[1]
        .take()
        .unwrap_or(simgrid::BattleAction::Run);
    let mut events = duel.state.resolve_turn(pa, ea);
    for idx in 0..2 {
        let side = engine_side(idx);
        if duel.state.needs_replacement(side)
            && let DuelSide::Npc { difficulty, .. } = &duel.sides[idx]
        {
            let to = simgrid::choose_replacement(&duel.state, side, *difficulty);
            events.extend(duel.state.resolve_replacement(side, to));
        }
    }
    events
}

/// Resolve one turn if both sides have committed; resets the deadline.
pub fn try_resolve(duel: &mut Duel, now_tick: u32) -> Option<Vec<simgrid::BattleEvent>> {
    if duel.committed.iter().any(|c| c.is_none()) {
        return None;
    }
    let events = resolve_events(duel);
    duel.deadline_tick = now_tick.saturating_add(DUEL_TURN_TICKS);
    Some(events)
}

/// Deadline enforcement: auto-commit a Dumb action for every idle human (or force
/// their pending replacement to the first living reserve), then resolve.
pub fn force_deadline(duel: &mut Duel, now_tick: u32) -> Option<Vec<simgrid::BattleEvent>> {
    if now_tick < duel.deadline_tick || duel.state.outcome != simgrid::BattleOutcome::Ongoing {
        return None;
    }
    let mut replacement_events = Vec::new();
    for idx in 0..2 {
        let side = engine_side(idx);
        if duel.state.needs_replacement(side) {
            let to = duel
                .state
                .side(side)
                .team
                .iter()
                .position(|c| c.is_alive())
                .unwrap_or(0);
            replacement_events.extend(duel.state.resolve_replacement(side, to));
        }
    }
    if !replacement_events.is_empty() {
        duel.deadline_tick = now_tick.saturating_add(DUEL_TURN_TICKS);
        return Some(replacement_events);
    }
    for idx in 0..2 {
        if duel.committed[idx].is_none() && matches!(duel.sides[idx], DuelSide::Human { .. }) {
            let mut rng = ai_rng(duel, idx);
            duel.committed[idx] = Some(simgrid::choose_action(
                &duel.state,
                engine_side(idx),
                simgrid::AiDifficulty::Dumb,
                &mut rng,
            ));
        }
    }
    npc_commit(duel);
    try_resolve(duel, now_tick)
}

/// Force-resolve any duel past its turn deadline and stream the result; removes
/// duels that finish as a consequence.
pub fn tick_duels(
    bcast: bevy::prelude::Res<simgrid::Outbound>,
    clock: bevy::prelude::Res<simgrid::SimClock>,
    mut duels: bevy::prelude::ResMut<ActiveDuels>,
    mut commands: bevy::prelude::Commands,
) {
    let ids: Vec<u32> = duels.by_id.keys().copied().collect();
    for id in ids {
        let Some(duel) = duels.by_id.get_mut(&id) else {
            continue;
        };
        let turn_before = duel.state.turn;
        let Some(raw) = force_deadline(duel, clock.tick) else {
            continue;
        };
        let mut events: Vec<_> = raw
            .iter()
            .filter(|e| !matches!(e, simgrid::BattleEvent::Outcome(_)))
            .map(game::wire_event)
            .collect();
        events.push(game::info_event(if duel.state.turn == turn_before {
            "Time's up — a replacement was sent out.".into()
        } else {
            "Time's up — a move was chosen for you.".into()
        }));
        let resolved = duel.state.outcome != simgrid::BattleOutcome::Ongoing;
        stream_duel_views(&bcast, duel, &events, clock.tick);
        if resolved {
            finish_duel(&mut duels, id, &mut commands);
        }
    }
}

/// Indices of human sides whose slot is no longer connected.
pub fn stale_human_sides(duel: &Duel, connected: impl Fn(u16) -> bool) -> Vec<usize> {
    duel.sides
        .iter()
        .enumerate()
        .filter_map(|(i, s)| match s {
            DuelSide::Human { slot, .. } if !connected(*slot) => Some(i),
            _ => None,
        })
        .collect()
}

/// Forfeit any duel with a disconnected human side, streaming the win to a
/// surviving human opponent (PvP) and freeing the trainer (PvE has none).
pub fn cleanup_stale_duels(
    bcast: bevy::prelude::Res<simgrid::Outbound>,
    spawned: bevy::prelude::Res<simgrid::SpawnedSlots>,
    clock: bevy::prelude::Res<simgrid::SimClock>,
    mut duels: bevy::prelude::ResMut<ActiveDuels>,
    mut commands: bevy::prelude::Commands,
) {
    let ids: Vec<u32> = duels.by_id.keys().copied().collect();
    for id in ids {
        let Some(duel) = duels.by_id.get_mut(&id) else {
            continue;
        };
        let stale = stale_human_sides(duel, |slot| spawned.by_slot.contains_key(&slot));
        if stale.is_empty() {
            continue;
        }
        forfeit(duel, stale[0]);
        let events = vec![game::info_event("Your opponent left — you win!".into())];
        let survivors: Vec<usize> = duel
            .sides
            .iter()
            .enumerate()
            .filter_map(|(i, s)| match s {
                DuelSide::Human { slot, .. } if spawned.by_slot.contains_key(slot) => Some(i),
                _ => None,
            })
            .collect();
        for idx in survivors {
            if let DuelSide::Human { slot, .. } = duel.sides[idx] {
                let view = viewer_view(duel, idx, &events, clock.tick);
                game::send_battle_view(&bcast, simgrid::proto::PlayerSlot(slot), &view);
            }
        }
        finish_duel(&mut duels, id, &mut commands);
    }
}

/// The named side gives up: the other side wins immediately.
pub fn forfeit(duel: &mut Duel, loser_idx: usize) {
    duel.state.outcome = if loser_idx == 0 {
        simgrid::BattleOutcome::PlayerLost
    } else {
        simgrid::BattleOutcome::PlayerWon
    };
}

fn flip_outcome(name: &str) -> String {
    match name {
        "PlayerWon" => "PlayerLost".into(),
        "PlayerLost" => "PlayerWon".into(),
        other => other.into(),
    }
}

/// Display name for a duel side: a human's stored username, or an NPC's name.
fn side_display_name(side: &DuelSide) -> &str {
    match side {
        DuelSide::Human { name, .. } => name,
        DuelSide::Npc { name, .. } => name,
    }
}

/// The battle snapshot as one side sees it: viewer 0 is the engine's player side
/// verbatim; viewer 1 sees teams, active indices, moves, events, and outcome
/// mirrored so their own side always renders as `player`. `phase`/`deadline_ms`/
/// `opponent` are always viewer-relative.
pub fn viewer_view(
    duel: &Duel,
    viewer_idx: usize,
    events: &[simgrid::proto::PetBattleWireEvent],
    now_tick: u32,
) -> simgrid::proto::PetBattleState {
    let ongoing = duel.state.outcome == simgrid::BattleOutcome::Ongoing;
    let deadline_ms = if ongoing {
        duel.deadline_tick
            .saturating_sub(now_tick)
            .saturating_mul(50)
    } else {
        0
    };
    let phase = if !ongoing {
        "over"
    } else if duel.state.needs_replacement(engine_side(viewer_idx)) {
        "replace"
    } else {
        "action"
    };
    let opponent = side_display_name(&duel.sides[1 - viewer_idx]).to_string();
    let base = game::battle_view(&duel.state, events.to_vec(), deadline_ms, &opponent);
    let mut view = if viewer_idx == 0 {
        base
    } else {
        simgrid::proto::PetBattleState {
            player: base.enemy,
            enemy: base.player,
            p_active: base.e_active,
            e_active: base.p_active,
            moves: if ongoing {
                game::move_options(duel.state.enemy.active())
            } else {
                vec![]
            },
            events: events
                .iter()
                .map(|e| {
                    let mut e = e.clone();
                    e.side ^= 1;
                    e
                })
                .collect(),
            outcome: flip_outcome(&base.outcome),
            ..base
        }
    };
    view.phase = phase.to_string();
    view
}

pub const DUEL_CHALLENGE_TICKS: u32 = 20 * simgrid::SIM_TICK_HZ;

pub struct DuelChallenge {
    pub challenger: u16,
    pub target: u16,
    pub expires_tick: u32,
}

#[derive(bevy::prelude::Resource, Default)]
pub struct PendingDuels(pub Vec<DuelChallenge>);

/// Index of the pending challenge involving `slot` on either side, if any.
pub fn challenge_involving(pending: &PendingDuels, slot: u16) -> Option<usize> {
    pending
        .0
        .iter()
        .position(|c| c.challenger == slot || c.target == slot)
}

/// Encode and send a `DuelPrompt` ephemeral notice, mirroring `send_battle_view`'s shape.
pub fn send_duel_prompt(
    bcast: &simgrid::Outbound,
    to_slot: u16,
    status: u8,
    other_slot: u16,
    other_name: &str,
    deadline_ms: u32,
) {
    let prompt = simgrid::DuelPrompt {
        status,
        other_slot,
        other_name: other_name.to_string(),
        deadline_ms,
    };
    let payload = simgrid::proto::encode_inner(&prompt).unwrap_or_default();
    let _ = bcast.tx.send(simgrid::proto::ServerEvent::Ephemeral {
        kind: simgrid::EPHEMERAL_DUEL_PROMPT,
        to: simgrid::proto::PlayerSlot(to_slot),
        payload,
    });
}

/// Consume `PlayerSlot` duel-challenge inputs: validates neither slot is already
/// duelling or pending, both are spawned, and they're within challenge range,
/// then queues a `PendingDuels` entry and prompts the target.
pub fn apply_duel_challenges(
    bcast: bevy::prelude::Res<simgrid::Outbound>,
    clock: bevy::prelude::Res<simgrid::SimClock>,
    mut ops: bevy::prelude::ResMut<simgrid::PendingDuelOps>,
    mut pending: bevy::prelude::ResMut<PendingDuels>,
    duels: bevy::prelude::Res<ActiveDuels>,
    spawned: bevy::prelude::Res<simgrid::SpawnedSlots>,
    players: bevy::prelude::Query<(&simgrid::PlayerSlotTag, &simgrid::GridPos)>,
) {
    if ops.challenges.is_empty() {
        return;
    }
    for (challenger, target) in std::mem::take(&mut ops.challenges) {
        let challenger = challenger.0;
        let target = target.0;
        if challenger == target {
            continue;
        }
        if duels.by_slot.contains_key(&challenger) || duels.by_slot.contains_key(&target) {
            continue;
        }
        if challenge_involving(&pending, challenger).is_some()
            || challenge_involving(&pending, target).is_some()
        {
            continue;
        }
        if !spawned.by_slot.contains_key(&challenger) || !spawned.by_slot.contains_key(&target) {
            continue;
        }
        let Some((_, challenger_pos)) = players.iter().find(|(tag, _)| tag.0.0 == challenger)
        else {
            continue;
        };
        let Some((_, target_pos)) = players.iter().find(|(tag, _)| tag.0.0 == target) else {
            continue;
        };
        if !within_challenge_range(challenger_pos.tile, target_pos.tile) {
            continue;
        }
        pending.0.push(DuelChallenge {
            challenger,
            target,
            expires_tick: clock.tick.saturating_add(DUEL_CHALLENGE_TICKS),
        });
        let challenger_name = spawned
            .by_slot
            .get(&challenger)
            .map(|(_, n)| n.clone())
            .unwrap_or_default();
        send_duel_prompt(
            &bcast,
            target,
            simgrid::DUEL_PROMPT_OFFER,
            challenger,
            &challenger_name,
            DUEL_CHALLENGE_TICKS.saturating_mul(50),
        );
    }
}

/// Consume the target's accept/decline response: on decline, notify the
/// challenger and drop the pending entry; on accept, re-validate both slots
/// are still free and spawned (range is not re-checked — challenge-time only)
/// and start a PvP duel.
#[allow(clippy::too_many_arguments)]
pub fn apply_duel_responses(
    bcast: bevy::prelude::Res<simgrid::Outbound>,
    clock: bevy::prelude::Res<simgrid::SimClock>,
    mut ops: bevy::prelude::ResMut<simgrid::PendingDuelOps>,
    mut pending: bevy::prelude::ResMut<PendingDuels>,
    mut duels: bevy::prelude::ResMut<ActiveDuels>,
    spawned: bevy::prelude::Res<simgrid::SpawnedSlots>,
    bank: simgrid::PetBank,
    rosters: bevy::prelude::Query<(&simgrid::PlayerSlotTag, Option<&simgrid::PetRoster>)>,
) {
    if ops.responses.is_empty() {
        return;
    }
    for (slot, accept) in std::mem::take(&mut ops.responses) {
        let slot = slot.0;
        let Some(idx) = pending.0.iter().position(|c| c.target == slot) else {
            continue;
        };
        let challenge = pending.0.remove(idx);
        let challenger = challenge.challenger;
        let target_name = spawned
            .by_slot
            .get(&slot)
            .map(|(_, n)| n.clone())
            .unwrap_or_default();
        if !accept {
            send_duel_prompt(
                &bcast,
                challenger,
                simgrid::DUEL_PROMPT_DECLINED,
                slot,
                &target_name,
                0,
            );
            continue;
        }
        if duels.by_slot.contains_key(&challenger) || duels.by_slot.contains_key(&slot) {
            continue;
        }
        if !spawned.by_slot.contains_key(&challenger) || !spawned.by_slot.contains_key(&slot) {
            continue;
        }
        let challenger_roster = rosters
            .iter()
            .find(|(tag, _)| tag.0.0 == challenger)
            .and_then(|(_, roster)| roster);
        let target_roster = rosters
            .iter()
            .find(|(tag, _)| tag.0.0 == slot)
            .and_then(|(_, roster)| roster);
        let Some(species) = game::NPC_DB.get(game::MECHAMUTT_REF) else {
            continue;
        };
        let mut challenger_team = challenger_roster
            .map(|r| roster_team(&bank, r))
            .unwrap_or_default();
        if challenger_team.is_empty() {
            challenger_team = game::mechamutt_team(species);
        }
        let mut target_team = target_roster
            .map(|r| roster_team(&bank, r))
            .unwrap_or_default();
        if target_team.is_empty() {
            target_team = game::mechamutt_team(species);
        }
        let challenger_name = spawned
            .by_slot
            .get(&challenger)
            .map(|(_, n)| n.clone())
            .unwrap_or_default();
        let root = simgrid::rng::mix32(&[0xD0E7_D0E7, challenger as u32, slot as u32, clock.tick]);
        send_duel_prompt(
            &bcast,
            challenger,
            simgrid::DUEL_PROMPT_ACCEPTED,
            slot,
            &target_name,
            0,
        );
        let duel = Duel {
            state: simgrid::BattleState::versus(root, challenger_team, target_team),
            sides: [
                DuelSide::Human {
                    slot: challenger,
                    name: challenger_name,
                },
                DuelSide::Human {
                    slot,
                    name: target_name.clone(),
                },
            ],
            committed: [None, None],
            deadline_tick: clock.tick.saturating_add(DUEL_TURN_TICKS),
        };
        let opening = vec![game::info_event(format!(
            "{target_name} accepts — the duel begins!"
        ))];
        let id = duels.create(duel);
        stream_duel_views(&bcast, &duels.by_id[&id], &opening, clock.tick);
    }
}

/// Drop pending challenges whose deadline passed or whose participant left,
/// notifying both sides so their overlays close.
pub fn expire_duel_challenges(
    mut pending: bevy::prelude::ResMut<PendingDuels>,
    clock: bevy::prelude::Res<simgrid::SimClock>,
    spawned: bevy::prelude::Res<simgrid::SpawnedSlots>,
    bcast: bevy::prelude::Res<simgrid::Outbound>,
) {
    if pending.0.is_empty() {
        return;
    }
    let now = clock.tick;
    let mut dropped: Vec<(u16, u16)> = Vec::new();
    pending.0.retain(|c| {
        let present =
            spawned.by_slot.contains_key(&c.challenger) && spawned.by_slot.contains_key(&c.target);
        if present && now < c.expires_tick {
            true
        } else {
            dropped.push((c.challenger, c.target));
            false
        }
    });
    for (challenger, target) in dropped {
        send_duel_prompt(
            &bcast,
            challenger,
            simgrid::DUEL_PROMPT_EXPIRED,
            target,
            "",
            0,
        );
        send_duel_prompt(
            &bcast,
            target,
            simgrid::DUEL_PROMPT_EXPIRED,
            challenger,
            "",
            0,
        );
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn team() -> Vec<simgrid::Combatant> {
        let species = crate::game::NPC_DB
            .get(crate::game::MECHAMUTT_REF)
            .expect("mechamutt");
        crate::game::mechamutt_team(species)
    }

    fn pve_duel() -> Duel {
        Duel {
            state: simgrid::BattleState::versus(7, team(), team()),
            sides: [
                DuelSide::Human {
                    slot: 3,
                    name: "Bot".into(),
                },
                DuelSide::Npc {
                    trainer: None,
                    name: "Bot".into(),
                    difficulty: simgrid::AiDifficulty::Greedy,
                },
            ],
            committed: [None, None],
            deadline_tick: DUEL_TURN_TICKS,
        }
    }

    fn pvp_duel() -> Duel {
        Duel {
            state: simgrid::BattleState::versus(7, team(), team()),
            sides: [
                DuelSide::Human {
                    slot: 3,
                    name: "ann".into(),
                },
                DuelSide::Human {
                    slot: 4,
                    name: "bob".into(),
                },
            ],
            committed: [None, None],
            deadline_tick: DUEL_TURN_TICKS,
        }
    }

    #[test]
    fn create_registers_and_remove_clears_by_slot() {
        let mut duels = ActiveDuels::default();
        let id = duels.create(pve_duel());
        assert_eq!(duels.by_slot.get(&3), Some(&id));
        duels.remove(id);
        assert!(duels.by_slot.is_empty());
        assert!(duels.by_id.is_empty());
    }

    #[test]
    fn npc_commits_and_turn_resolves_when_human_committed() {
        let mut d = pve_duel();
        d.committed[0] = Some(simgrid::BattleAction::Move { slot: 0 });
        npc_commit(&mut d);
        assert!(d.committed[1].is_some());
        let events = try_resolve(&mut d, 100).expect("resolves");
        assert!(!events.is_empty());
        assert_eq!(d.committed, [None, None]);
        assert_eq!(d.deadline_tick, 100 + DUEL_TURN_TICKS);
        assert_eq!(d.state.turn, 1);
    }

    #[test]
    fn no_resolve_until_both_committed() {
        let mut d = pve_duel();
        npc_commit(&mut d);
        assert!(try_resolve(&mut d, 100).is_none());
        assert_eq!(d.state.turn, 0);
    }

    #[test]
    fn deadline_auto_commits_idle_human_and_resolves() {
        let mut d = pve_duel();
        d.deadline_tick = 50;
        assert!(force_deadline(&mut d, 49).is_none());
        let events = force_deadline(&mut d, 50).expect("timeout resolves");
        assert!(!events.is_empty());
        assert_eq!(d.state.turn, 1);
    }

    #[test]
    fn deadline_resolves_pending_human_replacement() {
        let mut d = pve_duel();
        d.state.player.team[d.state.player.active].hp = 0;
        assert!(d.state.needs_replacement(simgrid::Side::Player));
        d.deadline_tick = 50;
        let events = force_deadline(&mut d, 50).expect("replacement forced");
        assert!(
            events
                .iter()
                .any(|e| matches!(e, simgrid::BattleEvent::SwapIn { .. }))
        );
        assert!(!d.state.needs_replacement(simgrid::Side::Player));
    }

    #[test]
    fn finished_duel_ignores_deadline() {
        let mut d = pve_duel();
        d.state.outcome = simgrid::BattleOutcome::PlayerWon;
        d.deadline_tick = 0;
        assert!(force_deadline(&mut d, 100).is_none());
    }

    #[test]
    fn forfeit_awards_other_side() {
        let mut d = pve_duel();
        forfeit(&mut d, 0);
        assert_eq!(d.state.outcome, simgrid::BattleOutcome::PlayerLost);
        let mut d = pve_duel();
        forfeit(&mut d, 1);
        assert_eq!(d.state.outcome, simgrid::BattleOutcome::PlayerWon);
    }

    #[test]
    fn viewer_one_sees_own_team_as_player() {
        let mut d = pve_duel();
        d.state.enemy.team[0].nickname = "EnemyAce".into();
        let v0 = viewer_view(&d, 0, &[], 0);
        let v1 = viewer_view(&d, 1, &[], 0);
        assert_eq!(v0.enemy[0].nickname, "EnemyAce");
        assert_eq!(v1.player[0].nickname, "EnemyAce");
        assert_eq!(
            v1.moves.first().map(|m| m.name.clone()),
            crate::game::move_options(d.state.enemy.active())
                .first()
                .map(|m| m.name.clone())
        );
    }

    #[test]
    fn roster_team_copies_are_full_hp() {
        let species = crate::game::NPC_DB
            .get(crate::game::MECHAMUTT_REF)
            .expect("mechamutt");
        let mut snap = simgrid::mint_pet_from_species(species, 50).expect("mint");
        let max_hp = snap.vitals.max_hp;
        snap.vitals.hp = 1;
        let combatant = combatant_from_snapshot(&snap).expect("combatant");
        assert_eq!(combatant.hp, max_hp);
        assert!(combatant.max_hp > 1);
    }

    #[test]
    fn stale_human_side_forfeits_duel() {
        let mut d = pve_duel();
        let connected: std::collections::HashSet<u16> = std::collections::HashSet::new();
        let stale = stale_human_sides(&d, |slot| connected.contains(&slot));
        assert_eq!(stale, vec![0]);
        forfeit(&mut d, stale[0]);
        assert_eq!(d.state.outcome, simgrid::BattleOutcome::PlayerLost);
    }

    #[test]
    fn viewer_flip_inverts_event_sides() {
        let d = pve_duel();
        let ev = simgrid::proto::PetBattleWireEvent {
            kind: simgrid::proto::PB_DAMAGE,
            side: 1,
            value: 5,
            hp: 10,
            flag: 0,
            text: "x".into(),
        };
        let v1 = viewer_view(&d, 1, &[ev], 0);
        assert_eq!(v1.events[0].side, 0);
    }

    #[test]
    fn viewer_view_carries_phase_deadline_opponent() {
        let mut d = pve_duel();
        d.deadline_tick = 700;
        let v = viewer_view(&d, 0, &[], 100);
        assert_eq!(v.phase, "action");
        assert_eq!(v.deadline_ms, 600 * 50);
        assert_eq!(v.opponent, "Bot");
        d.state.player.team[d.state.player.active].hp = 0;
        let v = viewer_view(&d, 0, &[], 100);
        assert_eq!(v.phase, "replace");
        d.state.outcome = simgrid::BattleOutcome::PlayerWon;
        let v = viewer_view(&d, 0, &[], 100);
        assert_eq!(v.phase, "over");
        assert_eq!(v.deadline_ms, 0);
    }

    #[test]
    fn viewer_one_phase_and_opponent_are_side_relative() {
        let mut d = pvp_duel();
        d.state.enemy.team[d.state.enemy.active].hp = 0;
        let v0 = viewer_view(&d, 0, &[], 0);
        let v1 = viewer_view(&d, 1, &[], 0);
        assert_eq!(v0.phase, "action");
        assert_eq!(v1.phase, "replace");
        assert_eq!(v0.opponent, "bob");
        assert_eq!(v1.opponent, "ann");
    }

    #[test]
    fn trainer_team_minted_at_def_levels() {
        let def = &TRAINERS[0];
        let team = trainer_team(def);
        assert_eq!(team.len(), def.team.len());
        assert_eq!(team[0].level, def.team[0].1);
        assert!(team.iter().all(|c| c.hp == c.max_hp && c.hp > 0));
    }

    #[test]
    fn challenge_range_check() {
        use simgrid::proto::Tile;
        assert!(within_challenge_range(Tile::new(5, 5), Tile::new(7, 5)));
        assert!(!within_challenge_range(Tile::new(5, 5), Tile::new(8, 5)));
    }

    #[test]
    fn same_tick_double_challenge_binds_one_duel() {
        let mut app = bevy::app::App::new();
        let (tx, _rx) = tokio::sync::mpsc::unbounded_channel();
        app.insert_resource(simgrid::Outbound { tx });
        app.insert_resource(simgrid::SimClock::default());
        app.insert_resource(simgrid::PendingNpcChallenges::default());
        app.insert_resource(simgrid::PendingPets::default());
        app.insert_resource(ActiveDuels::default());
        app.insert_resource(simgrid::SpawnedSlots::default());
        let trainer = app
            .world_mut()
            .spawn((
                Trainer(0),
                simgrid::GridPos::at(simgrid::proto::Tile::new(5, 5)),
            ))
            .id();
        app.world_mut().spawn((
            simgrid::PlayerSlotTag(simgrid::proto::PlayerSlot(1)),
            simgrid::GridPos::at(simgrid::proto::Tile::new(6, 5)),
        ));
        app.world_mut().spawn((
            simgrid::PlayerSlotTag(simgrid::proto::PlayerSlot(2)),
            simgrid::GridPos::at(simgrid::proto::Tile::new(4, 5)),
        ));
        let mut index = simgrid::EidIndex::default();
        index.by_eid.insert(7, trainer);
        app.insert_resource(index);
        app.world_mut()
            .resource_mut::<simgrid::PendingNpcChallenges>()
            .0
            .extend([
                (simgrid::proto::PlayerSlot(1), simgrid::proto::EntityId(7)),
                (simgrid::proto::PlayerSlot(2), simgrid::proto::EntityId(7)),
            ]);
        app.add_systems(bevy::prelude::Update, apply_npc_challenges);
        app.update();
        let duels = app.world().resource::<ActiveDuels>();
        assert_eq!(duels.by_id.len(), 1);
        assert!(duels.by_slot.contains_key(&1));
        assert!(!duels.by_slot.contains_key(&2));
    }

    #[test]
    fn challenge_involving_finds_either_side() {
        let mut p = PendingDuels::default();
        p.0.push(DuelChallenge {
            challenger: 1,
            target: 2,
            expires_tick: 100,
        });
        assert_eq!(challenge_involving(&p, 1), Some(0));
        assert_eq!(challenge_involving(&p, 2), Some(0));
        assert_eq!(challenge_involving(&p, 3), None);
    }
}
