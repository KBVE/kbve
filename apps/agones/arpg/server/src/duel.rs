//! Unified duel registry: one code path for PvE trainer duels, the debug battle,
//! and (PR3) PvP. Pure commit/resolve/timeout/forfeit functions wrapped by thin
//! bevy systems; the engine `BattleState` stays the only battle truth.

use std::collections::HashMap;

use bevy::prelude::Entity;

use crate::game;

#[allow(dead_code)]
pub enum DuelSide {
    Human {
        slot: u16,
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
#[allow(dead_code)]
pub struct ActiveDuels {
    pub by_id: HashMap<u32, Duel>,
    pub by_slot: HashMap<u16, u32>,
    next_id: u32,
}

pub const DUEL_TURN_TICKS: u32 = 30 * simgrid::SIM_TICK_HZ;

#[allow(dead_code)]
impl ActiveDuels {
    /// Register a new duel, indexing every human side by slot for turn routing.
    pub fn create(&mut self, duel: Duel) -> u32 {
        self.next_id = self.next_id.wrapping_add(1);
        let id = self.next_id;
        for side in &duel.sides {
            if let DuelSide::Human { slot } = side {
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
            if let DuelSide::Human { slot } = side {
                self.by_slot.remove(slot);
            }
        }
        Some(duel)
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
#[allow(dead_code)]
pub fn side_index_of_slot(duel: &Duel, slot: u16) -> Option<usize> {
    duel.sides
        .iter()
        .position(|s| matches!(s, DuelSide::Human { slot: s2 } if *s2 == slot))
}

#[allow(dead_code)]
fn ai_rng(duel: &Duel, idx: usize) -> simgrid::rng::Mulberry32 {
    simgrid::rng::stream(
        duel.state.root,
        simgrid::rng::domain::PETBATTLE,
        &[duel.state.turn, game::AI_STREAM, idx as u32],
    )
}

/// Fill commitments for every NPC side that has none. NPC replacement picks are
/// handled inside `resolve_events`, not here.
#[allow(dead_code)]
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

#[allow(dead_code)]
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
#[allow(dead_code)]
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
#[allow(dead_code)]
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

/// The named side gives up: the other side wins immediately.
#[allow(dead_code)]
pub fn forfeit(duel: &mut Duel, loser_idx: usize) {
    duel.state.outcome = if loser_idx == 0 {
        simgrid::BattleOutcome::PlayerLost
    } else {
        simgrid::BattleOutcome::PlayerWon
    };
}

#[allow(dead_code)]
fn flip_outcome(name: &str) -> String {
    match name {
        "PlayerWon" => "PlayerLost".into(),
        "PlayerLost" => "PlayerWon".into(),
        other => other.into(),
    }
}

/// The battle snapshot as one side sees it: viewer 0 is the engine's player side
/// verbatim; viewer 1 sees teams, active indices, moves, events, and outcome
/// mirrored so their own side always renders as `player`.
#[allow(dead_code)]
pub fn viewer_view(
    duel: &Duel,
    viewer_idx: usize,
    events: &[simgrid::proto::PetBattleWireEvent],
) -> simgrid::proto::PetBattleState {
    let base = game::battle_view(&duel.state, events.to_vec());
    if viewer_idx == 0 {
        return base;
    }
    let ongoing = duel.state.outcome == simgrid::BattleOutcome::Ongoing;
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
        awaiting: base.awaiting,
        can_run: base.can_run,
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
                DuelSide::Human { slot: 3 },
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
        let v0 = viewer_view(&d, 0, &[]);
        let v1 = viewer_view(&d, 1, &[]);
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
        let v1 = viewer_view(&d, 1, &[ev]);
        assert_eq!(v1.events[0].side, 0);
    }
}
