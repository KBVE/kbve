# ARPG Pet Duels PR3 — PvP Challenge Flow + Client HUD Phases Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Player-vs-player pet duels via proximity challenge with accept/decline prompt and expiry, plus the client battle HUD phases — turn-timer bar, forced-swap mode, opponent name header (spec §5-6 of `docs/superpowers/specs/2026-07-05-arpg-pet-duels-design.md`).

**Architecture:** Two new appended `Input` variants (`DuelChallenge`, `DuelRespond`) route to one pending resource; a `PendingDuelChallenges`-style expiring offer store mirrors the trade module. Accepted challenges create a `Duel` with two `Human` sides — the PR2 registry (commit model, deadline, forfeit, per-viewer mirroring) already handles the rest. `PetBattleState` gains three appended wire fields (`phase`, `deadline_ms`, `opponent`); a new `DuelPrompt` ephemeral (kind 21) drives an interactive Accept/Decline overlay.

**Tech Stack:** Rust (bevy ECS, postcard), simgrid duel registry (PR2), TypeScript (laser wire mirror, React HUD).

## Global Constraints

- Worktree: `/Users/alappatel/Documents/GitHub/kbve-worktrees/arpg-pet-duels-pvp`, branch `arpg-pet-duels-pvp` (from origin/dev, which contains merged PR1+PR2). Never touch the main repo checkout.
- PR base: `dev`.
- Commands via nx from worktree root: `pnpm nx test simgrid`, `pnpm nx lint simgrid`, `pnpm nx test arpg-server`, `pnpm nx build arpg-server`, `pnpm nx lint arpg-server`, `pnpm nx run arpg-web:typecheck`, laser targets (`pnpm nx run laser:test`, `laser:lint`).
- NO inline `//` comments. Terse `///` doc comments only where the surrounding file uses them. NO Claude co-author trailer.
- Randomness only via `simgrid::rng::stream` / `mix32`. No wall clock in sim code.
- **Postcard is positional.** New `Input` variants are appended AFTER `ChallengeNpc` (the current last variant); their indices are locked by roundtrip tests asserting the first encoded byte (`ChallengeNpc` locks 33, so `DuelChallenge`=34, `DuelRespond`=35 — the Rust test is the source of truth; the TS `writeInput` branches must write the same variant numbers). New `PetBattleState` fields are appended AFTER `can_run`, in this exact order: `phase: String`, `deadline_ms: u32`, `opponent: String` — mirrored at the same positions in `decodePetBattleState` and the TS interface. If any golden hex fixture (Rust `proto.rs` wire-lock tests or TS `postcard-wire.spec.ts`) pins affected bytes, regenerate it and say so in the report.
- `DuelSide::Human` gains a `name: String` field (display name) — a deliberate PR3 refactor so `viewer_view` can render opponent headers without external lookups.
- Phase strings on the wire: `"action"`, `"replace"`, `"over"` — exact values, client matches on them.
- Challenge expiry: `DUEL_CHALLENGE_TICKS: u32 = 20 * simgrid::SIM_TICK_HZ` (~20s). `deadline_ms` computed as `ticks_remaining.saturating_mul(50)` (blackjack `net.rs:60-63` precedent; `1000 / SIM_TICK_HZ = 50`).
- One duel per slot AND at most one pending challenge per participant (challenger or target) at a time.
- Deviation from spec §6, approved: interact stays pointer-click (matching the existing corpse/trainer click pattern); the KeyE nearest-eligible-target selector is deferred until keyboard interact gets a send handler at all.

---

### Task 1: Wire — `DuelChallenge` + `DuelRespond` inputs, `DuelPrompt` ephemeral, `PetBattleState` appended fields

