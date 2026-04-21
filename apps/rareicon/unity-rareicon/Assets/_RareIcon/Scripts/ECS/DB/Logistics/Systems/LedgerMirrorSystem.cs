using Unity.Entities;

namespace RareIcon
{
    /// <summary>Phase 5 (Phase C+): mirrors committed CurrentAmounts back into per-entity DynamicBuffer views. Disabled in Phase A — the old InventoryTransferApplierSystem is still authoritative over the buffers.</summary>
    [UpdateInGroup(typeof(LogisticsSystemGroup))]
    [UpdateAfter(typeof(LedgerCommitSystem))]
    public partial struct LedgerMirrorSystem : ISystem
    {
        public void OnCreate(ref SystemState state)
        {
            state.Enabled = false;
        }

        public void OnUpdate(ref SystemState state) { }
    }
}
