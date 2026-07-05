# ARPG Pet Duels PR 1 — Engine Faint-Replacement + Battle AI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the fainted-pet deadlock in the simgrid battle engine via a Pokemon-style free-action replacement phase, and add a `battle_ai` module (Dumb/Greedy/Tactician) with rotation/preservation logic, wired into the arpg server.

**Architecture:** Engine stays a pure deterministic reducer. Replacement is a new free-action API on `BattleState` (`needs_replacement` / `resolve_replacement`) — `resolve_turn` refuses to run while a replacement is pending, so a fainted side can never be stuck. AI is a new pure module `battle_ai.rs` in simgrid (testable, deterministic from battle seed); the server's ad-hoc `ai_action` in `game.rs` is deleted and replaced by calls into it.

**Tech Stack:** Rust (simgrid crate, bevy-style server systems), Nx targets via pnpm.

Spec: `docs/superpowers/specs/2026-07-05-arpg-pet-duels-design.md` (sections 1, 2, and the engine slice of 7).

**Spec deviation (intentional):** the spec says "dead active may still Swap" inside `resolve_turn`. Implemented instead as: a fainted side acts ONLY through `resolve_replacement` (free action, consumes no turn), and `resolve_turn` no-ops while either side needs a replacement. Same behavior, single code path.

## Global Constraints

- Work in a git worktree branched from `origin/dev`; PR targets `dev`. Never push `dev`/`main` directly.
- Worktree creation needs `GIT_LFS_SKIP_SMUDGE=1` (LFS smudge 404s in worktrees).
- Run tasks through Nx: `pnpm nx test simgrid`, `pnpm nx lint simgrid`, `pnpm nx build arpg-server` (never raw cargo).
- No inline `//` comments. Terse `///` doc comments only where shown (matches existing file style).
- Commit messages: conventional, no Claude co-author line.
- All randomness through `crate::rng::Mulberry32` streams — no `rand`, no wall clock.

---

### Task 0: Worktree + branch

**Files:** none (setup)

- [ ] **Step 1: Create worktree**

```bash
cd /Users/alappatel/Documents/GitHub/kbve
git fetch origin dev
GIT_LFS_SKIP_SMUDGE=1 git worktree add /Users/alappatel/Documents/GitHub/kbve-worktrees/arpg-pet-duels-engine -b arpg-pet-duels-engine origin/dev
cd /Users/alappatel/Documents/GitHub/kbve-worktrees/arpg-pet-duels-engine
```

