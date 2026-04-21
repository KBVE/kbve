using Unity.Entities;

namespace RareIcon
{
    /// <summary>Runs the logistics four-phase pipeline (Lifecycle, Reservation, Resolve, Reduce, Commit, Mirror) before EconomySystemGroup.</summary>
    [UpdateInGroup(typeof(SimulationSystemGroup))]
    [UpdateBefore(typeof(EconomySystemGroup))]
    [UpdateAfter(typeof(CombatSystemGroup))]
    public partial class LogisticsSystemGroup : ComponentSystemGroup { }
}