**Files:**
- Modify: `packages/rust/simgrid/src/proto.rs` (Input enum — append after `ChallengeNpc`; ephemeral const; `DuelPrompt` struct; `PetBattleState` fields; tests)
- Modify: `packages/rust/simgrid/src/sim.rs` (one new pending resource + routing arms + pass-through arm + build_app insert; check the `DeployQueues` SystemParam 16-param ceiling — use ONE combined resource to stay under it)
- Modify: `packages/rust/simgrid/src/lib.rs` (re-exports)
- Modify (compile fixes only): `apps/agones/arpg/server/src/game.rs` `battle_view` and `apps/agones/arpg/server/src/duel.rs` `viewer_view` construct `PetBattleState` literals — Task 2 reworks them properly; in THIS task make them compile with placeholder values `phase: String::new(), deadline_ms: 0, opponent: String::new()` so simgrid tests run green.

**Interfaces:**
- Produces:

```rust
    /// Challenge another player to a pet duel. Server validates range and that
    /// neither side is busy. Appended last so serde variant indices of the
    /// existing inputs are unchanged.
    DuelChallenge {
        target: PlayerSlot,
    },
    /// Accept or decline the pending duel challenge addressed to this player.
    /// Appended last so serde variant indices of the existing inputs are
    /// unchanged.
    DuelRespond {
        accept: bool,
    },
```

```rust
pub const EPHEMERAL_DUEL_PROMPT: u16 = 21;

pub const DUEL_PROMPT_OFFER: u8 = 0;
pub const DUEL_PROMPT_DECLINED: u8 = 1;
pub const DUEL_PROMPT_EXPIRED: u8 = 2;
pub const DUEL_PROMPT_ACCEPTED: u8 = 3;

/// A pet duel challenge notice: `status` is a `DUEL_PROMPT_*` constant. Sent to
/// the target as the offer (with the challenger's name + time to respond) and
/// back to the challenger when the offer is declined, expires, or is accepted.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct DuelPrompt {
    pub status: u8,
    pub other_slot: u16,
    pub other_name: String,
    pub deadline_ms: u32,
}
```

`PetBattleState` — append after `can_run` (exact order):

```rust
    pub phase: String,
    pub deadline_ms: u32,
    pub opponent: String,
```

sim.rs — ONE combined resource (keeps `DeployQueues` param count flat):

```rust
#[derive(Resource, Default)]
pub struct PendingDuelOps {
    pub challenges: Vec<(proto::PlayerSlot, proto::PlayerSlot)>,
    pub responses: Vec<(proto::PlayerSlot, bool)>,
}
```

Routing arms next to `ChallengeNpc`: `Input::DuelChallenge { target } => deploy.duel_ops.challenges.push((slot, target)),` and `Input::DuelRespond { accept } => deploy.duel_ops.responses.push((slot, accept)),`. Add both to the pass-through match arm that lists `SimPetBattle | PetTurn | ChallengeNpc`. `.insert_resource(PendingDuelOps::default())` in `build_app`. Re-export `PendingDuelOps`, `DuelPrompt`, `EPHEMERAL_DUEL_PROMPT`, and the `DUEL_PROMPT_*` consts from lib.rs following the existing lists.

- [ ] **Step 1: Write the failing tests** (proto.rs tests, next to `challenge_npc_input_roundtrips`)

```rust
#[test]
fn duel_challenge_input_roundtrips() {
    let input = Input::DuelChallenge { target: PlayerSlot(7) };
    let bytes = encode_inner(&input).expect("encode");
    assert_eq!(bytes[0], 34);
    let decoded: Input = decode_inner(&bytes).expect("decode");
    assert!(matches!(decoded, Input::DuelChallenge { target: PlayerSlot(7) }));
}

#[test]
fn duel_respond_input_roundtrips() {
    let input = Input::DuelRespond { accept: true };
    let bytes = encode_inner(&input).expect("encode");
    assert_eq!(bytes[0], 35);
    let decoded: Input = decode_inner(&bytes).expect("decode");
    assert!(matches!(decoded, Input::DuelRespond { accept: true }));
}

#[test]
fn duel_prompt_roundtrips() {
    let p = DuelPrompt {
        status: DUEL_PROMPT_OFFER,
        other_slot: 3,
        other_name: "ann".into(),
        deadline_ms: 20_000,
    };
    let bytes = encode_inner(&p).expect("encode");
    let decoded: DuelPrompt = decode_inner(&bytes).expect("decode");
    assert_eq!(decoded, p);
}
```

