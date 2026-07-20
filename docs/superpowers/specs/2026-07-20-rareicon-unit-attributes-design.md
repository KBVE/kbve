# RareIcon Unit Attributes — Design Spec

Date: 2026-07-20
Status: Draft for review

## Summary

Give every unit four rolled attributes — Strength, Agility, Intellect, Will — sourced from the npcdb proto base, varied per-character, persisted exactly across save/load, surfaced in the UI, and wired into the existing sim so they actually matter. Builds directly on the just-completed npcdb-proto migration: the base values already live in the proto (`NpcStats.strength/agility/intelligence/will`) and flow into `NPCDef`, but are never stored on entities or used. This spec makes them real.

Scope: **Layers 1–3 only** this pass (data → persistence → UI) — the foundation. Attributes roll, persist exactly, and display, with **zero behavior change**. Layer 4 (gameplay effects) is designed below for continuity but **deferred to a follow-up spec** once L1–L3 is built and verified.

## Layer 1 — Data: component + per-character roll

**Component.** New `UnitAttributes : IComponentData { byte Strength; byte Agility; byte Intellect; byte Will; }`. Byte is sufficient (values 1–255); dense, Burst-friendly, cheap to persist.

**Roll.** A shared pure helper:

```
static UnitAttributes RollAttributes(in NPCDef def, uint rng)
```

Each stat = `base × spread`, where `spread ∈ [0.8, 1.2]` (±20%), derived deterministically from distinct byte lanes of `rng` (same technique as the existing `speedJit = 0.8 + ((rng>>8)&0xFF)/255 * 0.4`). Result rounded, clamped to `[1, 255]`. Four independent lanes of `rng` (e.g. bytes 0–3) so the four stats vary independently. Base 0 stays 0 (e.g. a stat a creature legitimately lacks) — clamp floor is 1 only when base > 0.

**Attach.** Every spawn path in `UnitSpawnSystem` (`SpawnGoblinAt`, King, `SpawnAnimalAt`, skeleton, garrison variants) calls `RollAttributes(def, rngSeed)` and `em.AddComponentData(entity, attrs)`. One helper, all paths — no per-path divergence.

## Layer 2 — Persistence: exact round-trip (Rust/FFI)

Attributes are per-entity runtime state and MUST survive save/load unchanged (a goblin's numbers are its identity). Units have no stable id across reload — they are rebuilt from position-keyed ghost records — so the rolled values are stored in the record, not re-derived.

**Rust side (`packages/rust/bevy/uniti`).** Add `str`, `agi`, `int`, `will` (`u8` ×4) to the ghost-unit struct and its save/load path. Bump the persistence-format version; on read of an older record lacking the fields, signal "absent" so the Unity side rolls fresh once (graceful migration, no data loss for existing saves).

**Binding.** Regenerate `Assets/_RareIcon/Generated/Native/Uniti.g.cs` so `FfiGhostUnit` carries the four new fields.

**Unity side.** `UnitSpawnState` gains the four fields. `HexSpawnSystem` rehydrate: if the record has attributes, restore them exactly into `UnitAttributes`; if absent (old save), call `RollAttributes` with the same deterministic seed the rehydrate path already computes. Mirrors the existing `MaxHealth = g.max_health` restore pattern.

**Migration guard.** Reuse the persistence-version check so a pre-attributes save loads without error and gains rolled attributes on first load, then persists them thereafter.

## Layer 3 — UI

Surface STR / AGI / INT / WILL in the unit inspection panel (`UICitizensPanel`, the per-unit view). Four labeled stat rows alongside the existing health/energy readouts. UXML gets the four rows; the panel's refresh binds them from the selected entity's `UnitAttributes`. Read-only display this pass. Keep the visual language consistent with the existing stat rows (no new design system — extend what's there).

## Layer 4 — Gameplay effects (DEFERRED — future spec)

Not built this pass. Documented here so L1–L3 leaves the right seams. Each attribute hooks exactly one or two existing systems. All effects are multiplicative modifiers around the current baseline so a mid-value stat ≈ today's behavior (no global rebalance; the ±20% roll becomes the meaningful spread).

- **STR → melee damage + carry.** `AttachMeleeAttackIfArmed` scales the `Damage` it writes by a STR factor (normalized around a reference, e.g. `dmg × (0.5 + STR/refStr × 0.5)`). Pack carry capacity (slot count or weight budget) scales with STR. Touches combat attach + inventory.
- **AGI → move speed + harvest.** Fold AGI into `MoveSpeed` (replacing the flat `speedJit` with an AGI-derived factor so speed variance is attribute-driven, not free noise). `HarvestSystem.HarvestIntervalSec` (0.8s) scales down with AGI so nimble gatherers cycle faster.
- **INT → job aptitude + mana.** `ProfessionDispatchSystem` scoring gains a small INT-weighted bonus for skilled roles (Chef/Blacksmith/Craftsman/Mage) so smarter goblins self-select skilled work. `AttachSpellsIfMagical` scales `MaxMana` / mana regen with INT.
- **WILL → morale / needs resistance.** `NeedAccumulationSystem` scales hunger/fatigue accrual down with WILL; relief/flee thresholds (SeekingAid / ReturningToBase triggers) shift so high-WILL units push through hardship longer.

Effect formulas are tuned so the population average ≈ current values; the spread is what's new.

## Build order (this pass = L1–L3)

1. Layer 1 (component + roll + attach) — verifiable: spawn, inspect entity, see varied stats.
2. Layer 2 (persistence) — verifiable: save/load, stats identical.
3. Layer 3 (UI) — verifiable: panel shows them.

All three are zero-behavior-change; a regression is obvious. Layer 4 is a separate later spec.

## Risks & mitigations (L1–L3)

- **Persistence-format break.** Old saves must load. Mitigation: version bump + absent-field → roll-fresh path; explicit test loading a pre-attributes save.
- **Rust/FFI + regen friction.** Binding regen must match the struct. Mitigation: regenerate + confirm `FfiGhostUnit` field parity before wiring the Unity read.
- **Spawn-path coverage.** Every spawn path must attach `UnitAttributes`, or some units lack the component (UI null / persistence gap). Mitigation: single `RollAttributes` helper called from one shared attach point; audit all `Spawn*` methods.

## Testing (L1–L3)

- Roll: deterministic — same seed → same attributes; distribution within [0.8,1.2]×base; base 0 → 0.
- Persistence: round-trip test (spawn → save → load → assert identical); old-save migration test (pre-attributes save loads + gains rolled attrs).
- UI: panel renders four rows bound to the selected unit; updates on selection change.

## Out of scope (this pass)

- **Layer 4 gameplay effects** — separate follow-up spec once L1–L3 is verified.
- Attribute growth / leveling / XP (fixed at roll).
- Skills (future `skillsdb`), moods, traits, relationships (per the def-vs-runtime roadmap).
- Editing attributes from the UI (read-only display).
