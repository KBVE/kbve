# KBVECombat

Shared combat domain for KBVE games — server-authoritative damage, teams/factions, and death — built on **KBVEGameplay** primitives. Backend-agnostic: Mover pawns, CMC characters, and Mass-backed NPC proxies all fight through one interface.

Depends on KBVEGameplay (never the reverse): combat _consumes_ the stat/effect primitives; it doesn't define them.

## Pieces

- **`UKBVECombatComponent`** — server-authoritative combat state on an actor. Resolves damage against the owner's **Health stat** via `IKBVEStatTarget` (`ApplyStatDelta(HealthStatId, -Amount)`), tracks `TeamId` + replicated dead state, fires `OnDamaged` / `OnDeath`. Implements `IKBVECombatant`.
- **`IKBVECombatant`** — `GetTeamId` / `IsAlive` / `ApplyDamage`. Any actor (or its combat component) participates uniformly regardless of movement backend.
- **`FKBVEDamageEvent`** — amount, `EKBVEDamageElement`, instigator, hit location/bone.
- **`UKBVECombatStatics`** — `ApplyDamage` / `IsAlive` / `GetTeamId` / `AreHostile`; resolves a combatant whether the actor implements `IKBVECombatant` directly or carries a `UKBVECombatComponent`.

## Usage

1. Enable the plugin (pulls KBVEGameplay).
2. Add `UKBVECombatComponent` to a pawn/character that implements `IKBVEStatTarget` with a `Health` stat (e.g. `AKBVEMoverPawn`, `AchuckCoreCharacter`). Set `TeamId`.
3. Deal damage from anywhere:

```cpp
FKBVEDamageEvent Dmg;
Dmg.Amount = 25.f;
Dmg.Element = EKBVEDamageElement::Fire;
Dmg.Instigator = Attacker;
UKBVECombatStatics::ApplyDamage(Target, Dmg);   // authority-only effect
```

Damage flows through the Health stat, so it composes with KBVEGameplay effects/modifiers and replicates via whatever transport the owner uses (Iris / KBVENet).

## Resist scaling

`UKBVECombatComponent.Resistances` is a list of `FKBVEElementAffinity` (element → multiplier; `<1` resist, `>1` weakness, `0` immune). Incoming damage is scaled by the matching element before hitting the Health stat. Games seed these from npcdb affinities.

## Attack / ability driver

`UKBVEAbilityComponent` holds `FKBVEAbilityDef`s (damage, element, range, AoE radius, windup, cooldown, friendly-fire). `TryActivate(AbilityId)` (authority) runs the windup, then resolves a hit — single line trace or AoE sphere overlap on `ECC_Pawn` — and applies damage to hostile combatants via `UKBVECombatStatics`. Cooldowns tracked per ability; one windup at a time.

## Threat / aggro

`UKBVEThreatComponent` auto-binds to the owner's `OnDamaged` and accumulates threat per instigator (`ThreatPerDamage`). AI reads `GetTopThreatTarget()` to choose who to fight. `AddThreat` / `ClearThreat` for manual control.

## Death loot

`UKBVELootComponent` auto-binds to `OnDeath`, rolls its `FKBVELootEntry` table (drop rate + quantity range) on the authority, and emits `OnLootDropped(Drops, Killer)` + an `XpReward`. The game spawns the actual pickups (KBVEItemDB) — combat stays decoupled from the item DB.

## Combat-event feed

`UKBVECombatFeedSubsystem` (per-world) collects `FKBVECombatFeedEntry` events (damage, death, ability) into a ring buffer and broadcasts `OnCombatEvent`. UI (damage numbers, combat log) subscribes. Combat/ability components push automatically.

## Roadmap

- **Multithreading pass** — make the damage/ability/threat paths Mass/job-friendly (batch damage application, blittable event structs, parallel threat updates) for large-scale combat.
- Mass-backed `IKBVECombatant` proxy so ECS NPCs fight without per-actor components.
- Combo/status-effect chains via KBVEGameplay stat modifiers.

## License

Part of the KBVE monorepo — see repo root.