Copy the encode/decode helper usage from `challenge_npc_input_roundtrips` verbatim. If the index assertions fail because `ChallengeNpc` is not 33 in this tree, set the asserted bytes to `challenge_npc_index + 1` and `+ 2` (encode `Input::ChallengeNpc` in the test to read its first byte) and record the actual values in the report — Task 4's TS mirror MUST use the same numbers.

- [ ] **Step 2: Run tests to verify they fail** — `cargo test -p simgrid duel_` → FAIL (variants not found).

- [ ] **Step 3: Implement** everything in the Interfaces block above, plus the placeholder compile-fixes in game.rs `battle_view` / duel.rs `viewer_view` literals. Check whether the pet-battle golden hex tests in proto.rs (or elsewhere) construct a `PetBattleState` — if so update them for the appended fields; the PetBattleReplay fixtures should be untouched (different struct).

- [ ] **Step 4: Run tests**

Run: `pnpm nx test simgrid && pnpm nx lint simgrid && pnpm nx build arpg-server && pnpm nx test arpg-server`
Expected: all green (arpg-server compiles with placeholders; existing duel tests still pass).

- [ ] **Step 5: Commit**

```bash
git add packages/rust/simgrid/src/proto.rs packages/rust/simgrid/src/sim.rs packages/rust/simgrid/src/lib.rs apps/agones/arpg/server/src/game.rs apps/agones/arpg/server/src/duel.rs
git commit -m "feat(simgrid): duel challenge/respond inputs, duel prompt ephemeral, battle phase wire fields"
```

---

### Task 2: Server — phase/deadline/opponent populated; `DuelSide::Human` gains name

**Files:**
- Modify: `apps/agones/arpg/server/src/duel.rs` (DuelSide, viewer_view, stream_duel_views, tick_duels, cleanup_stale_duels, apply_npc_challenges, tests)
- Modify: `apps/agones/arpg/server/src/game.rs` (battle_view signature, apply_pet_battles, apply_pet_turns)

**Interfaces:**
- Consumes: Task 1's appended `PetBattleState` fields.
- Produces (later tasks + client rely on):
  - `DuelSide::Human { slot: u16, name: String }` (all constructors updated; `side_index_of_slot`/`stale_human_sides` match arms updated).
  - `game::battle_view(state, events, deadline_ms: u32, opponent: &str) -> PetBattleState` — sets `phase`: `"over"` if outcome != Ongoing, else `"replace"` if `state.needs_replacement(Side::Player)`, else `"action"`; sets `deadline_ms` and `opponent`.
  - `duel::viewer_view(duel, viewer_idx, events, now_tick) -> PetBattleState` — per-viewer phase (`"replace"` iff `needs_replacement(engine_side(viewer_idx))`), `deadline_ms = duel.deadline_tick.saturating_sub(now_tick).saturating_mul(50)` (0 when over), `opponent` = other side's display name (`Human.name` or `Npc.name`).
  - `duel::stream_duel_views(bcast, duel, events, now_tick)` — extra `now_tick` param; all call sites pass `clock.tick`.
  - `tick_duels` info line becomes replacement-aware: when the deadline forced a replacement, push `"Time's up — a replacement was sent out."` instead of the move line (fixes the PR2 minor).
- Username source at duel creation: `simgrid::SpawnedSlots.by_slot: HashMap<u16, (Entity, String)>` — the String is the username. Debug battle: use the player's username too (fallback `"you"` unused; `Training Bot` opponent unchanged).

- [ ] **Step 1: Write the failing tests** (duel.rs tests; adapt the existing `pve_duel()` fixture to the new `Human { slot, name }` shape)

```rust
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
```

Add a `pvp_duel()` fixture: same teams as `pve_duel()` but sides `[Human { slot: 3, name: "ann".into() }, Human { slot: 4, name: "bob".into() }]`.

- [ ] **Step 2: Run to verify failure** — `pnpm nx test arpg-server` → FAIL (signatures).

- [ ] **Step 3: Implement.** Key code:

duel.rs `viewer_view` rework (replaces the current base-copy approach for the new fields):

