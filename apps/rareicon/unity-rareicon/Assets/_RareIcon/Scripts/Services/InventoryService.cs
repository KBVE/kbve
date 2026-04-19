using System;
using RareIcon.Native;

namespace RareIcon
{
    /// <summary>
    /// Owns the Rust-side inventory and provides a safe API.
    /// Registered as singleton in RootLifetimeScope.
    /// ECS systems query this via VContainer injection.
    /// </summary>
    public class InventoryService : IDisposable
    {
        readonly NativeInventory _inventory;

        public InventoryService()
        {
            _inventory = new NativeInventory(32);
        }

        public NativeInventory Inventory => _inventory;

        public uint Add(ItemId item, uint quantity)
            => _inventory.Add((ushort)item, quantity);

        public uint Remove(ItemId item, uint quantity)
            => _inventory.Remove((ushort)item, quantity);

        public uint Count(ItemId item)
            => _inventory.Count((ushort)item);

        public bool HasRoom(ItemId item, uint quantity)
            => _inventory.HasRoom((ushort)item, quantity);

        public FfiSlot GetSlot(uint index)
            => _inventory.GetSlot(index);

        public uint SlotCount => _inventory.SlotCount();

        public void Dispose()
        {
            _inventory?.Dispose();
        }
    }
}
