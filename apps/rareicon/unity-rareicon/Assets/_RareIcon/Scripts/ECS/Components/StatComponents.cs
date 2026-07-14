using Unity.Entities;

namespace RareIcon
{
    /// <summary>HP pool. Value ≤ 0 → DeadTag gets added by StatsRegenSystem / DamageSystem. Ghost-replicated so clients render health bars / death transitions from authoritative server state.</summary>
    [Unity.NetCode.GhostComponent]
    public struct Health : IComponentData
    {
        [Unity.NetCode.GhostField(Quantization = 100)] public float Value;
        [Unity.NetCode.GhostField(Quantization = 100)] public float Max;
    }

    /// <summary>Stamina pool — actions (walking, combat, harvest) drain it; passive regen is modulated by Hunger and Fatigue.</summary>
    public struct Energy : IComponentData
    {
        public float Value;
        public float Max;
    }

    /// <summary>Spell-casting resource. Only attached to magical creatures.</summary>
    public struct Mana : IComponentData
    {
        public float Value;
        public float Max;
    }

    /// <summary>Food deficit. 0 = full, Max = starving. Refilled by ConsumeFoodExecutor; ticked up by NeedAccumulationSystem.</summary>

    public struct Hunger : IComponentData
    {
        public float Value;
        public float Max;
        public float PerSecond;
    }

    /// <summary>Sleep debt. 0 = rested, Max = exhausted. Drained by SleepExecutor at the Capital; ticked up while awake.</summary>

    public struct Fatigue : IComponentData
    {
        public float Value;
        public float Max;
        public float PerSecond;
    }

    public struct HealthRegen : IComponentData { public float PerSecond; }
    public struct EnergyRegen : IComponentData { public float PerSecond; }
    public struct ManaRegen   : IComponentData { public float PerSecond; }

    /// <summary>Marker for entities at 0 Health — cleanup/loot systems react before destroy.</summary>
    public struct DeadTag : IComponentData { }

    /// <summary>Marker for units actively sleeping at a safe location; SleepExecutor manages add/remove.</summary>
    public struct SleepingTag : IComponentData { }

    /// <summary>Tracks how long a unit has been at maximum Hunger; past the grace period StarvationSystem drains Health.</summary>
    public struct StarvationTimer : IComponentData
    {
        public float TimeStarving;
    }
}
