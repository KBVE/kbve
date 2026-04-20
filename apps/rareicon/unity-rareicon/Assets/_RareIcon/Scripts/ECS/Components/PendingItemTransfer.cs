using Unity.Entities;

namespace RareIcon
{
    /// <summary>Deferred additive/subtractive InventorySlot write. Parallel jobs emit one PendingItemTransfer entity per inventory delta via ECB.ParallelWriter; InventoryTransferApplierSystem iterates them single-threaded at a sync point and folds them into the Target's real InventorySlot. Enables parallel execution of systems that would otherwise race on a shared Capital / Barracks / Farm buffer. Not suitable for operations that need atomic success-check at emit time (combat ammo consumption, food pickup) — those still need the reservation/claim path.</summary>
    public struct PendingItemTransfer : IComponentData
    {
        public Entity Target;
        public ushort ItemId;
        public int    Delta;
    }
}
