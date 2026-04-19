using Unity.Entities;

namespace RareIcon
{
    /// <summary>
    /// Per-entity inventory slot. Stored as a DynamicBuffer&lt;InventorySlot&gt;
    /// on any entity that holds items — goblin, future player, chest, shop NPC,
    /// dropped-item pile. ItemId values match the project-wide ItemId enum
    /// (which mirrors the Rust RareItem enum, ushort-wide).
    ///
    /// InternalBufferCapacity(8) keeps up to 8 stack types inline in the
    /// chunk (no heap alloc) — fits most goblin / NPC inventories. Spills
    /// to heap automatically if more types are added.
    /// </summary>
    [InternalBufferCapacity(8)]
    public struct InventorySlot : IBufferElementData
    {
        public ushort ItemId;   // matches RareIcon.ItemId enum
        public ushort Count;
    }

    /// <summary>
    /// Burst-friendly add/remove helpers on the inventory buffer. All callers
    /// (HarvestSystem, future trade / crafting / drop systems) go through
    /// these so stacking semantics stay consistent.
    /// </summary>
    public static class InventoryBufferExtensions
    {
        /// <summary>
        /// Add `count` of `itemId` to the buffer. Stacks onto an existing
        /// slot if one exists for the item; otherwise appends a new slot.
        /// (Stack-max enforcement comes later via ItemDB lookup; for now
        /// stacks are unbounded.)
        /// </summary>
        public static void AddItem(this DynamicBuffer<InventorySlot> buffer, ushort itemId, ushort count)
        {
            if (count == 0) return;

            for (int i = 0; i < buffer.Length; i++)
            {
                if (buffer[i].ItemId == itemId)
                {
                    var slot = buffer[i];
                    slot.Count = (ushort)(slot.Count + count);
                    buffer[i] = slot;
                    return;
                }
            }

            buffer.Add(new InventorySlot { ItemId = itemId, Count = count });
        }

        /// <summary>
        /// Remove up to `count` of `itemId`. Returns the actual amount
        /// removed (could be less than requested). Empty slots are pruned.
        /// </summary>
        public static ushort RemoveItem(this DynamicBuffer<InventorySlot> buffer, ushort itemId, ushort count)
        {
            for (int i = 0; i < buffer.Length; i++)
            {
                if (buffer[i].ItemId != itemId) continue;

                var slot = buffer[i];
                ushort taken = slot.Count <= count ? slot.Count : count;
                slot.Count = (ushort)(slot.Count - taken);
                if (slot.Count == 0)
                    buffer.RemoveAt(i);
                else
                    buffer[i] = slot;
                return taken;
            }
            return 0;
        }

        /// <summary>Total count of `itemId` currently in the buffer.</summary>
        public static ushort CountOf(this DynamicBuffer<InventorySlot> buffer, ushort itemId)
        {
            for (int i = 0; i < buffer.Length; i++)
                if (buffer[i].ItemId == itemId) return buffer[i].Count;
            return 0;
        }
    }
}
