using Unity.Entities;

namespace RareIcon
{
    /// <summary>Read-only generic helpers over any DynamicBuffer&lt;T&gt; whose element implements IItemSlot (InventorySlot, PackSlot, future ContainerSlot). Burst-compatible via the "struct T with interface constraint" monomorphization path documented in the Burst 1.8 C# type support page — every concrete T generates its own specialization, interface method calls resolve statically, no virtual dispatch. Kept to reads only in this pass; mutating helpers (merge/deposit/pickup) stay duplicated until we confirm Burst is happy with the read path.</summary>
    public static class ItemSlotOps
    {
        /// <summary>Sum of Count across all slots that match itemId.</summary>
        public static int CountOf<T>(in DynamicBuffer<T> buf, ushort itemId)
            where T : unmanaged, IBufferElementData, IItemSlot
        {
            int total = 0;
            for (int i = 0; i < buf.Length; i++)
            {
                var s = buf[i];
                if (s.GetItemId() == itemId) total += s.GetCount();
            }
            return total;
        }

        /// <summary>Sum of Count across every slot whose item has EnergyValue > 0 (edible).</summary>
        public static int CountFood<T>(in DynamicBuffer<T> buf)
            where T : unmanaged, IBufferElementData, IItemSlot
        {
            int total = 0;
            for (int i = 0; i < buf.Length; i++)
            {
                var s = buf[i];
                if (s.GetCount() == 0) continue;
                if (ItemDB.EnergyValue(s.GetItemId()) <= 0f) continue;
                total += s.GetCount();
            }
            return total;
        }

        /// <summary>True if any non-zero slot holds an edible (EnergyValue &gt; 0) item.</summary>
        public static bool HasFood<T>(in DynamicBuffer<T> buf)
            where T : unmanaged, IBufferElementData, IItemSlot
        {
            for (int i = 0; i < buf.Length; i++)
            {
                var s = buf[i];
                if (s.GetCount() == 0) continue;
                if (ItemDB.EnergyValue(s.GetItemId()) > 0f) return true;
            }
            return false;
        }

        /// <summary>Burst-safe food-count using the runtime ItemDBSingleton instead of the managed ItemDB lookup. Used inside jobs that can't touch the managed dictionary.</summary>
        public static int CountFoodBurst<T>(in DynamicBuffer<T> buf, in ItemDBSingleton db)
            where T : unmanaged, IBufferElementData, IItemSlot
        {
            int total = 0;
            for (int i = 0; i < buf.Length; i++)
            {
                var s = buf[i];
                if (s.GetCount() == 0) continue;
                if (db.EnergyValue(s.GetItemId()) <= 0f) continue;
                total += s.GetCount();
            }
            return total;
        }

        /// <summary>True if the buffer covers `amount` of the given cost line. costId may be a concrete ItemId or the AnyFood sentinel — matching logic lives in BuildingDB so callers from BuildingSpawn / BuildPreview / UIBuildingPalette stay consistent.</summary>
        public static bool HasBuildCost<T>(in DynamicBuffer<T> buf, ushort costId, ushort amount)
            where T : unmanaged, IBufferElementData, IItemSlot
        {
            int total = 0;
            for (int i = 0; i < buf.Length; i++)
            {
                var s = buf[i];
                if (!MatchesCostItem(s.GetItemId(), costId)) continue;
                total += s.GetCount();
                if (total >= amount) return true;
            }
            return total >= amount;
        }

        static bool MatchesCostItem(ushort slotId, ushort costId)
        {
            if (costId == BuildingDB.AnyFoodSentinel)
                return ItemDB.EnergyValue(slotId) > 0f;
            return slotId == costId;
        }
    }
}
