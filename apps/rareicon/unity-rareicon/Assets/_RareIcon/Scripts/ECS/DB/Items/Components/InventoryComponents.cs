using System;
using Unity.Entities;

namespace RareIcon
{
    /// <summary>Shape contract shared by per-unit PackSlot so read-only generic helpers (ItemSlotOps) can iterate any IItemSlot buffer. Building-side ledgers use the IBankLedger marker + BankLedgerBase Reinterpret pattern instead — per §12 the per-bank types (CapitalLedger, FurnaceLedger, FarmLedger, BarracksLedger, GoblinCaveLedger) don't share this interface.</summary>
    public interface IItemSlot
    {
        Ulid   GetUid();
        ushort GetItemId();
        ushort GetCount();
        void   SetCount(ushort count);
    }

    /// <summary>Per-unit carried-item slot. Distinct IBufferElementData so Unity's job-safety system tracks unit access independently from every building ledger. Each stack carries a Cysharp.Ulid for FFI / save-key / birth-time ordering. <see cref="Hp"/> tracks remaining durability for equipment items (one instance per slot, never stacked); stackable items leave it at <c>0</c>. <c>Hp == 0</c> on an equipment item means broken — <see cref="EquipmentSyncSystem"/> skips it during AutoEquip until a repair flow tops it back up.</summary>
    [InternalBufferCapacity(8)]
    public struct PackSlot : IBufferElementData, IItemSlot
    {
        public Ulid   Uid;
        public ushort ItemId;
        public ushort Count;
        public ushort Hp;

        public Ulid   GetUid()                 => Uid;
        public ushort GetItemId()              => ItemId;
        public ushort GetCount()               => Count;
        public void   SetCount(ushort count)   { Count = count; }
    }

    /// <summary>Equipped bag item IDs on a unit. Each entry adds slot capacity per InventoryUtil.BagBonus. Hard cap 2 equipped bags per unit.</summary>
    [InternalBufferCapacity(2)]
    public struct EquippedBag : IBufferElementData
    {
        public ushort ItemId;
    }

    public static class InventoryUtil
    {
        public const int BaseSlotCap = 8;
        public const int MaxEquippedBags = 2;

        public static int BagBonus(ushort bagItemId)
        {
            if (bagItemId == (ushort)ItemId.Pouch) return 3;
            if (bagItemId == (ushort)ItemId.Bag)   return 6;
            if (bagItemId == (ushort)ItemId.Pack)  return 10;
            return 0;
        }

        public static bool IsBag(ushort itemId)
            => itemId == (ushort)ItemId.Pouch
            || itemId == (ushort)ItemId.Bag
            || itemId == (ushort)ItemId.Pack;

        public static int SlotCap(in DynamicBuffer<EquippedBag> bags)
        {
            int total = BaseSlotCap;
            for (int i = 0; i < bags.Length; i++)
                total += BagBonus(bags[i].ItemId);
            return total;
        }
    }

    public static class PackBufferExtensions
    {
        public static void AddItem(this DynamicBuffer<PackSlot> buffer, ushort itemId, ushort count, ushort hp = ushort.MaxValue)
        {
            if (count == 0) return;
            bool isEquip = EquipmentMap.SlotFor(itemId) != EquipmentSlot.None;
            ushort packHp = hp == ushort.MaxValue
                ? (isEquip ? EquipmentDurability.MaxFor(itemId) : (ushort)0)
                : hp;

            if (!isEquip)
            {
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
                buffer.Add(new PackSlot { ItemId = itemId, Count = count, Hp = 0 });
                return;
            }

            for (int i = 0; i < count; i++)
                buffer.Add(new PackSlot { ItemId = itemId, Count = 1, Hp = packHp });
        }

        public static ushort AddItemCapped(
            this DynamicBuffer<PackSlot> buffer,
            ushort itemId, ushort count, int stackMax, int slotCap, ushort hp = ushort.MaxValue)
        {
            if (count == 0 || itemId == 0) return 0;
            if (stackMax <= 0) stackMax = 99;
            if (slotCap <= 0) slotCap = InventoryUtil.BaseSlotCap;

            bool isEquip = EquipmentMap.SlotFor(itemId) != EquipmentSlot.None;
            ushort packHp = hp == ushort.MaxValue
                ? (isEquip ? EquipmentDurability.MaxFor(itemId) : (ushort)0)
                : hp;

            int remaining = count;
            if (!isEquip)
            {
                for (int i = 0; i < buffer.Length && remaining > 0; i++)
                {
                    if (buffer[i].ItemId != itemId) continue;
                    int room = stackMax - buffer[i].Count;
                    if (room <= 0) continue;
                    int take = remaining < room ? remaining : room;
                    var slot = buffer[i];
                    slot.Count = (ushort)(slot.Count + take);
                    buffer[i] = slot;
                    remaining -= take;
                }
                while (remaining > 0 && buffer.Length < slotCap)
                {
                    int take = remaining < stackMax ? remaining : stackMax;
                    buffer.Add(new PackSlot { ItemId = itemId, Count = (ushort)take, Hp = 0 });
                    remaining -= take;
                }
            }
            else
            {
                while (remaining > 0 && buffer.Length < slotCap)
                {
                    buffer.Add(new PackSlot { ItemId = itemId, Count = 1, Hp = packHp });
                    remaining--;
                }
            }
            return (ushort)(count - remaining);
        }

        public static ushort AddItemCapped(
            this DynamicBuffer<PackSlot> buffer,
            in DynamicBuffer<EquippedBag> bags,
            in ItemDBSingleton itemDb,
            ushort itemId, ushort count)
        {
            int stackMax = 99;
            if (itemDb.TryGet(itemId, out var def) && def.StackMax > 0) stackMax = def.StackMax;
            int cap = InventoryUtil.SlotCap(bags);
            return buffer.AddItemCapped(itemId, count, stackMax, cap);
        }

        public static ushort AddItemManaged(
            this DynamicBuffer<PackSlot> buffer,
            in DynamicBuffer<EquippedBag> bags,
            ushort itemId, ushort count)
        {
            int stackMax = ItemDB.TryGet(itemId, out var def) && def.StackMax > 0 ? def.StackMax : 99;
            int cap = InventoryUtil.SlotCap(bags);
            return buffer.AddItemCapped(itemId, count, stackMax, cap);
        }

        public static ushort RemoveItem(this DynamicBuffer<PackSlot> buffer, ushort itemId, ushort count)
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

        public static ushort CountOf(this DynamicBuffer<PackSlot> buffer, ushort itemId)
        {
            for (int i = 0; i < buffer.Length; i++)
                if (buffer[i].ItemId == itemId) return buffer[i].Count;
            return 0;
        }
    }
}
