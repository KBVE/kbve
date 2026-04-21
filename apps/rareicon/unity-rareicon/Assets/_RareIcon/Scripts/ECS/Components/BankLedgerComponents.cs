using System;
using System.Runtime.InteropServices;
using Unity.Collections;
using Unity.Entities;

namespace RareIcon
{
    /// <summary>Empty marker interface identifying "per-building storage ledger" buffer types. Every bank (Capital, Furnace, Farm, Barracks, GoblinCave) gets its own IBufferElementData type so Unity's job-safety system treats them as independent access domains — BufferLookup&lt;FurnaceLedger&gt; and BufferLookup&lt;CapitalLedger&gt; are physically distinct dep-graph nodes and can schedule in parallel on worker threads. See INVENTORY.md §12 for the migration plan + rationale.</summary>
    public interface IBankLedger : IBufferElementData { }

    /// <summary>The actual data shape shared by every bank ledger. Not an IBufferElementData itself — exists to back `DynamicBuffer&lt;T&gt;.Reinterpret&lt;BankLedgerBase&gt;()` aliased views so shared algorithm code (CountFood, consolidation, HasBuildCost, …) operates on one concrete type instead of N generic specializations. Identical binary layout to every per-bank ledger struct below so Reinterpret is a zero-cost cast.</summary>
    [StructLayout(LayoutKind.Sequential)]
    public struct BankLedgerBase
    {
        public Ulid   Uid;
        public ushort ItemId;
        public ushort Count;
    }

    /// <summary>Central treasury. Holds the empire-wide stockpile — deposits from Builder/Looter/Farmer haulers, Cooking output, Furnace smelter output, Passive-production output, ConsumedOnPickup food, craft ingredients, etc. Distinct type from FurnaceLedger/FarmLedger/etc. so Unity schedules its writers in parallel with other banks' writers.</summary>
    [InternalBufferCapacity(8)]
    [StructLayout(LayoutKind.Sequential)]
    public struct CapitalLedger : IBankLedger
    {
        public Ulid   Uid;
        public ushort ItemId;
        public ushort Count;
    }

    /// <summary>Furnace smelting stash — smelter inputs (Wood, Sand) accumulate here until a cycle fires; outputs (Coal, Glass, Ash) land here before BuildingSurplusTransfer drains to Capital.</summary>
    [InternalBufferCapacity(8)]
    [StructLayout(LayoutKind.Sequential)]
    public struct FurnaceLedger : IBankLedger
    {
        public Ulid   Uid;
        public ushort ItemId;
        public ushort Count;
    }

    /// <summary>Farm livestock feed / produce stash. Carrots for animal feed, Egg/Milk/Wool outputs before surplus drain. Kept local so FarmLivestockProductionJob doesn't race Capital writes.</summary>
    [InternalBufferCapacity(8)]
    [StructLayout(LayoutKind.Sequential)]
    public struct FarmLedger : IBankLedger
    {
        public Ulid   Uid;
        public ushort ItemId;
        public ushort Count;
    }

    /// <summary>Barracks forward arsenal — BanditCoin + Meal/food staged for recruitment, Arrow output from BarracksCrafting, material buffers for future weapon-craft recipes.</summary>
    [InternalBufferCapacity(8)]
    [StructLayout(LayoutKind.Sequential)]
    public struct BarracksLedger : IBankLedger
    {
        public Ulid   Uid;
        public ushort ItemId;
        public ushort Count;
    }

    /// <summary>GoblinCave food larder. Filled by Player-faction goblins dropping off food at the cave; GoblinCaveProductionSystem consumes FoodPerGoblin units per turn to spawn a new goblin.</summary>
    [InternalBufferCapacity(8)]
    [StructLayout(LayoutKind.Sequential)]
    public struct GoblinCaveLedger : IBankLedger
    {
        public Ulid   Uid;
        public ushort ItemId;
        public ushort Count;
    }

    /// <summary>Inn larder. Cooked food + meals staged for guests (sleepers + diners). Filled by Looter haulers from the Capital surplus; drained by EmpireWithdrawSystem when a hungry unit walks in.</summary>
    [InternalBufferCapacity(8)]
    [StructLayout(LayoutKind.Sequential)]
    public struct InnLedger : IBankLedger
    {
        public Ulid   Uid;
        public ushort ItemId;
        public ushort Count;
    }

    /// <summary>Market shop-floor stock. Goods staged for sale (Sell orders) and goods bought-in awaiting pickup (Buy orders). Separate from CapitalLedger so the market's inventory doesn't commingle with the empire's main stockpile until the haul leg runs.</summary>
    [InternalBufferCapacity(8)]
    [StructLayout(LayoutKind.Sequential)]
    public struct MarketLedger : IBankLedger
    {
        public Ulid   Uid;
        public ushort ItemId;
        public ushort Count;
    }