- [ ] **Step 2: Copy spec + this plan into the branch (if PR #13885 not yet merged)**

```bash
git checkout arpg-pet-duels-spec -- docs/superpowers/specs/2026-07-05-arpg-pet-duels-design.md 2>/dev/null || true
cp /Users/alappatel/Documents/GitHub/kbve/docs/superpowers/plans/2026-07-05-arpg-pet-duels-pr1-engine-ai.md docs/superpowers/plans/
git add docs/superpowers && git commit -m "docs(arpg): pet duels pr1 plan" || true
```

- [ ] **Step 3: Baseline test run**

Run: `pnpm nx test simgrid`
Expected: PASS (all existing tests green before changes).

---

### Task 1: Replacement phase in the engine

**Files:**

- Modify: `packages/rust/simgrid/src/battle.rs` (impl `BattleState`, ~line 533; tests module, ~line 835)

**Interfaces:**

- Produces: `BattleState::needs_replacement(&self, side: Side) -> bool`; `BattleState::resolve_replacement(&mut self, side: Side, to: usize) -> Vec<BattleEvent>`. Later tasks (AI, game.rs wiring) rely on these exact names.

- [ ] **Step 1: Write the failing tests** (append inside `mod tests` in `battle.rs`)

```rust
    #[test]
    fn fainted_side_enters_replacement_phase() {
        let mut b = BattleState::versus(1, vec![combatant(30)], vec![combatant(5), combatant(5)]);
        b.enemy.team[0].hp = 0;
        assert!(b.needs_replacement(Side::Enemy));
        assert!(!b.needs_replacement(Side::Player));
    }

    #[test]
    fn resolve_turn_noops_while_replacement_pending() {
        let mut b = BattleState::versus(1, vec![combatant(30)], vec![combatant(5), combatant(5)]);
        b.enemy.team[0].hp = 0;
        let turn = b.turn;
        let ev = b.resolve_turn(BattleAction::Move { slot: 0 }, BattleAction::Move { slot: 0 });
        assert!(ev.is_empty());
        assert_eq!(b.turn, turn);
    }

    #[test]
    fn replacement_is_a_free_action() {
        let mut b = BattleState::versus(1, vec![combatant(30)], vec![combatant(5), combatant(5)]);
        b.enemy.team[0].hp = 0;
        let turn = b.turn;
        let hp = b.player.active().hp;
        let ev = b.resolve_replacement(Side::Enemy, 1);
        assert_eq!(b.enemy.active, 1);
        assert_eq!(b.turn, turn, "replacement must not consume a turn");
        assert_eq!(b.player.active().hp, hp, "no free hit on swap-in");
        assert!(ev.iter().any(|e| matches!(e, BattleEvent::SwapIn { side: Side::Enemy, to: 1 })));
        assert!(!b.needs_replacement(Side::Enemy));
    }

    #[test]
    fn replacement_rejects_dead_or_invalid_target() {
        let mut b = BattleState::versus(1, vec![combatant(30)], vec![combatant(5), combatant(5)]);
        b.enemy.team[0].hp = 0;
        assert!(b.resolve_replacement(Side::Enemy, 0).is_empty());
        assert!(b.resolve_replacement(Side::Enemy, 9).is_empty());
        assert!(b.needs_replacement(Side::Enemy));
        b.enemy.team[1].hp = 0;
        assert!(!b.needs_replacement(Side::Enemy), "wiped team is an outcome, not a replacement");
    }

    #[test]
    fn no_replacement_when_healthy_or_over() {
        let mut b = BattleState::versus(1, vec![combatant(30)], vec![combatant(5)]);
        assert!(!b.needs_replacement(Side::Enemy));
        b.enemy.team[0].hp = 0;
        b.check_outcome(&mut Vec::new());
        assert_eq!(b.outcome, BattleOutcome::PlayerWon);
        assert!(!b.needs_replacement(Side::Enemy));
    }
```

- [ ] **Step 2: Run to verify they fail**

Run: `pnpm nx test simgrid`
Expected: FAIL — `no method named needs_replacement` (compile error).

- [ ] **Step 3: Implement** (inside `impl BattleState`, after `wild`, before `side`)

```rust
    /// True when `side`'s active has fainted but the team still has a living reserve —
    /// the battle is paused awaiting a free-action [`resolve_replacement`].
    pub fn needs_replacement(&self, side: Side) -> bool {
        self.outcome == BattleOutcome::Ongoing
            && !self.side(side).active().is_alive()
            && self.side(side).any_alive()
    }

    /// Send out team member `to` to replace a fainted active. Free action: consumes no
    /// turn and triggers nothing else. No-op unless a replacement is actually pending
    /// and `to` is a living, non-active team index.
    pub fn resolve_replacement(&mut self, side: Side, to: usize) -> Vec<BattleEvent> {
        let mut events = Vec::new();
        if !self.needs_replacement(side) {
            return events;
        }
        let s = self.side_mut(side);
        if to < s.team.len() && to != s.active && s.team[to].is_alive() {
            s.active = to;
            events.push(BattleEvent::SwapIn { side, to });
        }
        events
    }
```

Add the guard at the top of `resolve_turn` (right after the existing `outcome` early-return, before the rng line):

```rust
        if self.needs_replacement(Side::Player) || self.needs_replacement(Side::Enemy) {
            return events;
        }
```

Also make `check_outcome` callable from the test (`fn check_outcome` → `pub(crate) fn check_outcome`).

- [ ] **Step 4: Run tests**

Run: `pnpm nx test simgrid`
Expected: PASS (new + all pre-existing).

- [ ] **Step 5: Commit**

```bash
git add packages/rust/simgrid/src/battle.rs
git commit -m "fix(simgrid): fainted side gets free-action replacement phase"
```

---

### Task 2: `expected_damage` scoring helper

**Files:**

- Modify: `packages/rust/simgrid/src/battle.rs` (next to `damage`, ~line 494; tests module)

**Interfaces:**

- Produces: `pub fn expected_damage(att: &Combatant, def: &Combatant, mv: &MoveData) -> i32` (crate-public, used by `battle_ai`).

- [ ] **Step 1: Write the failing test**

```rust
    #[test]
    fn expected_damage_scores_moves_for_ai() {
        let att = combatant(20);
        let def = combatant(20);
        let tackle = MoveData::from_ability(&mechamutt().abilities[0]);
        let spark = MoveData::from_ability(&mechamutt().abilities[1]);
        assert!(expected_damage(&att, &def, &spark) > expected_damage(&att, &def, &tackle));
        let mut wild = tackle.clone();
        wild.accuracy = 0.5;
        assert!(expected_damage(&att, &def, &wild) < expected_damage(&att, &def, &tackle));
        let mut status = tackle.clone();
        status.power = 0;
        assert_eq!(expected_damage(&att, &def, &status), 0);
    }
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm nx test simgrid`
Expected: FAIL — `cannot find function expected_damage`.

- [ ] **Step 3: Implement** (free function after `damage`)

```rust
/// Deterministic damage estimate for AI scoring: mean variance, no crit, scaled by hit
/// chance. Status and zero-power moves estimate 0.
pub fn expected_damage(att: &Combatant, def: &Combatant, mv: &MoveData) -> i32 {
    let (dmg, _) = damage(att, def, mv, false, 92);
    let acc = if mv.accuracy <= 0.0 { 1.0 } else { mv.accuracy.clamp(0.0, 1.0) };
    (dmg as f32 * acc) as i32
}
```

- [ ] **Step 4: Run tests**

Run: `pnpm nx test simgrid`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/rust/simgrid/src/battle.rs
git commit -m "feat(simgrid): expected_damage scoring helper for battle ai"
```

---

### Task 3: `battle_ai` module — Dumb + Greedy + replacement choice

**Files:**

- Create: `packages/rust/simgrid/src/battle_ai.rs`
- Modify: `packages/rust/simgrid/src/lib.rs` (add `pub mod battle_ai;` after `pub mod battle;` and `pub use battle_ai::{AiDifficulty, choose_action, choose_replacement};` after the battle re-export; also add `expected_damage` to the `pub use battle::{...}` list)

**Interfaces:**

- Consumes: `expected_damage` (Task 2), `needs_replacement` (Task 1).
- Produces: `pub enum AiDifficulty { Dumb, Greedy, Tactician }`; `pub fn choose_action(state: &BattleState, side: Side, difficulty: AiDifficulty, rng: &mut Mulberry32) -> BattleAction`; `pub fn choose_replacement(state: &BattleState, side: Side, difficulty: AiDifficulty) -> usize`. Task 5 (game.rs) and PR 2 rely on these exact signatures.

- [ ] **Step 1: Create `battle_ai.rs` with module skeleton + failing tests**

```rust
//! Battle AI policies over the pure [`BattleState`] reducer — pick one
//! [`BattleAction`] per turn (or a replacement index after a faint) at a given
//! [`AiDifficulty`]. Pure and deterministic: all randomness comes from the caller's rng.

use serde::{Deserialize, Serialize};

use crate::battle::{
    BattleAction, BattleSide, BattleState, Combatant, Side, expected_damage, type_multiplier,
};
use crate::rng::Mulberry32;

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub enum AiDifficulty {
    Dumb,
    Greedy,
    Tactician,
}

fn sides(state: &BattleState, side: Side) -> (&BattleSide, &BattleSide) {
    match side {
        Side::Player => (&state.player, &state.enemy),
        Side::Enemy => (&state.enemy, &state.player),
    }
}

fn best_move(att: &Combatant, def: &Combatant) -> Option<(usize, i32)> {
    att.moves
        .iter()
        .enumerate()
        .filter(|(_, m)| m.pp > 0)
        .map(|(i, m)| (i, expected_damage(att, def, &m.data)))
        .max_by_key(|(_, d)| *d)
}

fn any_pp_move(c: &Combatant, rng: &mut Mulberry32) -> usize {
    let usable: Vec<usize> = c
        .moves
        .iter()
        .enumerate()
        .filter(|(_, m)| m.pp > 0)
        .map(|(i, _)| i)
        .collect();
    if usable.is_empty() {
        0
    } else {
        usable[(rng.next_u32() as usize) % usable.len()]
    }
}

/// Pick `side`'s action for the coming turn.
pub fn choose_action(
    state: &BattleState,
    side: Side,
    difficulty: AiDifficulty,
    rng: &mut Mulberry32,
) -> BattleAction {
    let (mine, theirs) = sides(state, side);
    let active = mine.active();
    let opp = theirs.active();
    match difficulty {
        AiDifficulty::Dumb => BattleAction::Move {
            slot: any_pp_move(active, rng),
        },
        AiDifficulty::Greedy => BattleAction::Move {
            slot: best_move(active, opp).map(|(i, _)| i).unwrap_or(0),
        },
        AiDifficulty::Tactician => tactician(state, side, rng),
    }
}

fn tactician(state: &BattleState, side: Side, rng: &mut Mulberry32) -> BattleAction {
    let (mine, theirs) = sides(state, side);
    BattleAction::Move {
        slot: best_move(mine.active(), theirs.active())
            .map(|(i, _)| i)
            .unwrap_or_else(|| any_pp_move(mine.active(), rng)),
    }
}

/// Pick the reserve index to send out after a faint. Falls back to the first living
/// reserve; callers should only invoke this when `needs_replacement(side)` is true.
pub fn choose_replacement(state: &BattleState, side: Side, difficulty: AiDifficulty) -> usize {
    let (mine, theirs) = sides(state, side);
    let opp = theirs.active();
    let first = mine
        .team
        .iter()
        .position(Combatant::is_alive)
        .unwrap_or(0);
    if difficulty == AiDifficulty::Dumb {
        return first;
    }
    mine.team
        .iter()
        .enumerate()
        .filter(|(i, c)| c.is_alive() && *i != mine.active)
        .max_by_key(|(_, c)| {
            let own = best_move(c, opp).map(|(_, d)| d).unwrap_or(0);
            let incoming = best_move(opp, c).map(|(_, d)| d).unwrap_or(0);
            own - incoming
        })
        .map(|(i, _)| i)
        .unwrap_or(first)
}
```

Append tests in the same file:

```rust
#[cfg(test)]
mod tests {
    use super::*;
    use crate::battle::{BattleState, MoveData, PetStatus};
    use crate::data::{NpcAbility, NpcDef, NpcMovepoolEntry, NpcPet, NpcStats};
    use crate::pets::mint_pet_from_species;
    use crate::rng;

    fn ability(id: &str, power: i32, cat: &str, elem: &str) -> NpcAbility {
        NpcAbility {
            id: id.into(),
            power,
            max_pp: 20,
            category: cat.into(),
            element: elem.into(),
            hit_chance: 1.0,
            ..Default::default()
        }
    }

    fn species(ref_id: &str, elem: &str, abilities: Vec<NpcAbility>) -> NpcDef {
        let movepool = abilities
            .iter()
            .map(|a| NpcMovepoolEntry {
                level: 1,
                ability_id: a.id.clone(),
            })
            .collect();
        NpcDef {
            ref_id: ref_id.into(),
            name: ref_id.into(),
            level: 5,
            element: elem.into(),
            stats: NpcStats {
                hp: 45,
                max_hp: 45,
                attack: 9,
                defense: 7,
                speed: 11,
                special_attack: 12,
                special_defense: 8,
            },
            equipment: None,
            faction: None,
            shop_items: vec![],
            abilities,
            pet: Some(NpcPet {
                catchable: true,
                movepool,
                ..Default::default()
            }),
        }
    }

    fn mint(def: &NpcDef, level: u32) -> crate::battle::Combatant {
        let snap = mint_pet_from_species(def, level).unwrap();
        crate::battle::Combatant::from_pet(&snap, def)
    }

    fn firefox(level: u32) -> crate::battle::Combatant {
        mint(
            &species(
                "firefox",
                "ELEMENT_FIRE",
                vec![
                    ability("ember", 25, "MOVE_CATEGORY_SPECIAL", "ELEMENT_FIRE"),
                    ability("gust", 40, "MOVE_CATEGORY_SPECIAL", "ELEMENT_WIND"),
                ],
            ),
            level,
        )
    }

    fn leafling(level: u32) -> crate::battle::Combatant {
        mint(
            &species(
                "leafling",
                "ELEMENT_NATURE",
                vec![ability("vine", 20, "MOVE_CATEGORY_SPECIAL", "ELEMENT_NATURE")],
            ),
            level,
        )
    }

    fn stoneling(level: u32) -> crate::battle::Combatant {
        mint(
            &species(
                "stoneling",
                "ELEMENT_EARTH",
                vec![ability("rock", 20, "MOVE_CATEGORY_PHYSICAL", "ELEMENT_EARTH")],
            ),
            level,
        )
    }

    #[test]
    fn greedy_prefers_super_effective_over_raw_power() {
        let state = BattleState::versus(1, vec![firefox(20)], vec![leafling(20)]);
        let mut r = rng::stream(1, rng::domain::PETBATTLE, &[0, 0xA1]);
        let a = choose_action(&state, Side::Player, AiDifficulty::Greedy, &mut r);
        assert_eq!(
            a,
            BattleAction::Move { slot: 0 },
            "ember 25 at 2x fire->nature + stab (75 effective) beats neutral gust 40"
        );
    }

    #[test]
    fn dumb_only_picks_moves_with_pp() {
        let mut state = BattleState::versus(1, vec![firefox(20)], vec![leafling(20)]);
        state.player.team[0].moves[0].pp = 0;
        let mut r = rng::stream(1, rng::domain::PETBATTLE, &[0, 0xA1]);
        for _ in 0..8 {
            let a = choose_action(&state, Side::Player, AiDifficulty::Dumb, &mut r);
            assert_eq!(a, BattleAction::Move { slot: 1 });
        }
    }

    #[test]
    fn replacement_picks_best_matchup_not_first_alive() {
        let mut state = BattleState::versus(
            1,
            vec![firefox(20)],
            vec![leafling(20), leafling(20), stoneling(20)],
        );
        state.enemy.team[0].hp = 0;
        let dumb = choose_replacement(&state, Side::Enemy, AiDifficulty::Dumb);
        let smart = choose_replacement(&state, Side::Enemy, AiDifficulty::Greedy);
        assert_eq!(dumb, 1, "dumb takes first living reserve");
        assert_eq!(
            smart, 2,
            "stoneling resists nothing but leafling takes 2x from fire — earth is the better matchup"
        );
    }

    #[test]
    fn choose_action_is_deterministic_per_seed() {
        let state = BattleState::versus(7, vec![firefox(20)], vec![leafling(20)]);
        let pick = |seed: u32| {
            let mut r = rng::stream(seed, rng::domain::PETBATTLE, &[0, 0xA1]);
            choose_action(&state, Side::Player, AiDifficulty::Dumb, &mut r)
        };
        assert_eq!(pick(42), pick(42));
    }
}
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm nx test simgrid`
Expected: FAIL — module not registered (`battle_ai` unresolved) until lib.rs edited; after lib.rs edit, tests compile and PASS. To see a true red first, add the lib.rs line and stub `choose_action` with `todo!()`; either way, end state is Step 4 green.

- [ ] **Step 3: Register module in `lib.rs`**

```rust
pub mod battle_ai;
```

and extend the re-exports:

```rust
pub use battle::{
    BattleAction, BattleEvent, BattleOutcome, BattleSide, BattleState, Combatant, Effectiveness,
    Element, MoveCategory, MoveData, PetStatus, Side, StatId, expected_damage, type_multiplier,
};
pub use battle_ai::{AiDifficulty, choose_action, choose_replacement};
```

- [ ] **Step 4: Run tests**

Run: `pnpm nx test simgrid`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/rust/simgrid/src/battle_ai.rs packages/rust/simgrid/src/lib.rs
git commit -m "feat(simgrid): battle_ai module with dumb/greedy policies and matchup replacement"
```

---

### Task 4: Tactician — KO securing, opening status move, preservation swap

**Files:**

- Modify: `packages/rust/simgrid/src/battle_ai.rs` (replace the `tactician` stub; add tests)

**Interfaces:**

- Consumes: everything from Task 3.
- Produces: full `Tactician` behavior behind the same `choose_action` signature (no API change).

- [ ] **Step 1: Write the failing tests** (append to `mod tests`)

```rust
    fn statusfox(level: u32) -> crate::battle::Combatant {
        let mut burn = ability("scorch", 0, "MOVE_CATEGORY_STATUS", "ELEMENT_FIRE");
        burn.status_effect = "burn".into();
        burn.status_chance = 1.0;
        mint(
            &species(
                "statusfox",
                "ELEMENT_FIRE",
                vec![
                    ability("ember", 25, "MOVE_CATEGORY_SPECIAL", "ELEMENT_FIRE"),
                    burn,
                ],
            ),
            level,
        )
    }

    #[test]
    fn tactician_opens_with_status_move() {
        let state = BattleState::versus(1, vec![statusfox(20)], vec![leafling(20)]);
        let mut r = rng::stream(1, rng::domain::PETBATTLE, &[0, 0xA1]);
        let a = choose_action(&state, Side::Player, AiDifficulty::Tactician, &mut r);
        assert_eq!(a, BattleAction::Move { slot: 1 }, "turn 0, unstatused foe: apply burn");
    }

    #[test]
    fn tactician_skips_status_once_foe_statused() {
        let mut state = BattleState::versus(1, vec![statusfox(20)], vec![leafling(20)]);
        state.enemy.team[0].status = PetStatus::Burn;
        let mut r = rng::stream(1, rng::domain::PETBATTLE, &[0, 0xA1]);
        let a = choose_action(&state, Side::Player, AiDifficulty::Tactician, &mut r);
        assert_eq!(a, BattleAction::Move { slot: 0 });
    }

    #[test]
    fn tactician_secures_ko_with_weakest_sufficient_move() {
        let mut state = BattleState::versus(1, vec![firefox(20)], vec![leafling(20)]);
        state.enemy.team[0].hp = 3;
        let mut r = rng::stream(1, rng::domain::PETBATTLE, &[0, 0xA1]);
        let a = choose_action(&state, Side::Player, AiDifficulty::Tactician, &mut r);
        assert_eq!(a, BattleAction::Move { slot: 1 }, "gust already kills at 3 hp; save ember pp");
    }

    #[test]
    fn tactician_rotates_out_of_bad_low_hp_matchup() {
        let mut state = BattleState::versus(
            1,
            vec![leafling(20), firefox(20)],
            vec![firefox(20)],
        );
        let max = state.player.team[0].max_hp;
        state.player.team[0].hp = (max / 5).max(1);
        let mut r = rng::stream(1, rng::domain::PETBATTLE, &[0, 0xA1]);
        let a = choose_action(&state, Side::Player, AiDifficulty::Tactician, &mut r);
        assert_eq!(
            a,
            BattleAction::Swap { to: 1 },
            "low-hp leafling takes 2x from fire; reserve firefox resists fire at 0.5x"
        );
    }

    #[test]
    fn tactician_stays_in_when_no_better_reserve() {
        let mut state = BattleState::versus(1, vec![leafling(20), leafling(20)], vec![firefox(20)]);
        let max = state.player.team[0].max_hp;
        state.player.team[0].hp = (max / 5).max(1);
        let mut r = rng::stream(1, rng::domain::PETBATTLE, &[0, 0xA1]);
        let a = choose_action(&state, Side::Player, AiDifficulty::Tactician, &mut r);
        assert!(matches!(a, BattleAction::Move { .. }), "no reserve resists fire; keep attacking");
    }
```

Type-chart note for these fixtures: fire is only resisted by fire (`type_multiplier(Fire, Fire) == 0.5`), which is why the preservation-swap test's reserve is a second firefox; stoneling (earth) neither resists fire nor is used in the rotate test.

- [ ] **Step 2: Run to verify failures**

Run: `pnpm nx test simgrid`
Expected: FAIL — tactician stub always returns `Move`.

- [ ] **Step 3: Implement tactician** (replace the stub)

```rust
fn tactician(state: &BattleState, side: Side, rng: &mut Mulberry32) -> BattleAction {
    let (mine, theirs) = sides(state, side);
    let active = mine.active();
    let opp = theirs.active();

    let ko_slot = active
        .moves
        .iter()
        .enumerate()
        .filter(|(_, m)| m.pp > 0)
        .filter(|(_, m)| expected_damage(active, opp, &m.data) >= opp.hp)
        .min_by_key(|(_, m)| m.data.power)
        .map(|(i, _)| i);
    if let Some(slot) = ko_slot {
        return BattleAction::Move { slot };
    }

    if state.turn == 0 && opp.status == crate::battle::PetStatus::None {
        let status_slot = active
            .moves
            .iter()
            .enumerate()
            .find(|(_, m)| {
                m.pp > 0
                    && m.data.power == 0
                    && m.data.status != crate::battle::PetStatus::None
                    && m.data.status_chance > 0.0
            })
            .map(|(i, _)| i);
        if let Some(slot) = status_slot {
            return BattleAction::Move { slot };
        }
    }

    let best = best_move(active, opp);
    let own_best_mult = active
        .moves
        .iter()
        .filter(|m| m.pp > 0 && m.data.power > 0)
        .map(|m| type_multiplier(m.data.element, opp.element))
        .fold(0.0_f32, f32::max);
    let incoming = type_multiplier(opp.element, active.element);
    let low_hp = active.hp * 4 < active.max_hp;
    let bad_matchup = incoming >= 2.0 || (own_best_mult > 0.0 && own_best_mult <= 0.5);
    if low_hp && bad_matchup {
        let candidate = mine
            .team
            .iter()
            .enumerate()
            .filter(|(i, c)| c.is_alive() && *i != mine.active)
            .filter(|(_, c)| type_multiplier(opp.element, c.element) < 1.0)
            .max_by_key(|(_, c)| {
                let own = best_move(c, opp).map(|(_, d)| d).unwrap_or(0);
                let inc = best_move(opp, c).map(|(_, d)| d).unwrap_or(0);
                own - inc
            })
            .map(|(i, _)| i);
        if let Some(to) = candidate {
            return BattleAction::Swap { to };
        }
    }

    BattleAction::Move {
        slot: best.map(|(i, _)| i).unwrap_or_else(|| any_pp_move(active, rng)),
    }
}
```

- [ ] **Step 4: Run tests**

Run: `pnpm nx test simgrid`
Expected: PASS. If `tactician_secures_ko_with_weakest_sufficient_move` flakes on damage math (gust expected damage < 3 is impossible — connecting hits floor at 1 and `expected_damage(…) >= opp.hp` with hp 3 needs ≥ 3), verify actual `expected_damage` values with a temporary `dbg!` and adjust the pinned hp (e.g. `hp = 1`) rather than the logic.

- [ ] **Step 5: Lint + commit**

Run: `pnpm nx lint simgrid`
Expected: clean.

```bash
git add packages/rust/simgrid/src/battle_ai.rs
git commit -m "feat(simgrid): tactician ai — ko securing, opening status, preservation rotation"
```

---

### Task 5: Rewire arpg server onto `battle_ai` + replacement phase

**Files:**

- Modify: `apps/agones/arpg/server/src/game.rs` — delete `ai_action` (~lines 454-473); rework `apply_pet_turns` (~lines 887-916)

**Interfaces:**

- Consumes: `simgrid::{AiDifficulty, choose_action, choose_replacement}`, `BattleState::{needs_replacement, resolve_replacement}`.
- Produces: unchanged wire behavior for the client except: fainted enemies now swap in reserves, and a fainted player active forces the next player action to be a swap (other actions get an info line re-prompt).

- [ ] **Step 1: Delete `ai_action`** (game.rs ~lines 454-473, including its doc comment)

- [ ] **Step 2: Rework the body of `apply_pet_turns`** — replace from `let ea = ai_action(&state.enemy);` through `let view = battle_view(state, events);` with:

```rust
        let raw = if state.needs_replacement(simgrid::Side::Player) {
            match pa {
                simgrid::BattleAction::Swap { to } => {
                    state.resolve_replacement(simgrid::Side::Player, to)
                }
                _ => Vec::new(),
            }
        } else {
            let mut ai_rng = simgrid::rng::stream(
                state.root,
                simgrid::rng::domain::PETBATTLE,
                &[state.turn, AI_STREAM],
            );
            let ea = simgrid::choose_action(
                state,
                simgrid::Side::Enemy,
                simgrid::AiDifficulty::Greedy,
                &mut ai_rng,
            );
            state.resolve_turn(pa, ea)
        };
        let mut events: Vec<_> = raw
            .iter()
            .filter(|e| !matches!(e, simgrid::BattleEvent::Outcome(_)))
            .map(wire_event)
            .collect();
        if state.needs_replacement(simgrid::Side::Enemy) {
            let to = simgrid::choose_replacement(
                state,
                simgrid::Side::Enemy,
                simgrid::AiDifficulty::Greedy,
            );
            events.extend(
                state
                    .resolve_replacement(simgrid::Side::Enemy, to)
                    .iter()
                    .map(wire_event),
            );
        }
        if state.needs_replacement(simgrid::Side::Player) {
            events.push(info_event("Your pet fainted — choose a replacement!".into()));
        }
        let resolved = state.outcome != simgrid::BattleOutcome::Ongoing;
        let view = battle_view(state, events);
```

Add near the other battle constants (`BATTLE_TURN_CAP` block, ~game.rs:440):

```rust
const AI_STREAM: u32 = 0xA1;
```

Check `simgrid::rng::domain::PETBATTLE` visibility: `battle.rs` imports `crate::rng::{self, Mulberry32, domain}` and `lib.rs` declares `pub mod rng`, so `simgrid::rng::domain::PETBATTLE` resolves iff `domain` and its consts are `pub` — verify in `packages/rust/simgrid/src/rng.rs` and, if the module or const is private, make it `pub` in the same commit.

Check `info_event` signature at its definition in game.rs (used at ~line 875 with `format!`) and match its argument type (`String` vs `&str`).

- [ ] **Step 3: Build + lint**

Run: `pnpm nx build arpg-server && pnpm nx lint simgrid`
Expected: compiles clean; clippy clean.

- [ ] **Step 4: Full simgrid test suite**

Run: `pnpm nx test simgrid`
Expected: PASS.

- [ ] **Step 5: Manual smoke — 5v5 debug battle reaches enemy swap**

Run the arpg dev stack per `apps/agones/arpg/dev-tmux.sh`, open the web client, start a pet battle from the debug HUD button, and KO the first enemy pet. Expected: a `SwapIn` line/animation for the enemy and the battle continues against pet 2 of 5 (pre-fix behavior: enemy stops acting). Also faint your own active: HUD should show the info line and only a swap should advance the battle.

- [ ] **Step 6: Commit**

```bash
git add apps/agones/arpg/server/src/game.rs packages/rust/simgrid/src/rng.rs
git commit -m "feat(arpg): server uses battle_ai with faint replacement for pet battles"
```

---

### Task 6: PR

- [ ] **Step 1: Push branch**

```bash
git push -u origin arpg-pet-duels-engine
```

- [ ] **Step 2: Open PR against dev**

```bash
gh pr create --base dev --title "feat(simgrid): pet battle faint-replacement phase + battle ai" --body "PR 1 of the pet duels track (spec #13885, refs #13801).

- Fixes the fainted-pet deadlock: resolve_turn dropped a fainted side's Swap, so the enemy AI never sent in a reserve after a KO.
- New free-action replacement phase on BattleState: needs_replacement / resolve_replacement; resolve_turn no-ops while a replacement is pending (no turn consumed, no free hit).
- New simgrid battle_ai module: Dumb / Greedy / Tactician. Tactician secures KOs with the weakest sufficient move, opens with a status move, and rotates a low-HP pet out of a bad type matchup when a resisting reserve exists.
- arpg server now drives enemy actions through battle_ai (Greedy), auto-replaces fainted enemy pets, and forces the player to pick a replacement after their own faint.

Follow-ups: PR 2 unified duel registry + NPC trainers, PR 3 PvP + client HUD phases."
```

---

## Self-Review Notes

- Spec section 1 covered by Tasks 1 (replacement phase, free action, resolve_turn guard) — the wire `phase` field is deliberately PR 3 (client) scope; PR 1's HUD contract works through the existing `awaiting` + info-line re-prompt.
- Spec section 2 covered by Tasks 2-4 (scoring, tiers, rotation, replacement choice, determinism).
- Section 7 engine/AI test list covered across Task 1/3/4 test steps.
- `check_outcome` widened to `pub(crate)` only for the Task 1 test; if clippy flags it, gate the test differently (call `resolve_turn` with a no-op action instead).
