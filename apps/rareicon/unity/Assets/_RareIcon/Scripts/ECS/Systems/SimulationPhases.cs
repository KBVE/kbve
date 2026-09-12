using Unity.Entities;

namespace RareIcon
{
    /// <summary>Player input and AI decisions. Writes MovementGoal and command components.</summary>
    [UpdateInGroup(typeof(SimulationSystemGroup))]
    public partial class BehaviorSystemGroup : ComponentSystemGroup { }

    /// <summary>Turns goals into positions: pathfinding, locomotion, spawn-request materialisation.</summary>
    [UpdateInGroup(typeof(SimulationSystemGroup))]
    [UpdateAfter(typeof(BehaviorSystemGroup))]
    public partial class MovementSystemGroup : ComponentSystemGroup { }

    /// <summary>Spatial hash, projectile-vs-unit collision, damage, and persistent status effects.</summary>
    [UpdateInGroup(typeof(SimulationSystemGroup))]
    [UpdateAfter(typeof(MovementSystemGroup))]
    public partial class CombatSystemGroup : ComponentSystemGroup { }

    /// <summary>Inventory + vital-stat flow: harvest, capital storage, sharing, eating, starvation.</summary>
    [UpdateInGroup(typeof(SimulationSystemGroup))]
    [UpdateAfter(typeof(CombatSystemGroup))]
    public partial class EconomySystemGroup : ComponentSystemGroup { }

    /// <summary>Reaps DeadTag entities; loot drops and death consequences hook in before destroy.</summary>
    [UpdateInGroup(typeof(SimulationSystemGroup))]
    [UpdateAfter(typeof(EconomySystemGroup))]
    public partial class CleanupSystemGroup : ComponentSystemGroup { }
}