```rust
fn side_display_name(side: &DuelSide) -> &str {
    match side {
        DuelSide::Human { name, .. } => name,
        DuelSide::Npc { name, .. } => name,
    }
}

pub fn viewer_view(
    duel: &Duel,
    viewer_idx: usize,
    events: &[simgrid::proto::PetBattleWireEvent],
    now_tick: u32,
) -> simgrid::proto::PetBattleState {
    let ongoing = duel.state.outcome == simgrid::BattleOutcome::Ongoing;
    let deadline_ms = if ongoing {
        duel.deadline_tick.saturating_sub(now_tick).saturating_mul(50)
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
```

(If struct-update syntax fights the partial moves, build the viewer-1 literal field-by-field as today — the requirement is the final field values, not the syntax.)

game.rs `battle_view`: add `deadline_ms: u32, opponent: &str` params; `phase` = `"over"`/`"replace"` (needs_replacement(Player)) /`"action"`; `opponent: opponent.to_string()`. Its only callers are `viewer_view` and (after this task) nothing else — update all.

`stream_duel_views(bcast, duel, events, now_tick)` — pass `now_tick` through to `viewer_view`. Update every caller (`apply_pet_battles`, `apply_pet_turns`, `tick_duels`, `apply_npc_challenges`) to pass `clock.tick`; `cleanup_stale_duels` streams via `viewer_view` directly — pass its clock too (add `Res<SimClock>` param there).

`tick_duels` replacement-aware line: `force_deadline` returns replacement events (contains a `SwapIn`) or turn events — detect via `raw.iter().any(|e| matches!(e, simgrid::BattleEvent::SwapIn { .. })) && duel.state.turn == turn_before` or simpler: capture `turn_before = duel.state.turn` before the call; if unchanged, the deadline forced a replacement → push `"Time's up — a replacement was sent out."`, else the move line.

`DuelSide::Human { slot, name }`: update `ActiveDuels::create`/`remove`, `side_index_of_slot`, `stale_human_sides`, `stream_duel_views`, `cleanup_stale_duels` match arms, and both creation sites (`apply_pet_battles`, `apply_npc_challenges`) — fetch the username from `Res<simgrid::SpawnedSlots>` (`spawned.by_slot.get(&slot.0).map(|(_, n)| n.clone()).unwrap_or_default()`). Remove the `#[allow(dead_code)]` on `Npc.name` — it is now read by `side_display_name`.

- [ ] **Step 4: Run tests**

Run: `pnpm nx test arpg-server && pnpm nx test simgrid && pnpm nx build arpg-server && pnpm nx lint arpg-server`
Expected: all green; existing duel tests updated for the new Human shape still pass.

- [ ] **Step 5: Commit**

```bash
git add apps/agones/arpg/server/src/duel.rs apps/agones/arpg/server/src/game.rs
git commit -m "feat(arpg): battle views carry phase, deadline, and opponent name"
```

---

### Task 3: Server — PvP challenge lifecycle

**Files:**
- Modify: `apps/agones/arpg/server/src/duel.rs` (challenge store, three systems, helpers, tests)
- Modify: `apps/agones/arpg/server/src/main.rs` (register systems in the duel chain)

**Interfaces:**
- Consumes: `simgrid::PendingDuelOps` (Task 1), `DuelPrompt`/`EPHEMERAL_DUEL_PROMPT`/`DUEL_PROMPT_*`, `SpawnedSlots`, trade-module precedent (`TradeSession` expiry in `packages/rust/simgrid/src/trade/session.rs` + `expire_trades` in `trade/system.rs:17-41`).
- Produces:

```rust
pub const DUEL_CHALLENGE_TICKS: u32 = 20 * simgrid::SIM_TICK_HZ;

pub struct DuelChallenge {
    pub challenger: u16,
    pub target: u16,
    pub expires_tick: u32,
}

#[derive(bevy::prelude::Resource, Default)]
pub struct PendingDuels(pub Vec<DuelChallenge>);

pub fn challenge_involving(pending: &PendingDuels, slot: u16) -> Option<usize>;
pub fn send_duel_prompt(bcast, to_slot: u16, status: u8, other_slot: u16, other_name: &str, deadline_ms: u32);
pub fn apply_duel_challenges(...);   // drains PendingDuelOps.challenges
pub fn apply_duel_responses(...);    // drains PendingDuelOps.responses
pub fn expire_duel_challenges(...);  // per-tick retain + notify
```

