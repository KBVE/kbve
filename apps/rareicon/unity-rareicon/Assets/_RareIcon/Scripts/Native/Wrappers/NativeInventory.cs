using System;

namespace RareIcon.Native
{
    /// <summary>
    /// Safe wrapper around the Rust inventory FFI.
    /// Owns the native handle and frees it on dispose.
    /// All methods are thread-safe — callable from DOTS worker threads.
    /// </summary>
    public unsafe class NativeInventory : IDisposable
    {
        void* _handle;
        bool _disposed;

        public bool IsValid => _handle != null && !_disposed;

        public NativeInventory(uint maxSlots)
        {
            _handle = Uniti.uniti_inventory_new(maxSlots);
        }

        public uint Add(ushort itemId, uint quantity)
        {
            return IsValid ? Uniti.uniti_inventory_add(_handle, itemId, quantity) : quantity;
        }

        public uint Remove(ushort itemId, uint quantity)
        {
            return IsValid ? Uniti.uniti_inventory_remove(_handle, itemId, quantity) : 0;
        }

        public uint Count(ushort itemId)
        {
            return IsValid ? Uniti.uniti_inventory_count(_handle, itemId) : 0;
        }

        public uint SlotCount()
        {
            return IsValid ? Uniti.uniti_inventory_slot_count(_handle) : 0;
        }

        public FfiSlot GetSlot(uint index)
        {
            if (!IsValid) return default;
            return Uniti.uniti_inventory_get_slot(_handle, index);
        }

        public bool HasRoom(ushort itemId, uint quantity)
        {
            return IsValid && Uniti.uniti_inventory_has_room(_handle, itemId, quantity) != 0;
        }

        public bool Swap(uint a, uint b)
        {
            return IsValid && Uniti.uniti_inventory_swap(_handle, a, b) != 0;
        }

        public bool Split(uint slot, uint quantity)
        {
            return IsValid && Uniti.uniti_inventory_split(_handle, slot, quantity) != 0;
        }

        public uint Merge(uint from, uint to)
        {
            return IsValid ? Uniti.uniti_inventory_merge(_handle, from, to) : 0;
        }

        public void Compact()
        {
            if (IsValid) Uniti.uniti_inventory_compact(_handle);
        }

        public void Clear()
        {
            if (IsValid) Uniti.uniti_inventory_clear(_handle);
        }

        public void Dispose()
        {
            if (!_disposed && _handle != null)
            {
                Uniti.uniti_inventory_free(_handle);
                _handle = null;
                _disposed = true;
            }
        }

        ~NativeInventory()
        {
            Dispose();
        }
    }
}
