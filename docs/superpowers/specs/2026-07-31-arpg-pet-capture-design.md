# ARPG pet capture — design

Phase E of [#14948](https://github.com/KBVE/kbve/issues/14948), the last piece of the pet
ownership loop. Phases A–C put the roster on the wire and gave it a hub; phase D made battle
damage and PP persist. Nothing yet **adds** a pet: `PetBank::add` is still reached only by the
join restore, so every roster is empty and every duel falls back to a minted mechamutt team.

## The gap capture actually has to close

Capture is usually framed as "add a catch roll", but the roll is the small part. The real
blocker is that **nothing catchable exists in the world**:

- `mechamutt` is the only species in npcdb with `pet.catchable = true`, and it is never
  spawned — it exists only as battle teams built by `mechamutt_team` and `trainer_team`.
- The NPCs that do stream (`goblin`, `apex_predator`, wyverns) have no `pet` block.
- Both existing battle entries are wrong targets: a trainer's pets belong to the trainer, and
  PvP pets belong to another player.

So phase E is three things, in order: a **wild pet** in the world, a **wild duel** to enter,
and a **catch** that can end it.

## Decisions

**Encounter: wild pet spawns.** A catchable species streams into the world like predators do,
and walking up starts a 1v1 wild duel. Chosen over adding catch to trainer duels (stealing an
NPC's pet, and every capture would be a trainer-level clone) and over marking goblins catchable
(turns hostile ARPG mobs into party members, and needs a movepool authored per species).

**Wild duels reuse the duel registry.** No new battle path. The wild side is an AI-controlled
`DuelSide::Npc` with no trainer entity; what makes it catchable is a new `Duel.wild` field
carrying the wild entity, its species ref and level. Adding a `DuelSide::Wild` variant instead
would touch `viewer_view`, `forfeit`, `side_display_name` and `finish_duel` for no gain.

**Catch resolves inside the engine.** `battle.rs` documents itself as the only battle truth,
and a catch consumes a turn and can end the battle, so it belongs there rather than in the duel
layer. A new `BattleAction::Catch { rate }` rolls from the existing turn stream
(`rng::stream(root, PETBATTLE, &[turn])`), so a replay of the same duel catches on the same
turn — no new RNG domain, and nothing for the client to predict.

**The roll.** Pokemon-shaped, deliberately simple until it needs tuning:

```
effective = capture_rate * (1 - 2/3 * hp/max_hp) * status_bonus
caught    = roll_u8() < clamp(effective, 1, 255)
```

Full-health pets are hard, weakened pets are much easier, and a status (sleep/paralysis
equivalents already in `PetStatus`) multiplies. `capture_rate` comes from npcdb, so tuning a
species is a data edit, not a code change.

**A ball is consumed per attempt, not per success.** A new itemdb item (`pet-ball`) is spent
whether or not the roll lands — that is what makes weakening the target matter. No ball, no
attempt: the action is refused before the turn resolves.

**Roster cap 6, checked before the throw.** A full roster refuses the attempt and keeps the
ball, mirroring how phase D refuses to burn an elixir on a healthy pet. Storage beyond six
(a box) is out of scope; the refusal message says the roster is full rather than implying a box
exists.

**A caught pet is minted from the wild pet's live battle state**, not freshly from the species:
it keeps the level, the damage it took, and the PP it spent. Phase D made those persist, so a
capture that healed the pet on the way in would contradict it.

## Shape of the work

| Piece                                                                               | Where                              |
| ----------------------------------------------------------------------------------- | ---------------------------------- |
| `WildPet` component, `wild_pet_spec`, `stream_wild_pets`                            | `arpg/server/src/wild.rs` (new)    |
| `Duel.wild`, wild duel start on walk-up                                             | `arpg/server/src/duel.rs`          |
| `BattleAction::Catch`, `BattleEvent::Caught`/`CatchFailed`, `BattleOutcome::Caught` | `simgrid/src/battle.rs`            |
| `PET_ACT_CATCH`, `PB_CAUGHT`, `PB_CATCH_FAILED` wire codes                          | `simgrid/src/proto.rs` + TS mirror |
| Mint into roster on `Caught`, despawn the wild entity                               | `arpg/server/src/duel.rs`          |
| `pet-ball` item, ball count in the battle UI, Catch button                          | itemdb MDX + `D2Hud.tsx`           |
| `PET_ROSTER_MAX`, full-roster refusal                                               | `simgrid/src/pets.rs`              |

## Acceptance

- A wild pet streams near the player, and walking up starts a 1v1 duel labelled as wild
- Catch is offered only in wild duels, only with a ball in the inventory
- A failed attempt consumes the ball and lets the wild pet act; a successful one ends the battle
- A caught pet appears in the hub at the level and vitals it was caught at, and survives a
  rejoin exactly once — not lost, not duplicated
- Catching with six pets already owned refuses the attempt and keeps the ball
- The same duel replayed from the same root catches on the same turn

## Deliberately not in scope

Boxes beyond the roster cap, ball tiers, catch animations beyond the two wire events, breeding,
and shinies. Trainer duels stay uncatchable.