- [ ] **Step 1: Write the failing tests** (pure helpers; system logic is covered by the smoke in Task 6)

```rust
#[test]
fn challenge_involving_finds_either_side() {
    let mut p = PendingDuels::default();
    p.0.push(DuelChallenge { challenger: 1, target: 2, expires_tick: 100 });
    assert_eq!(challenge_involving(&p, 1), Some(0));
    assert_eq!(challenge_involving(&p, 2), Some(0));
    assert_eq!(challenge_involving(&p, 3), None);
}
```

- [ ] **Step 2: Run to verify failure**, then **Step 3: Implement.**

`apply_duel_challenges` (params: `Res<Outbound>`, `Res<SimClock>`, `ResMut<simgrid::PendingDuelOps>`, `ResMut<PendingDuels>`, `Res<ActiveDuels>`, `Res<simgrid::SpawnedSlots>`, `Query<(&simgrid::PlayerSlotTag, &simgrid::GridPos)>`). For each drained `(challenger, target)`:
- reject silently if `challenger == target`;
- skip if either slot is in `duels.by_slot` or `challenge_involving(&pending, slot)` hits for either;
- both slots must be in `spawned.by_slot`;
- both positions found in the query and `within_challenge_range(a.tile, b.tile)`;
- push `DuelChallenge { challenger, target, expires_tick: clock.tick.saturating_add(DUEL_CHALLENGE_TICKS) }`;
- `send_duel_prompt(&bcast, target, DUEL_PROMPT_OFFER, challenger, &challenger_name, DUEL_CHALLENGE_TICKS.saturating_mul(50))` — challenger_name from `spawned.by_slot`.

