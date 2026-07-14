# ARPG Pet Duels — Design

Date: 2026-07-05
Scope: Pokemon-style pet duels (NPC trainers + PvP), enemy AI faint-swap fix, smarter AI with rotation. Persistence (vitals commit-back, capture — issue #13801) explicitly deferred.

## Background

Pet battles today: debug HUD button starts a 5v5 mechamutt mirror vs a greedy server AI. Engine is a pure deterministic reducer in `packages/rust/simgrid/src/battle.rs`; wiring + AI in `apps/agones/arpg/server/src/game.rs`; client animation/UI in `apps/agones/arpg/web/src/game/ui/D2Hud.tsx` with wire types in `packages/npm/laser/src/lib/net/protocol.ts`.

**Confirmed bug**: `resolve_turn` skips a side's entire action when its active combatant is dead — including `Swap`. The AI correctly emits `Swap` after a faint but the engine drops it, so the enemy is stuck on a fainted pet for the rest of the battle.

## Decisions

- Teams: real persisted `PetRoster` snapshots (fresh full-HP copies at duel start), no commit-back this round. Empty roster falls back to minted team.
- NPC duels: world trainer NPCs, walk up + interact.
- PvP: proximity challenge with accept/decline prompt; ~30s turn timer auto-picks on timeout; disconnect = forfeit.
- AI: heuristic scorer with difficulty tiers (Dumb / Greedy / Tactician).
- Architecture: single unified duel registry for PvE trainer, PvP, and debug battles.

## 1. Engine fixes (`simgrid/src/battle.rs`)

- Dead active may still `Swap`; `Move` / `UseItem` / `Run` remain blocked while fainted.
- Forced replacement is a free action: after `resolve_turn`, if a side's active fainted with living reserves, the battle enters an `AwaitingReplacement(side)` phase. The replacement swap does not consume a turn and grants no free hit. New phase field on the wire (choose-action / choose-replacement / over).
- `BattleState` is already symmetric (`versus` takes two teams); PvP needs no further engine change. Side naming stays player/enemy internally; the wire layer maps each viewer to `player`.

## 2. AI module (new `simgrid/src/battle_ai.rs`)

Pure: `choose_action(state, side, difficulty, rng) -> BattleAction`. Deterministic from battle seed.

- Move scoring: expected damage = power × type multiplier × STAB × accuracy; prefer moves that secure a KO; status moves scored situationally (early turns, target unstatused).
- Preservation swap: considered when active HP < 25% AND matchup is bad (incoming ≥ 2× or own best ≤ 0.5×) AND a reserve resists the opponent's element; swap chosen only if score meaningfully beats best move.
- Replacement on faint: pick the reserve with the best matchup vs the opponent's active, not first-alive.
- Tiers: `Dumb` = random PP move, never proactive swap; `Greedy` = current strongest-move behavior + best-matchup replacement; `Tactician` = full scorer + preservation swaps.

## 3. Duel registry + server wiring (`game.rs`)

```rust
enum DuelSide { Human { slot: u16 }, Npc { trainer_ref: String, difficulty: AiDifficulty } }
struct Duel { state: BattleState, a: DuelSide, b: DuelSide,
              committed: [Option<BattleAction>; 2], deadline_tick: u32 }
ActiveDuels { by_id: HashMap<u32, Duel>, by_slot: HashMap<u16, u32> }
```

- `by_slot`: O(1) turn-input routing + disconnect cleanup; a slot may be in at most one duel.
- Per tick, per duel: NPC sides commit instantly via `battle_ai`; when both sides committed → `resolve_turn`, stream per-viewer snapshots, reset deadline. Deadline passed → auto-commit missing human action (Dumb policy) and resolve. Deadline also covers the replacement phase (timeout picks first living reserve). Deadline ≈ `30 * SIM_TICK_HZ`.
- Disconnect: extend `cleanup_stale_pet_battles` — despawned slot forfeits; opponent receives a won outcome view; duel removed. No vitals commit (deferred).
- Debug mirror button becomes a duel vs `Npc { mechamutt, Greedy }`; the old dedicated path is deleted.

## 4. NPC trainers in world

- Trainer defs (name, team of species refs + levels, difficulty) authored alongside existing NPC data, following the current `NPC_DB` source format (MDX pipeline if that is the source of truth).
- Spawned through the existing creature spawn path with a `Trainer` marker component: non-aggro, stationary.
- Interact within range → client sends duel request with target entity → server validates range + trainer not busy → creates duel; trainer marked busy for its duration.

## 5. PvP challenge flow

- Interact near another player → `Input::DuelChallenge { target_slot }`. Server validates range and that neither side is in a duel; stores a pending challenge expiring ~20s; streams a prompt to the target.
- `Input::DuelRespond { accept }` → server re-validates → duel created from both rosters. Decline or expiry → challenger notified.
- No movement lock: battle is a modal UI overlay; movement input ignored while in battle. Range is checked at challenge time only.

## 6. Client / HUD

- Protocol (`laser/protocol.ts` + `simgrid/proto.rs`): inputs `DuelChallenge`, `DuelRespond`, trainer interact; `PetBattleState` gains `phase` + `deadlineMs`; new ephemeral `DuelPrompt` (challenger name, expiry).
- Challenge UI in `D2Hud.tsx`: toast prompt with Accept/Decline + countdown; challenger sees a waiting state.
- `PetBattleScene` reused for all duel kinds; additions: turn-timer bar, forced-swap mode (`phase = replace` opens swap-only menu, no cancel), opponent name header.
- Interact targeting: nearest eligible target (trainer NPC or player) within radius; scene sends the input matching target kind.

## 7. Testing + error handling

- Engine: fainted active can swap; move/item blocked while fainted; replacement phase consumes no turn; battle ends only on team wipe.
- AI: super-effective preferred over raw power; preservation swap fires at low HP + bad matchup; best-matchup replacement; Dumb never proactively swaps; deterministic per seed.
- Server: both-committed resolves; timeout auto-commits; disconnect forfeits and notifies; one duel per slot; challenge expiry.
- Errors: engine validates illegal actions (bad slot, dead reserve, no PP); server re-streams the current view so clients cannot desync. Unknown trainer ref / empty roster → minted-team fallback with a warn log.
- Manual: build via `./kbve.sh -nx`, two local clients complete a PvP duel and a trainer duel.

## Out of scope

- Vitals commit-back, capture, rewards/XP from duels (#13801 follow-up).
- Matchmaking, ranked, spectating, wagers.
- Movement lock / battle arenas in world space.
