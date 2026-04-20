using Unity.Entities;

namespace RareIcon
{
    // Core gameplay stats — composed by presence (a goblin has Health + Energy
    // but no Mana; a wizard adds Mana; a tree might just have Health). Each
    // entity carries only the stats it actually has, so DOTS archetypes group
    // similar entities together and systems iterate exactly what they need.

    /// <summary>Hit points. Reaching 0 (or below) is the death trigger.</summary>
    public struct Health : IComponentData
    {
        public float Value;
        public float Max;
    }

    /// <summary>Stamina for actions (attacks, sprints, etc.).</summary>
    public struct Energy : IComponentData
    {
        public float Value;
        public float Max;
    }

    /// <summary>Spell-casting resource. Only on entities with magic.</summary>
    public struct Mana : IComponentData
    {
        public float Value;
        public float Max;
    }

    // Regen / decay components. Negative PerSecond = decay (poison, hunger,
    // mana drain, etc.). Only entities that regen carry these — the regen
    // system queries the stat + matching regen pair, so it never touches
    // entities without them.

    public struct HealthRegen : IComponentData { public float PerSecond; }
    public struct EnergyRegen : IComponentData { public float PerSecond; }
    public struct ManaRegen   : IComponentData { public float PerSecond; }

    /// <summary>
    /// Marker added when an entity's Health drops to 0. Decouples "took
    /// fatal damage" from "what to do about it" (loot, respawn, animation,
    /// destroy) — separate systems handle each consequence.
    /// </summary>
    public struct DeadTag : IComponentData { }

    /// <summary>
    /// Attached to any entity whose Energy has hit 0 — StarvationSystem
    /// increments TimeStarving each frame while they stay at zero, and
    /// after a grace period starts draining Health. The component stays
    /// on the entity even after Energy recovers (we just reset the
    /// timer) so later bouts don't pay the add-component cost again.
    /// </summary>
    public struct StarvationTimer : IComponentData
    {
        public float TimeStarving; // seconds since Energy last hit 0
    }
}