`send_duel_prompt` encodes a `DuelPrompt` via `encode_inner` and sends `ServerEvent::Ephemeral { kind: EPHEMERAL_DUEL_PROMPT, to: PlayerSlot(to_slot), payload }` (copy `send_battle_view`'s shape).

`apply_duel_responses` (adds `ResMut<ActiveDuels>`, `simgrid::PetBank`, roster query `Query<(&PlayerSlotTag, Option<&simgrid::PetRoster>, &simgrid::GridPos)>`, `Commands` not needed): for each drained `(slot, accept)`:
- find `challenge_involving` where `target == slot.0` (only the target may respond); remove it from the vec;
- if `!accept`: `send_duel_prompt(challenger, DUEL_PROMPT_DECLINED, slot.0, &target_name, 0)`; continue;
- re-validate: neither in `duels.by_slot`, both still in `spawned.by_slot` (range is NOT re-checked — spec §5: range at challenge time only);
- build both teams: `roster_team` else `mechamutt_team` fallback (same pattern as `apply_npc_challenges`);
- `root = simgrid::rng::mix32(&[0xD0E7_D0E7, challenger as u32, slot.0 as u32, clock.tick])`;
- sides `[Human { slot: challenger, name: challenger_name }, Human { slot: target, name: target_name }]`, `deadline_tick = clock.tick.saturating_add(DUEL_TURN_TICKS)`;
- `send_duel_prompt(challenger, DUEL_PROMPT_ACCEPTED, target, &target_name, 0)`;
- opening info `format!("{target_name} accepts — the duel begins!")`, `duels.create` + `stream_duel_views(..., clock.tick)`.

`expire_duel_challenges`: mirror `expire_trades` — retain challenges where both participants still in `spawned.by_slot` AND `clock.tick < expires_tick`; for each dropped one send `DUEL_PROMPT_EXPIRED` to the challenger (and to the target if the drop was expiry, so their overlay closes).

main.rs chain becomes:

```rust
            (
                duel::apply_npc_challenges,
                duel::apply_duel_challenges,
                duel::apply_duel_responses,
                game::apply_pet_battles,
                game::apply_pet_turns,
                duel::tick_duels,
                duel::cleanup_stale_duels,
                duel::expire_duel_challenges,
            )
                .chain()
                .after(simgrid::SimSet::Input),
```

plus `app.insert_resource(duel::PendingDuels::default())` next to the `ActiveDuels` insert.

Note: `apply_pet_turns` and `cleanup_stale_duels`/`tick_duels`/`force_deadline` need NO PvP changes — the registry already resolves when both humans commit, auto-commits idle humans at the deadline, and forfeits disconnects with a survivor won-view. Do not modify them beyond Task 2's signature threading.

- [ ] **Step 4: Run tests**

Run: `pnpm nx test arpg-server && pnpm nx build arpg-server && pnpm nx lint arpg-server`
Expected: green.

- [ ] **Step 5: Commit**

```bash
git add apps/agones/arpg/server/src/duel.rs apps/agones/arpg/server/src/main.rs
git commit -m "feat(arpg): pvp duel challenges with accept/decline prompt and expiry"
```

---

### Task 4: Client wire — TS mirror for inputs, DuelPrompt, PetBattleState fields

**Files:**
- Modify: `packages/npm/laser/src/lib/net/postcard-wire.ts` (`writeInput` two branches; `decodePetBattleState` appended reads; new `decodeDuelPrompt`)
- Modify: `packages/npm/laser/src/lib/net/protocol.ts` (`Input` union; `PetBattleState` interface fields; `DuelPrompt` interface; `EPHEMERAL_DUEL_PROMPT` + `DUEL_PROMPT_*` consts if the file carries ephemeral consts — follow where `EPHEMERAL_PET_BATTLE_STATE` lives)
- Modify: `packages/npm/laser/src/lib/net/game-client.ts` (dispatch branch, event map entry, `duelChallenge`/`duelRespond` senders)

**Interfaces:**
- Consumes: variant indices locked by Task 1's Rust tests (34/35 unless Task 1's report says otherwise — read `.superpowers/sdd/task-1-report.md`), `DuelPrompt` field order `(status u8, other_slot u16→varint, other_name string, deadline_ms u32)`, `PetBattleState` appended order `(phase string, deadline_ms u32, opponent string)`.
- Produces: `client.duelChallenge(target: number)`, `client.duelRespond(accept: boolean)`, `'duelPrompt': DuelPrompt` bus event; `PetBattleState` TS interface gains `phase: string; deadlineMs: number; opponent: string` (camelCase on the TS side matching how `decodePetBattleState` names existing fields — check and follow, e.g. `p_active` stays snake_case there; match the file's convention exactly and record it).

- [ ] **Step 1: writeInput branches** after the `ChallengeNpc` branch, copying its style:

```ts
	} else if ('DuelChallenge' in input) {
		w.variant(34);
		w.u32(input.DuelChallenge.target);
	} else if ('DuelRespond' in input) {
		w.variant(35);
		w.bool(input.DuelRespond.accept);
```

(`PlayerSlot(u16)` — check how existing writers encode a u16/PlayerSlot; postcard varint means `w.u32` is byte-compatible for u16 values, but MATCH whatever helper the reader/writer pair uses elsewhere — check `readPlayerSlot`/writer counterparts; if a `w.bool` helper doesn't exist, use the file's boolean write convention from another variant.)

- [ ] **Step 2: decodePetBattleState** — append after the `can_run` read, exactly: `phase = r.string()`, `deadlineMs = r.u32()`, `opponent = r.string()`; add to the returned object. **decodeDuelPrompt**: `status = r.u8()`, `otherSlot = r.u32()` (varint), `otherName = r.string()`, `deadlineMs = r.u32()`; return typed object; follow `decodePetBattleState`'s null-on-error convention.

- [ ] **Step 3: game-client.ts** — `else if (evt.kind === EPHEMERAL_DUEL_PROMPT)` → decode → `this.bus.emit('duelPrompt', data)`; add `duelPrompt: DuelPrompt` to `GameClientEventMap`; senders:

```ts
	duelChallenge(target: number) {
		this.sendInputs([{ DuelChallenge: { target } }]);
	}

	duelRespond(accept: boolean) {
		this.sendInputs([{ DuelRespond: { accept } }]);
	}
```

- [ ] **Step 4: Verify** — `pnpm nx run laser:test && pnpm nx run laser:lint && pnpm nx run arpg-web:typecheck`. If `postcard-wire.spec.ts` pins a PetBattleState hex fixture, regenerate it to include the three appended fields (values matching a Rust-encoded sample — derive from the Rust test if one exists).

- [ ] **Step 5: Commit**

```bash
git add packages/npm/laser/src/lib/net/postcard-wire.ts packages/npm/laser/src/lib/net/protocol.ts packages/npm/laser/src/lib/net/game-client.ts
git commit -m "feat(laser): duel challenge wire mirror and battle phase fields"
```

---

### Task 5: Client UI — challenge prompt overlay, click-to-challenge, HUD phases

**Files:**
- Modify: `apps/agones/arpg/web/src/game/systems/hud.ts` (duelPrompt + duelRespond + duelChallenge emit/on pairs, following the pet battle trio at hud.ts:181-227)
- Modify: `apps/agones/arpg/web/src/game/ui/D2Hud.tsx` (new `DuelPromptOverlay` component mounted beside `PetBattleDebug`; `PetBattleScene` phase additions)
- Modify: `apps/agones/arpg/web/src/game/input/sceneInput.ts` (click-on-player branch)
- Modify: the scene wiring file that bridges game-client bus events to hud emits (find where `petBattleState` is bridged — likely `IsoArpgScene.ts` — and bridge `duelPrompt` the same way; also expose `duelChallenge`/`duelRespond` through the same deps path `challengeNpc` uses)

**Interfaces:**
- Consumes: Task 4's client API; `PetBattleState.phase`/`deadlineMs`/`opponent`; `Cat.Player` + `deps.store.owner(eid)` + `deps.mySlot()` (see sceneInput's owned-env branch for mySlot usage).
- Produces: player-facing behavior —
  1. Click another player within range 2 → `duelChallenge(slot)`; out of range → walk toward them (mirror the trainer branch shape at sceneInput.ts:169-183, using `Cat.Player` + `owner !== mySlot` instead of the kind-ref check).
  2. Target sees an interactive overlay: "{name} challenges you to a pet duel!", Accept / Decline buttons, countdown bar from `deadlineMs` (local `Date.now()` anchor on receipt — UI code, wall clock fine). Accept → `emitBattleEnter({kind:'pet'})` + `duelRespond(true)` and the overlay closes (battle opens via the normal `petBattleState` flow). Decline → `duelRespond(false)`. Expiry (countdown hits 0 or an `EXPIRED` prompt arrives) → overlay closes.
  3. Challenger gets passive toasts via the existing `emitNotification` (`hud.ts:398-407` + Toasts.tsx): "Challenge sent to {name}", "{name} declined", "Challenge expired", and on `ACCEPTED` → `emitBattleEnter({kind:'pet'})` so the battle overlay opens for them.
  4. `PetBattleScene`: opponent header (render `state.opponent` above/beside the enemy battler); turn-timer bar (thin horizontal bar above the action menu, width% = remaining/initial, re-anchored on every new `state` via `useEffect` on `state.deadlineMs`, wall clock fine in UI); `phase === 'replace'` → force the swap menu open with NO back button, hide moves/potion/run (current swap list at D2Hud.tsx:670-691 — reuse it, gate the "↩ Back" on `state.phase !== 'replace'`); `phase === 'over'` → existing over handling unchanged.

