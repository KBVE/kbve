# ARPG Pet Duels PR2 — Unified Duel Registry + NPC Trainers Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the slot-keyed debug pet battle with a unified duel registry (turn deadlines, disconnect forfeit, real roster teams) and add walk-up NPC trainer duels — spec sections 3-4 of `docs/superpowers/specs/2026-07-05-arpg-pet-duels-design.md`.

**Architecture:** New `duel.rs` module in the arpg server holds `Duel`/`DuelSide`/`ActiveDuels` plus pure commit/resolve/timeout/forfeit functions; thin bevy systems drive it. One new wire input (`ChallengeNpc`) appended to the postcard `Input` enum with its TS mirror. Trainers are stationary non-aggro NPCs with a marker component; interacting within range creates a duel against a minted trainer team driven by `battle_ai`.

**Tech Stack:** Rust (bevy ECS, postcard wire), simgrid battle engine + battle_ai (PR1), TypeScript (laser wire mirror, Phaser client).

## Global Constraints

- Worktree: `/Users/alappatel/Documents/GitHub/kbve-worktrees/arpg-pet-duels-registry`, branch `arpg-pet-duels-registry` (stacked on `arpg-pet-duels-spec`). Never touch the main repo checkout. Worktree creation needs `GIT_LFS_SKIP_SMUDGE=1` (already created).
- PR base: `arpg-pet-duels-spec` (stacked on PR #13885); retarget to `dev` after PR1 merges.
- Commands via nx from worktree root: `pnpm nx test simgrid`, `pnpm nx test arpg-server`, `pnpm nx build arpg-server`, `pnpm nx lint simgrid`, `pnpm nx run arpg-web:typecheck`. Never raw cargo for project tasks (raw `cargo test -p` acceptable only to iterate on a single test).
- NO inline `//` comments. Terse `///` doc comments only where the surrounding file already uses them. NO Claude co-author trailer on commits.
- Randomness ONLY via `simgrid::rng::stream` / `simgrid::rng::mix32` — no `rand`, no wall clock in sim code.
- **Postcard wire is positional**: new `Input` variants MUST be appended after `PetTurn` (index 32 today → new variant is index 33). The TS mirror `writeInput` in `packages/npm/laser/src/lib/net/postcard-wire.ts` hardcodes `w.variant(N)` — indices must match exactly. `PetBattleState` fields are NOT modified in this PR.
- Deviation from spec §3, approved: trainer defs live in a Rust const table in `duel.rs` (not the MDX npcdb pipeline) until trainer count justifies a data-pipeline schema. Spec's `committed: [Option<BattleAction>; 2]` model is implemented; PvP inputs (`DuelChallenge`/`DuelRespond`) are PR3.

---

### Task 1: `ChallengeNpc` input — proto + sim routing

**Files:**
- Modify: `packages/rust/simgrid/src/proto.rs` (append `Input` variant after `PetTurn`, ~line 279)
- Modify: `packages/rust/simgrid/src/sim.rs` (new `PendingNpcChallenges` resource near `PendingPetTurns` ~line 182; `DeployInputs` SystemParam ~line 194; routing match arm ~line 2171; pass-through arm ~line 2387; `insert_resource` in `build_app` ~line 1465)
- Modify: `packages/rust/simgrid/src/lib.rs` (re-export `PendingNpcChallenges` alongside `PendingPetBattles`/`PendingPetTurns` — find their existing re-export and extend it)

**Interfaces:**
- Produces: `Input::ChallengeNpc { npc: EntityId }` (postcard variant index 33); `pub struct PendingNpcChallenges(pub Vec<(proto::PlayerSlot, proto::EntityId)>)` resource, drained by Task 6's system.

- [ ] **Step 1: Write the failing test** (proto.rs tests module, next to the existing wire-lock tests ~line 1071)

```rust
#[test]
fn challenge_npc_input_roundtrips() {
    let input = Input::ChallengeNpc { npc: EntityId(42) };
    let bytes = encode_inner(&input).expect("encode");
    assert_eq!(bytes[0], 33);
    let decoded: Input = decode_inner(&bytes).expect("decode");
    assert!(matches!(decoded, Input::ChallengeNpc { npc: EntityId(42) }));
}
```

Adapt `encode_inner`/`decode_inner` names to whatever the existing proto tests use for inner encoding (check the wire-lock tests at the bottom of proto.rs and copy their helper usage). The `bytes[0] == 33` assertion locks the variant index — that is the point of the test.

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm nx test simgrid` (or `cargo test -p simgrid challenge_npc` from worktree root to iterate)
Expected: FAIL — `ChallengeNpc` not found.

- [ ] **Step 3: Implement**

proto.rs — append INSIDE the `Input` enum, directly after the `PetTurn` variant (nothing after it):

```rust
    /// Challenge a world trainer NPC to a pet duel. The server validates range and
    /// that the trainer is not already dueling. Appended last so serde variant
    /// indices of the existing inputs are unchanged.
    ChallengeNpc {
        npc: EntityId,
    },
```

sim.rs — next to `PendingPetTurns` (~line 182):

```rust
#[derive(Resource, Default)]
pub struct PendingNpcChallenges(pub Vec<(proto::PlayerSlot, proto::EntityId)>);
```

sim.rs — add to the `DeployInputs`-style SystemParam that holds `pet_battles`/`pet_turns` (~line 194):

```rust
    npc_challenges: ResMut<'w, PendingNpcChallenges>,
```

sim.rs — routing match (~line 2171), after the `PetTurn` arm:

```rust
                Input::ChallengeNpc { npc } => deploy.npc_challenges.0.push((slot, npc)),
```

sim.rs — the second consumer match that lists `Input::SimPetBattle | Input::PetTurn { .. } => {}` (~line 2387): add `| Input::ChallengeNpc { .. }` to that arm.

sim.rs — `build_app` (~line 1465): `.insert_resource(PendingNpcChallenges::default())`.

lib.rs — extend the re-export list that carries `PendingPetBattles, PendingPetTurns` with `PendingNpcChallenges`.

- [ ] **Step 4: Run tests**

Run: `pnpm nx test simgrid && pnpm nx lint simgrid`
Expected: all pass (194+1 unit, 5 integration, clippy clean).

- [ ] **Step 5: Commit**

```bash
git add packages/rust/simgrid/src/proto.rs packages/rust/simgrid/src/sim.rs packages/rust/simgrid/src/lib.rs
git commit -m "feat(simgrid): ChallengeNpc input routed to pending npc challenges"
```

---

### Task 2: `duel.rs` — registry types + pure duel core

**Files:**
- Create: `apps/agones/arpg/server/src/duel.rs`
- Modify: `apps/agones/arpg/server/src/main.rs` (add `mod duel;` after `mod db;`)
- Modify: `apps/agones/arpg/server/src/game.rs` (make reused helpers `pub(crate)`: `info_event` ~547, `wire_event` ~559, `battlers` ~648, `move_options` ~791, `battle_view` ~815, `send_battle_view` ~837, `outcome_name` ~772, `player_action` ~851, `mechamutt_team` ~446, and the `NPC_DB` static ~437, `MECHAMUTT_REF`/`PET_TEAM_SIZE`/`PET_TEAM_LEVEL`/`AI_STREAM` consts ~439-443)

**Interfaces:**
- Consumes: `simgrid::{BattleState, BattleAction, BattleOutcome, Side, AiDifficulty, choose_action, choose_replacement}`, `simgrid::rng::{stream, domain::PETBATTLE}`, `crate::game` helpers listed above.
- Produces (Tasks 3-6 rely on these exact signatures):

```rust
pub enum DuelSide {
    Human { slot: u16 },
    Npc { trainer: Option<bevy::prelude::Entity>, name: String, difficulty: simgrid::AiDifficulty },
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
impl ActiveDuels {
    pub fn create(&mut self, duel: Duel) -> u32;      // registers by_slot for every Human side
    pub fn remove(&mut self, id: u32) -> Option<Duel>; // clears by_slot entries
}
pub const DUEL_TURN_TICKS: u32 = 30 * simgrid::SIM_TICK_HZ;
pub fn engine_side(idx: usize) -> simgrid::Side;                  // 0 => Player, 1 => Enemy
pub fn side_index_of_slot(duel: &Duel, slot: u16) -> Option<usize>;
pub fn npc_commit(duel: &mut Duel);
pub fn try_resolve(duel: &mut Duel, now_tick: u32) -> Option<Vec<simgrid::BattleEvent>>;
pub fn force_deadline(duel: &mut Duel, now_tick: u32) -> Option<Vec<simgrid::BattleEvent>>;
pub fn forfeit(duel: &mut Duel, loser_idx: usize);
pub fn viewer_view(duel: &Duel, viewer_idx: usize, events: &[simgrid::proto::PetBattleWireEvent]) -> simgrid::proto::PetBattleState;
```

If `simgrid::SIM_TICK_HZ` is not currently `pub`/re-exported, make it so in simgrid (sim.rs:29 `pub const SIM_TICK_HZ: u32 = 20;` + lib.rs re-export) rather than duplicating the constant.

- [ ] **Step 1: Write the failing tests** (bottom of duel.rs, `#[cfg(test)] mod tests`)

```rust
#[cfg(test)]
mod tests {
    use super::*;

    fn team() -> Vec<simgrid::Combatant> {
        let species = crate::game::NPC_DB.get(crate::game::MECHAMUTT_REF).expect("mechamutt");
        crate::game::mechamutt_team(species)
    }

    fn pve_duel() -> Duel {
        Duel {
            state: simgrid::BattleState::versus(7, team(), team()),
            sides: [
                DuelSide::Human { slot: 3 },
                DuelSide::Npc { trainer: None, name: "Bot".into(), difficulty: simgrid::AiDifficulty::Greedy },
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
        assert!(events.iter().any(|e| matches!(e, simgrid::BattleEvent::SwapIn { .. })));
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
        assert_eq!(v1.moves.first().map(|m| m.name.clone()), crate::game::move_options(d.state.enemy.active()).first().map(|m| m.name.clone()));
    }

    #[test]
    fn viewer_flip_inverts_event_sides() {
        let d = pve_duel();
        let ev = simgrid::proto::PetBattleWireEvent { kind: simgrid::proto::PB_DAMAGE, side: 1, value: 5, hp: 10, flag: 0, text: "x".into() };
        let v1 = viewer_view(&d, 1, &[ev]);
        assert_eq!(v1.events[0].side, 0);
    }
}
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm nx test arpg-server`
Expected: FAIL — module/functions not found.

- [ ] **Step 3: Implement duel.rs**

```rust
//! Unified duel registry: one code path for PvE trainer duels, the debug battle,
//! and (PR3) PvP. Pure commit/resolve/timeout/forfeit functions wrapped by thin
//! bevy systems; the engine `BattleState` stays the only battle truth.

use std::collections::HashMap;

use bevy::prelude::Entity;

use crate::game;

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
pub struct ActiveDuels {
    pub by_id: HashMap<u32, Duel>,
    pub by_slot: HashMap<u16, u32>,
    next_id: u32,
}

pub const DUEL_TURN_TICKS: u32 = 30 * simgrid::SIM_TICK_HZ;

impl ActiveDuels {
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

pub fn engine_side(idx: usize) -> simgrid::Side {
    if idx == 0 {
        simgrid::Side::Player
    } else {
        simgrid::Side::Enemy
    }
}

pub fn side_index_of_slot(duel: &Duel, slot: u16) -> Option<usize> {
    duel.sides.iter().position(|s| matches!(s, DuelSide::Human { slot: s2 } if *s2 == slot))
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
            duel.committed[idx] =
                Some(simgrid::choose_action(&duel.state, engine_side(idx), difficulty, &mut rng));
        }
    }
}

fn resolve_events(duel: &mut Duel) -> Vec<simgrid::BattleEvent> {
    let pa = duel.committed[0].take().unwrap_or(simgrid::BattleAction::Run);
    let ea = duel.committed[1].take().unwrap_or(simgrid::BattleAction::Run);
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

/// The battle snapshot as one side sees it: viewer 0 is the engine's player side
/// verbatim; viewer 1 sees teams, active indices, moves, events, and outcome
/// mirrored so their own side always renders as `player`.
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
```

Notes for the implementer:
- Check `simgrid::BattleState::side(&self, Side) -> &BattleSide` exists and is public (battle.rs). If it is private, add `pub` in battle.rs — `resolve_replacement` uses an internal `side_mut`, and a public read accessor is reasonable.
- Check `simgrid::rng::Mulberry32` is the type `stream` returns and is importable via that path; adjust the `ai_rng` return type to whatever lib.rs exposes.
- `if let` chains (`&& let`) require the file to follow existing edition-2024 usage in this repo — game.rs already uses them; keep or split into nested `if let` to match.
- game.rs items promoted to `pub(crate)` in this task compile-break nothing; do it in the same commit.
- main.rs: add `mod duel;` and `app.insert_resource(duel::ActiveDuels::default())` next to the existing `ActivePetBattles` insert (do NOT remove `ActivePetBattles` yet — Task 3 does).

- [ ] **Step 4: Run tests**

Run: `pnpm nx test arpg-server && pnpm nx build arpg-server`
Expected: all pass (15 existing + 8 new).

- [ ] **Step 5: Commit**

```bash
git add apps/agones/arpg/server/src/duel.rs apps/agones/arpg/server/src/main.rs apps/agones/arpg/server/src/game.rs packages/rust/simgrid/src/sim.rs packages/rust/simgrid/src/lib.rs
git commit -m "feat(arpg): duel registry core - commit/resolve/deadline/forfeit/viewer mapping"
```

---

### Task 3: Rewire debug battle + turns onto the registry, real roster teams

**Files:**
- Modify: `apps/agones/arpg/server/src/game.rs` (delete `ActivePetBattles` ~765, rework `apply_pet_battles` ~865 and `apply_pet_turns` ~893)
- Modify: `apps/agones/arpg/server/src/duel.rs` (add `roster_team` helper + `stream_duel_views` helper)
- Modify: `apps/agones/arpg/server/src/main.rs` (drop `ActivePetBattles` insert; keep system chain)

**Interfaces:**
- Consumes: Task 2's registry API; `simgrid::{PetRoster, PetBank, PetSnapshot, Combatant, mint_pet_from_species}`; `simgrid::PlayerSlotTag` (check exact export name — sim.rs spawns players with `PlayerSlotTag(*slot)`).
- Produces: `pub fn roster_team(bank: &simgrid::PetBank, roster: &simgrid::PetRoster) -> Vec<simgrid::Combatant>` in duel.rs (used again by Task 6); `pub fn stream_duel_views(bcast: &simgrid::Outbound, duel: &Duel, events: &[simgrid::proto::PetBattleWireEvent])` which sends each Human side its `viewer_view` via `game::send_battle_view`.

- [ ] **Step 1: Write the failing test** (duel.rs tests)

```rust
#[test]
fn roster_team_copies_are_full_hp() {
    let species = crate::game::NPC_DB.get(crate::game::MECHAMUTT_REF).expect("mechamutt");
    let mut snap = simgrid::mint_pet_from_species(species, 50).expect("mint");
    snap.vitals.hp = 1;
    let combatant = combatant_from_snapshot(&snap);
    assert_eq!(combatant.map(|c| (c.hp, c.max_hp > 1)), Some((combatant_max_hp(&snap), true)));
}
```

Implement via a small pure seam so the test does not need a bevy world: `roster_team` iterates `bank.snapshot(roster)` and calls `combatant_from_snapshot(&snap)` per pet; the test exercises `combatant_from_snapshot` directly (full-HP reset + species lookup from `game::NPC_DB` by `snap.species_ref`, `Combatant::from_pet`). Write the test against the seam you actually build — the shape above is the required behavior: a snapshot with 1 HP produces a full-HP combatant.

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm nx test arpg-server`
Expected: FAIL — helper not found.

- [ ] **Step 3: Implement**

duel.rs additions:

```rust
fn combatant_from_snapshot(snap: &simgrid::PetSnapshot) -> Option<simgrid::Combatant> {
    let species = game::NPC_DB.get(&snap.species_ref)?;
    let mut fresh = snap.clone();
    fresh.vitals.hp = fresh.vitals.max_hp;
    Some(simgrid::Combatant::from_pet(&fresh, species))
}

/// Fresh full-HP battle copies of the player's persisted roster; empty when the
/// roster is empty (caller falls back to a minted team).
pub fn roster_team(bank: &simgrid::PetBank, roster: &simgrid::PetRoster) -> Vec<simgrid::Combatant> {
    bank.snapshot(roster)
        .iter()
        .filter_map(combatant_from_snapshot)
        .collect()
}

pub fn stream_duel_views(
    bcast: &simgrid::Outbound,
    duel: &Duel,
    events: &[simgrid::proto::PetBattleWireEvent],
) {
    for (idx, side) in duel.sides.iter().enumerate() {
        if let DuelSide::Human { slot } = side {
            let view = viewer_view(duel, idx, events);
            game::send_battle_view(bcast, simgrid::proto::PlayerSlot(*slot), &view);
        }
    }
}
```

Verify field names on `PetSnapshot`/`PetVitals` (pets.rs:86-95: `vitals: PetVitals` with `hp`/`max_hp`) and `PetBank::snapshot(&roster) -> Vec<PetSnapshot>` (pets.rs:328); adjust if the actual shape differs. Verify `proto::PlayerSlot` is a tuple struct over `u16`.

game.rs — replace `apply_pet_battles` body (keep signature style; add roster access):

```rust
pub fn apply_pet_battles(
    bcast: Res<simgrid::Outbound>,
    clock: Res<simgrid::SimClock>,
    mut pending: ResMut<simgrid::PendingPetBattles>,
    mut duels: ResMut<crate::duel::ActiveDuels>,
    bank: simgrid::PetBank,
    players: Query<(&simgrid::PlayerSlotTag, &simgrid::PetRoster)>,
) {
    if pending.0.is_empty() {
        return;
    }
    for slot in std::mem::take(&mut pending.0) {
        if duels.by_slot.contains_key(&slot.0) {
            continue;
        }
        let Some(species) = NPC_DB.get(MECHAMUTT_REF) else {
            continue;
        };
        let mut team = players
            .iter()
            .find(|(tag, _)| tag.0 == slot)
            .map(|(_, roster)| crate::duel::roster_team(&bank, roster))
            .unwrap_or_default();
        if team.is_empty() {
            team = mechamutt_team(species);
        }
        let root = simgrid::rng::mix32(&[0x5E7B_A77E, slot.0 as u32, clock.tick]);
        let state = simgrid::BattleState::versus(root, team, mechamutt_team(species));
        let duel = crate::duel::Duel {
            state,
            sides: [
                crate::duel::DuelSide::Human { slot: slot.0 },
                crate::duel::DuelSide::Npc {
                    trainer: None,
                    name: "Training Bot".into(),
                    difficulty: simgrid::AiDifficulty::Greedy,
                },
            ],
            committed: [None, None],
            deadline_tick: clock.tick.saturating_add(crate::duel::DUEL_TURN_TICKS),
        };
        let opening = vec![info_event(
            "A trainer battle begins — choose your move!".into(),
        )];
        let id = duels.create(duel);
        crate::duel::stream_duel_views(&bcast, &duels.by_id[&id], &opening);
    }
}
```

game.rs — replace `apply_pet_turns` body:

```rust
pub fn apply_pet_turns(
    bcast: Res<simgrid::Outbound>,
    clock: Res<simgrid::SimClock>,
    mut pending: ResMut<simgrid::PendingPetTurns>,
    mut duels: ResMut<crate::duel::ActiveDuels>,
    mut commands: bevy::prelude::Commands,
) {
    if pending.0.is_empty() {
        return;
    }
    for (slot, action, arg) in std::mem::take(&mut pending.0) {
        let Some(&id) = duels.by_slot.get(&slot.0) else {
            continue;
        };
        let Some(duel) = duels.by_id.get_mut(&id) else {
            continue;
        };
        let Some(idx) = crate::duel::side_index_of_slot(duel, slot.0) else {
            continue;
        };
        let Some(pa) = player_action(action, arg) else {
            continue;
        };
        let side = crate::duel::engine_side(idx);
        let raw = if duel.state.needs_replacement(side) {
            match pa {
                simgrid::BattleAction::Swap { to } => {
                    let ev = duel.state.resolve_replacement(side, to);
                    if !ev.is_empty() {
                        duel.deadline_tick =
                            clock.tick.saturating_add(crate::duel::DUEL_TURN_TICKS);
                    }
                    ev
                }
                _ => Vec::new(),
            }
        } else {
            duel.committed[idx] = Some(pa);
            crate::duel::npc_commit(duel);
            crate::duel::try_resolve(duel, clock.tick).unwrap_or_default()
        };
        let mut events: Vec<_> = raw
            .iter()
            .filter(|e| !matches!(e, simgrid::BattleEvent::Outcome(_)))
            .map(wire_event)
            .collect();
        if duel.state.needs_replacement(side) {
            events.push(info_event("Your pet fainted — choose a replacement!".into()));
        }
        let resolved = duel.state.outcome != simgrid::BattleOutcome::Ongoing;
        crate::duel::stream_duel_views(&bcast, duel, &events);
        if resolved {
            crate::duel::finish_duel(&mut duels, id, &mut commands);
        }
    }
}
```

duel.rs — add `finish_duel` (also used by Tasks 4-5):

```rust
/// Remove a finished duel and free its trainer for the next challenger.
pub fn finish_duel(
    duels: &mut ActiveDuels,
    id: u32,
    commands: &mut bevy::prelude::Commands,
) {
    if let Some(duel) = duels.remove(id) {
        for side in &duel.sides {
            if let DuelSide::Npc { trainer: Some(e), .. } = side {
                commands.entity(*e).remove::<TrainerBusy>();
            }
        }
    }
}
```

`TrainerBusy` lands in Task 6 — for this task, declare both markers now so `finish_duel` compiles:

```rust
#[derive(bevy::prelude::Component)]
pub struct Trainer(pub usize);

#[derive(bevy::prelude::Component)]
pub struct TrainerBusy;
```

Delete from game.rs: the `ActivePetBattles` struct + doc comment (~761-766). Remove its `insert_resource` from main.rs. NOTE: the `wire_event` REPLACEMENT-PROMPT flow is otherwise identical to PR1 — the player-facing behavior (replacement gate, info prompt, MOVE inert while fainted) must not change; the PR1 smoke script semantics are the contract.

Watch replacement-phase turn semantics: on a player `Swap` during replacement, the turn does NOT resolve (free action) — the code above only commits/resolves in the else branch, matching PR1 behavior.

- [ ] **Step 4: Run tests**

Run: `pnpm nx test arpg-server && pnpm nx test simgrid && pnpm nx build arpg-server`
Expected: all pass. The existing `pet_battle_sim_is_deterministic_and_decides` test and `simulate_battle` harness are untouched.

- [ ] **Step 5: Commit**

```bash
git add apps/agones/arpg/server/src/game.rs apps/agones/arpg/server/src/duel.rs apps/agones/arpg/server/src/main.rs
git commit -m "feat(arpg): debug battle and turns run through unified duel registry with roster teams"
```

---

### Task 4: Turn deadline system

**Files:**
- Modify: `apps/agones/arpg/server/src/duel.rs` (add `tick_duels` system)
- Modify: `apps/agones/arpg/server/src/main.rs` (register system)

**Interfaces:**
- Consumes: `force_deadline`, `stream_duel_views`, `finish_duel` (Tasks 2-3).
- Produces: `pub fn tick_duels(...)` bevy system.

- [ ] **Step 1: Tests already cover the pure logic** (`deadline_auto_commits_idle_human_and_resolves`, `deadline_resolves_pending_human_replacement` from Task 2). This task is system wiring; add one more pure test:

```rust
#[test]
fn finished_duel_ignores_deadline() {
    let mut d = pve_duel();
    d.state.outcome = simgrid::BattleOutcome::PlayerWon;
    d.deadline_tick = 0;
    assert!(force_deadline(&mut d, 100).is_none());
}
```

- [ ] **Step 2: Run test** — should PASS already (guard exists in `force_deadline`); if it fails, fix `force_deadline`.

- [ ] **Step 3: Implement the system** (duel.rs):

```rust
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
        let Some(raw) = force_deadline(duel, clock.tick) else {
            continue;
        };
        let mut events: Vec<_> = raw
            .iter()
            .filter(|e| !matches!(e, simgrid::BattleEvent::Outcome(_)))
            .map(game::wire_event)
            .collect();
        events.push(game::info_event("Time's up — a move was chosen for you.".into()));
        let resolved = duel.state.outcome != simgrid::BattleOutcome::Ongoing;
        stream_duel_views(&bcast, duel, &events);
        if resolved {
            finish_duel(&mut duels, id, &mut commands);
        }
    }
}
```

main.rs — extend the pet battle system tuple:

```rust
        app.add_systems(
            bevy::prelude::Update,
            (
                game::apply_pet_battles,
                game::apply_pet_turns,
                duel::tick_duels,
            )
                .chain()
                .after(simgrid::SimSet::Input),
        );
