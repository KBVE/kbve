using Unity.Entities;

namespace RareIcon
{
    /// <summary>Runs before EconomySystemGroup: clears per-frame logistics state (Phase 0 lifecycle) so producers emit into empty containers.</summary>
    [UpdateInGroup(typeof(SimulationSystemGroup))]
    [UpdateBefore(typeof(EconomySystemGroup))]
    [UpdateAfter(typeof(CombatSystemGroup))]
    public partial class LogisticsBeginGroup : ComponentSystemGroup { }

    /// <summary>Runs after EconomySystemGroup: resolves, reduces, commits, applies packs, mirrors to buffer views.</summary>
    [UpdateInGroup(typeof(SimulationSystemGroup))]
    [UpdateAfter(typeof(EconomySystemGroup))]
    public partial class LogisticsEndGroup : ComponentSystemGroup { }
}