- [ ] **Step 1: hud.ts** — add `DUEL_PROMPT_EVENT`/`DUEL_RESPOND_EVENT`/`DUEL_CHALLENGE_EVENT` consts + emit/on pairs copying the `PetBattleRequest`/`Action` pattern exactly.

- [ ] **Step 2: Scene bridge** — where the scene subscribes `client.on('petBattleState', ...)` and re-emits via `emitPetBattleState`, add `client.on('duelPrompt', p => emitDuelPrompt(p))`; where `onPetBattleAction` is consumed to call `client.petTurn`, add `onDuelRespond(accept => client.duelRespond(accept))` and `onDuelChallenge(slot => client.duelChallenge(slot))` (sceneInput may call `deps.client()?.duelChallenge` directly like `challengeNpc` does — prefer direct call, matching the trainer branch; then only the respond path needs the hud bridge).

- [ ] **Step 3: sceneInput player branch** — insert after the trainer branch:

```ts
		const cat = deps.kinds.cat(deps.store.kind(hit.serverEid));
		if (cat === Cat.Player && deps.store.owner(hit.serverEid) !== deps.mySlot()) {
			if (d <= 2) {
				deps.client()?.duelChallenge(deps.store.owner(hit.serverEid));
			} else {
				walkToward(hit);
			}
			return true;
		}
```

