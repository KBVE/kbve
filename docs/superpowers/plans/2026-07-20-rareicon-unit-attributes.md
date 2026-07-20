# RareIcon Unit Attributes (L1–L3) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give every unit four rolled attributes (Strength/Agility/Intellect/Will) sourced from the npcdb proto base, varied ±20% per-character, persisted exactly across save/load, and displayed in the Citizens UI — with zero gameplay behavior change (Layer 4 effects are a separate later plan).

**Architecture:** A byte `UnitAttributes` IComponentData attached at spawn from a pure deterministic `AttributeRoll.Roll(def, rng)` helper. Values persist through the Rust `uniti` SQLite ghost store (new columns + schema bump + migration) and the regenerated FFI binding, restored exactly on rehydrate (roll-fresh only for pre-attributes saves). The Citizens panel gains four read-only stat rows.

**Tech Stack:** Unity DOTS/ECS (C#, Burst), Unity UI Toolkit (UXML), Rust (`uniti` crate, rusqlite FFI), the npcdb proto pipeline (already shipped).

## Global Constraints

- Attributes are byte (1–255); base 0 stays 0. Clamp floor is 1 only when base > 0.
- Spread ∈ [0.8, 1.2] (±20%), deterministic from `rng` byte lanes — same technique as existing `speedJit`.
- Every spawn path must attach `UnitAttributes` (17 `Spawn*` methods; delegating ones inherit).
- Persistence must not break old saves: bump `SCHEMA_VERSION` + `UNITI_FFI_SCHEMA_VERSION` (both currently 3 → 4), add a v3→v4 migration, absent attributes → roll fresh once on load.
- No gameplay behavior change: do NOT touch combat/harvest/dispatch/needs this plan. `speedJit` stays as-is (AGI folding is Layer 4).
- Follow existing patterns: `UnitAttributes` lives beside the other stat components in `ECS/Components/StatComponents.cs`.

---

## File Structure

- `Assets/_RareIcon/Scripts/ECS/Components/StatComponents.cs` — add `UnitAttributes` struct (modify).
- `Assets/_RareIcon/Scripts/Data/AttributeRoll.cs` — pure roll helper (create).
- `Assets/_RareIcon/Tests/AttributeRollTests.cs` — EditMode NUnit tests (create).
- `Assets/_RareIcon/Scripts/ECS/DB/Units/Systems/UnitSpawnSystem.cs` — attach at spawn + `UnitSpawnState` fields (modify).
- `packages/rust/bevy/uniti/src/ffi_world.rs` — ghost struct fields, schema bump, migration, save/load (modify).
- `packages/rust/bevy/uniti/tests/ffi_migration.rs` — persistence round-trip + migration test (modify).
- `Assets/_RareIcon/Generated/Native/Uniti.g.cs` — regenerated binding (generated).
- `Assets/_RareIcon/Scripts/ECS/Systems/HexSpawnSystem.cs` — rehydrate restore/roll-fresh (modify).
- `Assets/Resources/UI/Citizens.uxml` — four stat rows (modify).
- `Assets/_RareIcon/Scripts/UI/UICitizensPanel.cs` — bind rows from selected `UnitAttributes` (modify).

---

## Task 1: `UnitAttributes` component + deterministic roll helper

**Files:**

- Modify: `Assets/_RareIcon/Scripts/ECS/Components/StatComponents.cs`
- Create: `Assets/_RareIcon/Scripts/Data/AttributeRoll.cs`
- Test: `Assets/_RareIcon/Tests/AttributeRollTests.cs`

**Interfaces:**

- Produces: `struct UnitAttributes : IComponentData { byte Strength; byte Agility; byte Intellect; byte Will; }`
- Produces: `static UnitAttributes AttributeRoll.Roll(in NPCDef def, uint rng)`

- [ ] **Step 1: Add the component.** In `StatComponents.cs`, beside `Health`/`Energy`, add:

```csharp
    public struct UnitAttributes : IComponentData
    {
        public byte Strength;
        public byte Agility;
        public byte Intellect;
        public byte Will;
    }
```

- [ ] **Step 2: Write the failing test.** Create `Assets/_RareIcon/Tests/AttributeRollTests.cs` (assembly `RareIcon.Tests`):

```csharp
using NUnit.Framework;
using RareIcon;

public class AttributeRollTests
{
    static NPCDef Goblin() => new NPCDef(
        UnitType.Goblin, "creature.goblin", NPCCategory.Humanoid,
        40f, 100f, 30f, 100f, 100f, 0.7f, 0f, 5f, 0.5f, 0.285f, 0.20f,
        strength: 8, agility: 12, intellect: 4, will: 5, defaultWeapon: WeaponType.Club);

    [Test]
    public void Roll_MinNoise_IsEightyPercent()
    {
        var a = AttributeRoll.Roll(Goblin(), 0u);          // all lanes 0 -> 0.8x
        Assert.AreEqual(6, a.Strength);                    // round(8*0.8)=6
        Assert.AreEqual(10, a.Agility);                    // round(12*0.8)=10
    }

    [Test]
    public void Roll_MaxNoise_IsOneTwentyPercent()
    {
        var a = AttributeRoll.Roll(Goblin(), 0xFFFFFFFFu); // all lanes 255 -> 1.2x
        Assert.AreEqual(10, a.Strength);                   // round(8*1.2)=10
        Assert.AreEqual(14, a.Agility);                    // round(12*1.2)=14
    }

    [Test]
    public void Roll_IsDeterministic()
    {
        Assert.AreEqual(AttributeRoll.Roll(Goblin(), 12345u), AttributeRoll.Roll(Goblin(), 12345u));
    }

    [Test]
    public void Roll_ZeroBase_StaysZero()
    {
        var def = new NPCDef(UnitType.Chicken, "creature.chicken", NPCCategory.Beast,
            5f, 0f, 0f, 0f, 0f, 0.45f, 0f, 0f, 0f, 0f, 0f,
            strength: 0, agility: 10, intellect: 1, will: 1, defaultWeapon: WeaponType.None);
        var a = AttributeRoll.Roll(def, 0u);
        Assert.AreEqual(0, a.Strength);
    }
}
```

- [ ] **Step 3: Run it — verify it fails.** In Unity: Window → General → Test Runner → EditMode → Run. Expected: FAIL (`AttributeRoll` does not exist).

- [ ] **Step 4: Implement the helper.** Create `Assets/_RareIcon/Scripts/Data/AttributeRoll.cs`:

```csharp
using Unity.Mathematics;

namespace RareIcon
{
    /// <summary>Rolls per-character attributes from an NPCDef base, ±20% deterministic from rng byte lanes.</summary>
    public static class AttributeRoll
    {
        public static UnitAttributes Roll(in NPCDef def, uint rng) => new UnitAttributes
        {
            Strength  = Scale(def.Strength,  (byte)(rng         & 0xFF)),
            Agility   = Scale(def.Agility,   (byte)((rng >> 8)  & 0xFF)),
            Intellect = Scale(def.Intellect, (byte)((rng >> 16) & 0xFF)),
            Will      = Scale(def.Will,      (byte)((rng >> 24) & 0xFF)),
        };

        static byte Scale(byte b, byte noise)
        {
            if (b == 0) return 0;
            float spread = 0.8f + noise / 255f * 0.4f;   // [0.8, 1.2]
            int v = (int)math.round(b * spread);
            return (byte)math.clamp(v, 1, 255);
        }
    }
}
```

- [ ] **Step 5: Run tests — verify pass.** Test Runner → EditMode → Run. Expected: all 4 PASS.

- [ ] **Step 6: Commit.**

```bash
git add Assets/_RareIcon/Scripts/ECS/Components/StatComponents.cs Assets/_RareIcon/Scripts/Data/AttributeRoll.cs Assets/_RareIcon/Tests/AttributeRollTests.cs
git commit -m "feat(rareicon): UnitAttributes component + deterministic AttributeRoll"
```

---

## Task 2: Attach `UnitAttributes` at every spawn path

**Files:**

- Modify: `Assets/_RareIcon/Scripts/ECS/DB/Units/Systems/UnitSpawnSystem.cs`

**Interfaces:**

- Consumes: `AttributeRoll.Roll(in NPCDef, uint)` (Task 1).
- Produces: private `static void AttachAttributes(EntityManager em, Entity e, in NPCDef def, uint rngSeed, in UnitSpawnState state)` — restores exact values when `state.HasAttributes != 0`, else rolls.

- [ ] **Step 1: Add the shared attach helper.** In `UnitSpawnSystem`, near the other `Attach*` helpers, add:

```csharp
        static void AttachAttributes(EntityManager em, Entity e, in NPCDef def, uint rngSeed, in UnitSpawnState state)
        {
            var attrs = state.HasAttributes != 0
                ? new UnitAttributes { Strength = state.Strength, Agility = state.Agility, Intellect = state.Intellect, Will = state.Will }
                : AttributeRoll.Roll(def, rngSeed);
            em.AddComponentData(e, attrs);
        }
```

(`UnitSpawnState.HasAttributes`/`Strength`/… land in Task 5; add the four `byte` + `byte HasAttributes` fields to `UnitSpawnState` now as part of this step so the helper compiles — see the struct at `UnitSpawnSystem.cs:12`.)

- [ ] **Step 2: Call it in each independent spawn path.** After `def` is resolved and the entity created, add `AttachAttributes(em, entity, def, rngSeed, state);` in each of these methods (delegating methods `SpawnGuardGoblinAt`, `SpawnArcherSoldierAt` inherit via `SpawnGoblinAt` — do NOT double-add):
      `SpawnGoblinAt` (uses its `state` param), `SpawnKingAt`, `SpawnAnimalAt`, `SpawnBanditAt`, `SpawnScoutAt`, `SpawnCavalryAt`, `SpawnBanditScoutAt`, `SpawnZombieAt`, `SpawnSkeletonAt`, `SpawnBeastAt`, `SpawnFishingBoatAt`, `SpawnGalleyAt`, `SpawnPirateShipAt`, `SpawnWhaleAt`, `SpawnHeroAt`. For methods without a `state` param, pass `default` (rolls fresh).

- [ ] **Step 3: Verify compile + coverage.** In Unity, let it recompile (no errors). Enter Play mode, open the entity debugger (or add a temporary `Debug.Log` of `UnitAttributes` in a spawn), confirm spawned goblins carry non-zero varied STR/AGI/INT/WILL and two different goblins differ.

- [ ] **Step 4: Remove any temporary log; commit.**

```bash
git add Assets/_RareIcon/Scripts/ECS/DB/Units/Systems/UnitSpawnSystem.cs
git commit -m "feat(rareicon): roll + attach UnitAttributes on every spawn path"
```

---

## Task 3: Rust persistence — columns, schema bump, migration, save/load

**Files:**

- Modify: `packages/rust/bevy/uniti/src/ffi_world.rs`
- Test: `packages/rust/bevy/uniti/tests/ffi_migration.rs`

**Interfaces:**

- Produces: `FfiGhostUnit` (ffi_world.rs:56) gains `pub strength: u8, pub agility: u8, pub intellect: u8, pub will: u8`.
- Produces: SQLite `units` table gains `strength/agility/intellect/will INTEGER NOT NULL DEFAULT 0`; `SCHEMA_VERSION` and `UNITI_FFI_SCHEMA_VERSION` both 3 → 4.

- [ ] **Step 1: Write the failing test.** In `tests/ffi_migration.rs`, add a round-trip test that inserts a ghost unit with attributes, reloads, and asserts equality (mirror the existing `max_health` round-trip test in that file; reuse its harness). Assert `loaded.strength == 7` etc.

- [ ] **Step 2: Run it — verify fail.**

```bash
cd /Users/alappatel/Documents/GitHub/kbve
cargo test -p uniti --test ffi_migration 2>&1 | tail -20
```

Expected: FAIL (no `strength` field / column).

- [ ] **Step 3: Add struct fields.** In `ffi_world.rs`, add the four `u8` fields to `FfiGhostUnit` (:56) and to the internal persisted row struct (:105, alongside `health`/`health_max`).

- [ ] **Step 4: Bump schema + add columns.** Set `const SCHEMA_VERSION: i64 = 4;` (:332) and `pub const UNITI_FFI_SCHEMA_VERSION: u32 = 4;` (:1015). In the `CREATE TABLE` (:360) add `strength INTEGER NOT NULL DEFAULT 0, agility …, intellect …, will …`.

- [ ] **Step 5: Add the v3→v4 migration.** In the migration block (:461 template), add: when stored version < 4, `ALTER TABLE units ADD COLUMN strength INTEGER NOT NULL DEFAULT 0;` (×4). Default 0 = "absent" sentinel → Unity rolls fresh.

- [ ] **Step 6: Wire save/load.** SELECT (:557) + `row.get` (:575) read the four columns; INSERT (:762/:783) writes `u.strength` etc. Keep column order consistent between SELECT and INSERT.

- [ ] **Step 7: Run tests — verify pass.**

```bash
cargo test -p uniti 2>&1 | tail -20
```

Expected: PASS (round-trip + existing tests green).

- [ ] **Step 8: Commit.**

```bash
git add packages/rust/bevy/uniti/src/ffi_world.rs packages/rust/bevy/uniti/tests/ffi_migration.rs
git commit -m "feat(uniti): persist unit attributes — schema v4 + migration + round-trip"
```

---

## Task 4: Regenerate the FFI binding

**Files:**

- Generated: `Assets/_RareIcon/Generated/Native/Uniti.g.cs`

**Interfaces:**

- Consumes: the Rust `FfiGhostUnit` from Task 3.
- Produces: `FfiGhostUnit` (C#) with `strength/agility/intellect/will` byte fields matching the Rust layout.

- [ ] **Step 1: Regenerate.** Run the binding generator the crate uses (cbindgen/uniffi — check `packages/rust/bevy/uniti/` build scripts / `Cargo.toml` for the codegen command; e.g. `cargo build -p uniti` if a build script emits the header, then the C# gen step). Confirm the exact command from the crate README before running.

- [ ] **Step 2: Verify field parity.**

```bash
grep -n "strength\|agility\|intellect\|will" apps/rareicon/unity-rareicon/Assets/_RareIcon/Generated/Native/Uniti.g.cs
```

Expected: the four fields present on the C# `FfiGhostUnit`, byte type, after `max_health`.

- [ ] **Step 3: Commit.**

```bash
git add apps/rareicon/unity-rareicon/Assets/_RareIcon/Generated/Native/Uniti.g.cs
git commit -m "chore(rareicon): regenerate uniti FFI binding for attribute fields"
```

---

## Task 5: `UnitSpawnState` + rehydrate restore

**Files:**

- Modify: `Assets/_RareIcon/Scripts/ECS/DB/Units/Systems/UnitSpawnSystem.cs` (`UnitSpawnState` at :12)
- Modify: `Assets/_RareIcon/Scripts/ECS/Systems/HexSpawnSystem.cs` (rehydrate loop ~:420–445)

**Interfaces:**

- Consumes: `FfiGhostUnit` fields (Task 4), `AttachAttributes` (Task 2).
- Produces: `UnitSpawnState` carries `byte Strength, Agility, Intellect, Will, HasAttributes`.

- [ ] **Step 1: Confirm the `UnitSpawnState` fields exist** (added in Task 2 Step 1). If not present, add `public byte Strength, Agility, Intellect, Will; public byte HasAttributes;` to the struct at `UnitSpawnSystem.cs:12`.

- [ ] **Step 2: Populate from the ghost record.** In `HexSpawnSystem` rehydrate, where `UnitSpawnState` is built from `g` (~:433), add:

```csharp
                            Strength = g.strength, Agility = g.agility, Intellect = g.intellect, Will = g.will,
                            HasAttributes = (byte)((g.strength | g.agility | g.intellect | g.will) != 0 ? 1 : 0),
```

(Absent columns are DEFAULT 0 from the migration → `HasAttributes = 0` → `AttachAttributes` rolls fresh once, then persists thereafter.)

- [ ] **Step 3: Verify in-editor round-trip.** Play → note a specific goblin's STR/AGI/INT/WILL (via inspector/log) → trigger a save + reload (focus-lost flush + reload, per the persistence flush hook) → confirm the same goblin shows identical attributes.

- [ ] **Step 4: Verify old-save migration.** Load a pre-change save (schema v3): confirm it loads without error and units gain rolled attributes (non-zero), which then persist on the next save.

- [ ] **Step 5: Commit.**

```bash
git add apps/rareicon/unity-rareicon/Assets/_RareIcon/Scripts/ECS/DB/Units/Systems/UnitSpawnSystem.cs apps/rareicon/unity-rareicon/Assets/_RareIcon/Scripts/ECS/Systems/HexSpawnSystem.cs
git commit -m "feat(rareicon): restore UnitAttributes exactly on rehydrate, roll-fresh for old saves"
```

---

## Task 6: Citizens UI — four stat rows

**Files:**

- Modify: `Assets/Resources/UI/Citizens.uxml`
- Modify: `Assets/_RareIcon/Scripts/UI/UICitizensPanel.cs`

**Interfaces:**

- Consumes: `UnitAttributes` on the selected entity.

- [ ] **Step 1: Confirm the per-unit host + selected-entity source.** In `UICitizensPanel.cs`, find where a selected citizen's existing stats (health/energy) are rendered (the per-unit content built under `citizens-content`). If per-unit stats are not yet shown here, target the panel/tab that displays a selected unit and read its entity. Note the resolved element names before editing.

- [ ] **Step 2: Add four rows to `Citizens.uxml`.** Under the per-unit stat container, add four labeled rows following the existing stat-row markup pattern (copy an existing health/energy row's structure), with names `attr-str`, `attr-agi`, `attr-int`, `attr-will` and static labels STR/AGI/INT/WILL.

- [ ] **Step 3: Bind them.** In the panel's per-unit refresh, resolve the selected entity's gameplay world (via KingTag/tag scan helper, NOT `DefaultGameObjectInjectionWorld` — see the NetCode world-split gotcha), read `UnitAttributes`, and set each row's value label. Guard when the entity lacks the component (fallback "—").

- [ ] **Step 4: Verify in-editor.** Play → open Citizens → select a unit → confirm STR/AGI/INT/WILL show and match the unit's rolled values; select a different unit → values update.

- [ ] **Step 5: Commit.**

```bash
git add apps/rareicon/unity-rareicon/Assets/Resources/UI/Citizens.uxml apps/rareicon/unity-rareicon/Assets/_RareIcon/Scripts/UI/UICitizensPanel.cs
git commit -m "feat(rareicon): show unit STR/AGI/INT/WILL in Citizens panel"
```

---

## Self-Review

- **Spec coverage:** L1 (component+roll) → Tasks 1–2; L2 (persistence) → Tasks 3–5; L3 (UI) → Task 6. Migration/old-save risk → Task 3 Step 5 + Task 5 Step 4. Spawn-path coverage risk → Task 2 Step 2 (enumerated). All L1–L3 spec sections covered.
- **Type consistency:** `UnitAttributes{Strength,Agility,Intellect,Will}` byte throughout; `AttributeRoll.Roll(in NPCDef, uint)` used in Tasks 2/5; `UnitSpawnState` attribute fields introduced in Task 2 Step 1 and reused in Task 5; `FfiGhostUnit` fields named `strength/agility/intellect/will` in Rust (Task 3) and C# (Task 4).
- **Placeholders:** Tasks 4 Step 1 and 6 Step 1 require confirming the binding-gen command and the exact UI host at execution — flagged explicitly because those are environment facts to read, not guesses to bake in. No silent TBDs elsewhere.