    /// <summary>Shared algorithm helpers over any per-bank ledger. Callers Reinterpret their concrete DynamicBuffer&lt;CapitalLedger&gt;/&lt;FurnaceLedger&gt;/etc. into DynamicBuffer&lt;BankLedgerBase&gt; at the call boundary, then pass the view here. One implementation, no generics, no interface method calls — Burst compiles these as plain struct-field loops. Writes through the reinterpreted view alias the original buffer's memory so mutations stick.</summary>
    public static class BankLedgerOps
    {
        /// <summary>Sum of Count across all slots that match itemId.</summary>
        public static int CountOf(in DynamicBuffer<BankLedgerBase> buf, ushort itemId)
        {
            int total = 0;
            for (int i = 0; i < buf.Length; i++)
                if (buf[i].ItemId == itemId) total += buf[i].Count;
            return total;
        }

        /// <summary>Sum of Count across every non-zero slot whose item has EnergyValue &gt; 0 (edible).</summary>
        public static int CountFood(in DynamicBuffer<BankLedgerBase> buf)
        {
            int total = 0;
            for (int i = 0; i < buf.Length; i++)
            {
                if (buf[i].Count == 0) continue;
                if (ItemDB.EnergyValue(buf[i].ItemId) <= 0f) continue;
                total += buf[i].Count;
            }
            return total;
        }

        /// <summary>True if any non-zero slot holds an edible item.</summary>
        public static bool HasFood(in DynamicBuffer<BankLedgerBase> buf)
        {
            for (int i = 0; i < buf.Length; i++)
            {
                if (buf[i].Count == 0) continue;
                if (ItemDB.EnergyValue(buf[i].ItemId) > 0f) return true;
            }
            return false;
        }

        /// <summary>Burst-safe food-count using the runtime ItemDBSingleton. Use this inside jobs — managed ItemDB.EnergyValue crosses into the managed dictionary.</summary>
        public static int CountFoodBurst(in DynamicBuffer<BankLedgerBase> buf, in ItemDBSingleton db)
        {
            int total = 0;
            for (int i = 0; i < buf.Length; i++)
            {
                if (buf[i].Count == 0) continue;
                if (db.EnergyValue(buf[i].ItemId) <= 0f) continue;
                total += buf[i].Count;
            }
            return total;
        }

        /// <summary>True if the buffer covers `amount` of the given cost line; costId may be AnyFoodSentinel.</summary>
        public static bool HasBuildCost(in DynamicBuffer<BankLedgerBase> buf, ushort costId, ushort amount)
        {
            int total = 0;
            for (int i = 0; i < buf.Length; i++)
            {
                if (!MatchesCostItem(buf[i].ItemId, costId)) continue;
                total += buf[i].Count;
                if (total >= amount) return true;
            }
            return total >= amount;
        }

        /// <summary>Add `amount` of itemId. Merges into an existing same-ItemId slot (older Uid wins per INVENTORY.md §2); spills a new slot if no match. freshUid stamps new stacks; pass UlidFactory.NewUid() from main-thread callers, or build one inline from Unity.Mathematics.Random + elapsed-ms inside Burst jobs.</summary>
        public static void AddItem(ref DynamicBuffer<BankLedgerBase> buf, ushort itemId, ushort amount, Ulid freshUid)
        {
            if (amount == 0) return;
            for (int i = 0; i < buf.Length; i++)
            {
                if (buf[i].ItemId != itemId) continue;
                var s = buf[i];
                int next = s.Count + amount;
                s.Count = (ushort)(next > ushort.MaxValue ? ushort.MaxValue : next);
                buf[i] = s;
                return;
            }
            buf.Add(new BankLedgerBase { Uid = freshUid, ItemId = itemId, Count = amount });
        }

        /// <summary>Remove up to `amount` of itemId. Returns the count actually removed. Zero-count slots are removed from the buffer.</summary>
        public static ushort RemoveItem(ref DynamicBuffer<BankLedgerBase> buf, ushort itemId, ushort amount)
        {
            if (amount == 0) return 0;
            for (int i = 0; i < buf.Length; i++)
            {
                if (buf[i].ItemId != itemId) continue;
                var s = buf[i];
                ushort taken = s.Count <= amount ? s.Count : amount;
                s.Count = (ushort)(s.Count - taken);
                if (s.Count == 0)
                    buf.RemoveAt(i);
                else
                    buf[i] = s;
                return taken;
            }
            return 0;
        }

        /// <summary>Sum total Count across every slot, regardless of ItemId. Used for StorageCapacity headroom checks.</summary>
        public static int TotalCount(in DynamicBuffer<BankLedgerBase> buf)
        {
            int total = 0;
            for (int i = 0; i < buf.Length; i++) total += buf[i].Count;
            return total;
        }

        static bool MatchesCostItem(ushort slotId, ushort costId)
        {
            if (costId == BuildingDB.AnyFoodSentinel)
                return ItemDB.EnergyValue(slotId) > 0f;
            return slotId == costId;
        }
    }
}