```

Borrow gotcha: `stream_duel_views(&bcast, duel, ...)` takes `&Duel` while `duels` is mutably borrowed via `get_mut` — end the mutable borrow first (bind `resolved`, drop `duel`, then re-fetch immutably: `if let Some(d) = duels.by_id.get(&id) { stream_duel_views(&bcast, d, &events); }`). Restructure as needed; the tests + clippy are the gate.

- [ ] **Step 4: Run tests**

Run: `pnpm nx test arpg-server && pnpm nx build arpg-server`
Expected: pass.

- [ ] **Step 5: Commit**

```bash
git add apps/agones/arpg/server/src/duel.rs apps/agones/arpg/server/src/main.rs
git commit -m "feat(arpg): duel turn deadline auto-commits idle players"
```

---

### Task 5: Disconnect forfeit

**Files:**
- Modify: `apps/agones/arpg/server/src/duel.rs` (add `cleanup_stale_duels` system)
- Modify: `apps/agones/arpg/server/src/main.rs` (register after `tick_duels` in the same chain)

**Interfaces:**
- Consumes: `simgrid::SpawnedSlots` (`pub by_slot: HashMap<u16, (Entity, String)>` — verify it is re-exported from simgrid lib.rs; if not, re-export it), `forfeit`, `stream_duel_views`, `finish_duel`.

- [ ] **Step 1: Write the failing test** (duel.rs tests — pure part)

```rust
#[test]
fn stale_human_side_forfeits_duel() {
    let mut d = pve_duel();
    let connected: std::collections::HashSet<u16> = std::collections::HashSet::new();
    let stale = stale_human_sides(&d, |slot| connected.contains(&slot));
    assert_eq!(stale, vec![0]);
    forfeit(&mut d, stale[0]);
    assert_eq!(d.state.outcome, simgrid::BattleOutcome::PlayerLost);
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm nx test arpg-server`
Expected: FAIL — `stale_human_sides` not found.

- [ ] **Step 3: Implement**

```rust
/// Indices of human sides whose slot is no longer connected.
pub fn stale_human_sides(duel: &Duel, connected: impl Fn(u16) -> bool) -> Vec<usize> {
    duel.sides
        .iter()
        .enumerate()
        .filter_map(|(i, s)| match s {
            DuelSide::Human { slot } if !connected(*slot) => Some(i),
            _ => None,
        })
        .collect()
}

pub fn cleanup_stale_duels(
    bcast: bevy::prelude::Res<simgrid::Outbound>,
    spawned: bevy::prelude::Res<simgrid::SpawnedSlots>,
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
                DuelSide::Human { slot } if spawned.by_slot.contains_key(slot) => Some(i),
                _ => None,
            })
            .collect();
        for idx in survivors {
            if let DuelSide::Human { slot } = duel.sides[idx] {
                let view = viewer_view(duel, idx, &events);
                game::send_battle_view(&bcast, simgrid::proto::PlayerSlot(slot), &view);
            }
        }
        finish_duel(&mut duels, id, &mut commands);
    }
}
```

Same borrow restructuring caveat as Task 4 (immutable re-fetch before streaming). In PvE there is no surviving human viewer — the loop simply streams nothing and the duel is removed, trainer unbusied. Verify `SpawnedSlots` visibility from the arpg server crate; add the lib.rs re-export if missing.

main.rs: append `duel::cleanup_stale_duels` to the chained tuple after `duel::tick_duels`.

- [ ] **Step 4: Run tests**

Run: `pnpm nx test arpg-server && pnpm nx build arpg-server`
Expected: pass.

- [ ] **Step 5: Commit**

```bash
git add apps/agones/arpg/server/src/duel.rs apps/agones/arpg/server/src/main.rs packages/rust/simgrid/src/lib.rs
git commit -m "feat(arpg): disconnected duelist forfeits and frees the trainer"
```

---

### Task 6: Trainer NPCs in world + challenge handling

**Files:**
- Modify: `apps/agones/arpg/server/src/duel.rs` (trainer table, `apply_npc_challenges` system)
- Modify: `apps/agones/arpg/server/src/game.rs` (`registry()` ~279 register trainer ref; `spawn_world` ~1082 spawn trainer)
- Modify: `apps/agones/arpg/server/src/creatures.rs` (nothing — trainers are not creatures; only if the implementer finds shared spec helpers worth reusing)
- Modify: `packages/rust/simgrid/src/sim.rs` (`spawn_npc_from_spec` ~1038: return `Entity`)
- Modify: `apps/agones/arpg/server/src/main.rs` (register `apply_npc_challenges` in the duel chain, before `apply_pet_turns`)

**Interfaces:**
- Consumes: `PendingNpcChallenges` (Task 1), `EidIndex` (`pub by_eid: HashMap<u32, Entity>` — verify simgrid re-export), registry/duel API (Tasks 2-3), `simgrid::{NpcSpec, spawn_npc_from_spec, GridPos, Floor?}` (verify the floor component name used on NPCs — `spawn_npc_from_spec` shows what it inserts).
- Produces: `pub const TRAINER_REF: &str = "trainer";` `pub struct TrainerDef { pub name: &'static str, pub team: &'static [(&'static str, u32)], pub difficulty: simgrid::AiDifficulty }` `pub const TRAINERS: &[TrainerDef]`, `pub fn trainer_team(def: &TrainerDef) -> Vec<simgrid::Combatant>`, `pub fn spawn_trainers(...)` helper called from `spawn_world`, `pub fn apply_npc_challenges(...)` system.

- [ ] **Step 1: Write the failing tests** (duel.rs tests)

```rust
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm nx test arpg-server`
Expected: FAIL.

- [ ] **Step 3: Implement**

sim.rs — `spawn_npc_from_spec` returns the entity (existing callers ignore the return value; no other change):

```rust
pub fn spawn_npc_from_spec(commands: &mut Commands, spec: &NpcSpec) -> Entity {
    ...existing body...
    e.id()
}
```

(The existing body builds `let mut e = commands.spawn((...))` then conditionally inserts — end it with `e.id()`.)

duel.rs:

```rust
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

pub fn within_challenge_range(a: simgrid::proto::Tile, b: simgrid::proto::Tile) -> bool {
    (a.x - b.x).abs() <= CHALLENGE_RANGE && (a.y - b.y).abs() <= CHALLENGE_RANGE
}
```

(Verify `Tile` field types — if `x`/`y` are unsigned, compute with `i64::from` casts.)

game.rs `registry()`: add `reg.register_npc(crate::duel::TRAINER_REF);`

game.rs `spawn_world`: after the goblin loop, spawn each trainer on the surface near player spawn:

```rust
    let spawn = player_spawn();
    for (i, _def) in crate::duel::TRAINERS.iter().enumerate() {
        let tile = Tile::new(spawn.x + 6 + (i as i32) * 3, spawn.y + 2);
        if let Some(kind) = registry.kind_of(crate::duel::TRAINER_REF) {
            let spec = simgrid::NpcSpec {
                kind,
                origin: tile,
                floor: SPAWN_FLOOR,
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
            let e = simgrid::spawn_npc_from_spec(&mut commands, &spec);
            commands.entity(e).insert(crate::duel::Trainer(i));
        }
    }
```

Verify against actual `spawn_world` locals: `player_spawn()`, `SPAWN_FLOOR`, `Tile` construction, whether trainers must snap to a walkable tile (use the same `floor_near_z`-style helper if the surface needs it; the goblin loop shows the pattern). `respawn_ticks: 0` — check what the respawn system does with 0 (if 0 means "instant respawn loop", use `NPC_RESPAWN_TICKS` instead). `NpcSpec` field list must match sim.rs:460-488 exactly — add/remove fields per the real struct.

duel.rs — the challenge system:

```rust
pub fn apply_npc_challenges(
    bcast: bevy::prelude::Res<simgrid::Outbound>,
    clock: bevy::prelude::Res<simgrid::SimClock>,
    mut pending: bevy::prelude::ResMut<simgrid::PendingNpcChallenges>,
    mut duels: bevy::prelude::ResMut<ActiveDuels>,
    index: bevy::prelude::Res<simgrid::EidIndex>,
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
    for (slot, npc) in std::mem::take(&mut pending.0) {
        if duels.by_slot.contains_key(&slot.0) {
            continue;
        }
        let Some(&trainer_entity) = index.by_eid.get(&npc.0) else {
            continue;
        };
        let Ok((trainer, trainer_pos, busy)) = trainers.get(trainer_entity) else {
            continue;
        };
        if busy.is_some() {
            continue;
        }
        let Some((_, player_pos, roster)) =
            players.iter().find(|(tag, _, _)| tag.0 == slot)
        else {
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
        let mut team = roster
            .map(|r| roster_team(&bank, r))
            .unwrap_or_default();
        if team.is_empty() {
            let Some(species) = game::NPC_DB.get(game::MECHAMUTT_REF) else {
                continue;
            };
            team = game::mechamutt_team(species);
        }
        let root = simgrid::rng::mix32(&[0xD0E1_5EED, slot.0 as u32, clock.tick]);
        let duel = Duel {
            state: simgrid::BattleState::versus(root, team, enemy),
            sides: [
                DuelSide::Human { slot: slot.0 },
                DuelSide::Npc {
                    trainer: Some(trainer_entity),
                    name: def.name.into(),
                    difficulty: def.difficulty,
                },
            ],
            committed: [None, None],
            deadline_tick: clock.tick.saturating_add(DUEL_TURN_TICKS),
        };
        commands.entity(trainer_entity).insert(TrainerBusy);
        let opening = vec![game::info_event(format!(
            "{} challenges you to a pet duel!",
            def.name
        ))];
        let id = duels.create(duel);
        stream_duel_views(&bcast, &duels.by_id[&id], &opening);
    }
}
```

Verify component/resource names against sim.rs (`PlayerSlotTag`, `GridPos` field `tile`, `EidIndex` re-export; a same-floor check should be added if NPCs carry a floor component — compare it to the player's, following how `OpenCorpse` validates ~sim.rs:2365).

main.rs — final chain:

```rust
            (
                duel::apply_npc_challenges,
                game::apply_pet_battles,
                game::apply_pet_turns,
                duel::tick_duels,
                duel::cleanup_stale_duels,
            )
                .chain()
                .after(simgrid::SimSet::Input),
```

- [ ] **Step 4: Run tests**

Run: `pnpm nx test arpg-server && pnpm nx test simgrid && pnpm nx build arpg-server && pnpm nx lint simgrid`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add apps/agones/arpg/server/src/duel.rs apps/agones/arpg/server/src/game.rs apps/agones/arpg/server/src/main.rs packages/rust/simgrid/src/sim.rs packages/rust/simgrid/src/lib.rs
git commit -m "feat(arpg): world trainer npcs accept walk-up pet duel challenges"
```

---

### Task 7: Client — wire mirror, challenge emitter, trainer interact + sprite

**Files:**
- Modify: `packages/npm/laser/src/lib/net/postcard-wire.ts` (`writeInput` ~lines 75-197: variant 33)
- Modify: `packages/npm/laser/src/lib/net/protocol.ts` (`Input` union ~lines 147-188)
- Modify: `packages/npm/laser/src/lib/net/game-client.ts` (emitter next to `openCorpse` ~315)
- Modify: `apps/agones/arpg/web/src/game/sceneInput.ts` (click-to-challenge next to the corpse branch ~158-167)
- Create: `apps/agones/arpg/web/src/game/entities/creatures/data/trainer.ts`
- Modify: `apps/agones/arpg/web/src/game/entities/creatures/registry.ts` (add `trainer` entry)

**Interfaces:**
- Consumes: server `ChallengeNpc` (index 33), trainer kind ref `"trainer"` in the Welcome registry.
- Produces: `client.challengeNpc(npc: number)`; clicking a trainer NPC within range sends it.

- [ ] **Step 1: Wire mirror** — postcard-wire.ts `writeInput`, in the object-variant section after the `PetTurn` branch (which writes `w.variant(32)`):

```ts
	} else if ('ChallengeNpc' in input) {
		w.variant(33);
		w.u32(input.ChallengeNpc.npc);
```

Match the exact code style of the neighboring branches (how `OpenCorpse` writes its `EntityId` — copy that field-write call; if EntityId is written via a helper like `w.u32` vs `writeEid`, mirror `OpenCorpse` exactly).

protocol.ts `Input` union — append:

```ts
	| { ChallengeNpc: { npc: number } }
```

(Match how `OpenCorpse: { corpse: number }` is typed.)

game-client.ts — next to `openCorpse`:

```ts
	challengeNpc(npc: number) {
		this.sendInputs([{ ChallengeNpc: { npc } }]);
	}
```

- [ ] **Step 2: Trainer creature def** — `data/trainer.ts`: copy `goblin.ts` wholesale, rename the export to `TRAINER`, set its display name to `"Pet Tamer"`, keep the goblin sprite/animation config as the placeholder visual. registry.ts: import and add `trainer: TRAINER` to `CREATURE_REGISTRY`.

- [ ] **Step 3: Interact** — sceneInput.ts, in the pointer-click handler beside the corpse branch (~158-167), add a trainer branch following the same shape: resolve the clicked entity's kind ref via the same registry lookup the corpse branch uses (`deps.kinds` — see `Cat.Env` check ~145); if the ref is `'trainer'`: if within distance ≤ 2 (the corpse branch uses `d <= 1`; use `d <= 2`) call `deps.client()?.challengeNpc(eid)`, else walk toward it exactly as the corpse branch does. Copy the corpse branch structure verbatim and adjust.

- [ ] **Step 4: Typecheck + tests**

Run: `pnpm nx run arpg-web:typecheck && pnpm nx run laser:test 2>/dev/null || pnpm nx run laser:lint`
Expected: typecheck clean. (Run whichever laser targets exist — check with `pnpm nx show project laser --json | head -40` and run its test/lint targets.)

- [ ] **Step 5: Commit**

```bash
git add packages/npm/laser/src/lib/net/postcard-wire.ts packages/npm/laser/src/lib/net/protocol.ts packages/npm/laser/src/lib/net/game-client.ts apps/agones/arpg/web/src/game/sceneInput.ts apps/agones/arpg/web/src/game/entities/creatures/data/trainer.ts apps/agones/arpg/web/src/game/entities/creatures/registry.ts
git commit -m "feat(arpg): client challenges trainer npcs into pet duels"
```

---

### Task 8: Full verification + PR

- [ ] **Step 1: Full test sweep**

Run from worktree root:

```bash
pnpm nx test simgrid && pnpm nx lint simgrid && pnpm nx test arpg-server && pnpm nx build arpg-server && pnpm nx run arpg-web:typecheck
```

Expected: everything green.

- [ ] **Step 2: Headless smoke (main session, not subagent)** — run the arpg server no-auth and drive the petsmoke WS client (pattern from PR1: scratchpad crate connects, `SimPetBattle`, plays to completion). Extend: locate the trainer entity in snapshots (kind = trainer ref from Welcome registry), send `ChallengeNpc`, verify a battle-state stream opens with the trainer opening line, and that a second `ChallengeNpc` while busy is ignored. Verify deadline: start a duel, send nothing, confirm an auto-committed turn arrives after ~30s ("Time's up" info line).

- [ ] **Step 3: Push + PR**

```bash
git push -u origin arpg-pet-duels-registry
gh pr create --base arpg-pet-duels-spec --title "feat(arpg): unified duel registry + NPC trainer duels" --body "..."
```

PR body: summary of registry (commit model, 30s deadline, disconnect forfeit), roster snapshot teams with minted fallback, trainer table + world spawn + walk-up challenge, client wire mirror. Note stacked on #13885, retarget to dev after PR1 merges. Refs #13801. No co-author trailer.
