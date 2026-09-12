using Unity.Entities;

namespace RareIcon
{
    /// <summary>Update group for empire-scale strategic systems (player empire + city-states + future faction AI). Phase 0 hosts these in Unity ECS so the boundary is visible. Phase 1 will mirror state through an EmpireSnapshot proto so Phase 2 can offload unloaded-region city ticks to the Rust uniti tokio task. Anything tagged with this group is a candidate for Rust-side execution once chunk-load FFI matures.</summary>
    [UpdateInGroup(typeof(SimulationSystemGroup))]
    [UpdateAfter(typeof(BehaviorSystemGroup))]
    [UpdateBefore(typeof(EconomySystemGroup))]
    public partial class EmpireSystemGroup : ComponentSystemGroup { }
}
