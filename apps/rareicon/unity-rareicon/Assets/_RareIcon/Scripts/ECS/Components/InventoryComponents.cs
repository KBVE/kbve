using Unity.Entities;

namespace RareIcon
{
    /// <summary>
    /// Singleton tag — the entity that owns the player inventory.
    /// The actual inventory data lives in Rust via NativeInventory.
    /// </summary>
    public struct PlayerInventoryTag : IComponentData { }

    /// <summary>
    /// Cached slot data synced from Rust each frame.
    /// Attached as a buffer to the inventory entity.
    /// </summary>
    [InternalBufferCapacity(32)]
    public struct InventorySlotElement : IBufferElementData
    {
        public ushort ItemId;
        public uint Quantity;
    }

    /// <summary>
    /// Tracks how many slots are occupied. Updated by the sync system.
    /// </summary>
    public struct InventoryState : IComponentData
    {
        public uint SlotCount;
        public uint MaxSlots;
    }
}
