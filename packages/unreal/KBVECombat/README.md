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

## Roadmap

- Element resist/weakness scaling (via KBVEGameplay stat modifiers + npcdb affinities).
- Attack/ability driver (windups, cooldowns, hitboxes) + an `IKBVECombatant` for Mass-backed NPCs.
- Threat/aggro + death loot/credit hooks (npcdb LootTable).
- Damage numbers / combat-event feed for UI.

## License

Part of the KBVE monorepo — see repo root.