Adapt names to the file's actual locals (the trainer branch is the template — same `d` computation, same walk-else pattern, same return discipline). Verify `Cat.Player` is the right cat check (see store.ts:32-38) and `deps.mySlot()` exists in this deps object (the owned-env reclaim branch uses it).

- [ ] **Step 4: D2Hud.tsx** — `DuelPromptOverlay` (model on `PetBattleDebug`'s subscribe→state→overlay shape): local `prompt: DuelPrompt | null`; `onDuelPrompt` handler — `OFFER` when I'm target → show; `DECLINED`/`EXPIRED`/`ACCEPTED` → challenger-side toasts via `emitNotification` + close if open; countdown via `requestAnimationFrame` or 250ms interval; Accept/Decline buttons wired to `emitDuelRespond(true/false)` (+ `emitBattleEnter` on accept). Style: reuse the existing overlay/panel classes PetBattleScene uses (inspect its container styles) — no new CSS system. PetBattleScene changes per the Produces block.

- [ ] **Step 5: Verify + commit**

Run: `pnpm nx run arpg-web:typecheck && pnpm nx run laser:test`
Expected: clean.

```bash
git add apps/agones/arpg/web/src/game/systems/hud.ts apps/agones/arpg/web/src/game/ui/D2Hud.tsx apps/agones/arpg/web/src/game/input/sceneInput.ts <scene bridge file>
git commit -m "feat(arpg): duel challenge overlay, click-to-challenge, battle timer and forced-swap hud"
```

---

### Task 6: Full verification + smoke + PR

- [ ] **Step 1: Full sweep**

```bash
pnpm nx test simgrid && pnpm nx lint simgrid && pnpm nx test arpg-server && pnpm nx build arpg-server && pnpm nx lint arpg-server && pnpm nx run laser:test && pnpm nx run arpg-web:typecheck
```

- [ ] **Step 2: Headless PvP smoke (main session, not subagent)** — no-auth server + TWO ws clients (extend the scratchpad petsmoke crate): ann and bob join, ann walks adjacent to bob, ann sends `DuelChallenge{bob}`; assert bob receives a `DuelPrompt` OFFER with ann's name; bob `DuelRespond{true}`; both receive opening `PetBattleState` with `opponent` set to the other's name and `phase == "action"`; both send moves for 2 turns (assert each turn resolves only after BOTH commit); one client stops sending → assert the 30s deadline auto-commits; KO a pet → fainted side sees `phase == "replace"` and a swap unblocks it; then disconnect one client mid-duel → survivor receives a won view. Also: decline path (fresh challenge, `DuelRespond{false}` → challenger gets DECLINED) and expiry path (challenge, wait ~21s → EXPIRED). Regression: trainer walk-up duel still opens (reuse trainer_smoke).

- [ ] **Step 3: Push + PR**

```bash
git push -u origin arpg-pet-duels-pvp
gh pr create --base dev --title "feat(arpg): pvp pet duels — challenge flow + battle hud phases" --body "..."
```

Body: PvP challenge lifecycle (offer/accept/decline/expiry, one pending per participant, range at challenge time only), phase/deadline/opponent wire fields, HUD (prompt overlay, timer bar, forced-swap mode, opponent header), smoke results. Refs #13801. NO Claude co-author footer/link.
