using Unity.Entities;
using System;
using System.Runtime.CompilerServices;
using System.Runtime.InteropServices;
using Unity.Collections;
using Unity.Mathematics;
using ProtoBuf;
using KBVE.MMExtensions.Orchestrator.DOTS.Common;
using KBVE.MMExtensions.Orchestrator.Core;

namespace KBVE.MMExtensions.Orchestrator.DOTS
{
    public enum ItemType : byte
    {
        None = 0,
        Weapon = 1,
        Armor = 2,
        Tool = 3,
        Consumable = 4,
        Material = 5,
        Resource = 6,
        Quest = 7,
        Utility = 8
    }

    public enum ItemRarity : byte
    {
        Common = 0,
        Uncommon = 1,
        Rare = 2,
        Epic = 3,
        Legendary = 4,
        Mythic = 5
    }

    [Flags]
    public enum ItemFlags : byte
    {
        None = 0,
        Stackable = 1 << 0,
        Tradable = 1 << 1,
        Droppable = 1 << 2,
        Consumable = 1 << 3,
        Equipable = 1 << 4,
        Questitem = 1 << 5,
        Unique = 1 << 6
    }

    /// <summary>
    /// Complete item data with protobuf-net serialization support.
    /// This is the single source of truth for all item-related data.
    /// Size: ~36 bytes
    /// </summary>
    [ProtoContract]
    [StructLayout(LayoutKind.Sequential)]
    public struct ItemData : IEntityData<ItemData>, IEquatable<ItemData>
    {
        [ProtoMember(1)]
        public FixedBytes16 TemplateUlid;       // 16 bytes - Template reference

        [ProtoMember(2)]
        public ItemType Type;                   // 1 byte - Item type

        [ProtoMember(3)]
        public ItemRarity Rarity;               // 1 byte - Item rarity

        [ProtoMember(4)]
        public ItemFlags Flags;                 // 1 byte - Item flags

        [ProtoMember(5)]
        public ItemCategoryFlags CategoryFlags; // 4 bytes - Category flags (using existing enum)

        [ProtoMember(6)]
        public int StackCount;                  // 4 bytes - Current stack count

        [ProtoMember(7)]
        public int MaxStack;                    // 4 bytes - Maximum stack size

        [ProtoMember(8)]
        public int Durability;                  // 4 bytes - Current durability

        [ProtoMember(9)]
        public int MaxDurability;               // 4 bytes - Maximum durability

        // ---- Equality Implementation ----
        public bool Equals(ItemData other)
        {
            return EntityDataExtensions.UlidEquals(TemplateUlid, other.TemplateUlid)
                && Type == other.Type
                && Rarity == other.Rarity
                && Flags == other.Flags
                && CategoryFlags == other.CategoryFlags
                && StackCount == other.StackCount
                && MaxStack == other.MaxStack
                && Durability == other.Durability
                && MaxDurability == other.MaxDurability;
        }

        public override bool Equals(object obj) => obj is ItemData other && Equals(other);

        public override int GetHashCode()
        {
            return EntityDataExtensions.CombineHashCodes(
                EntityDataExtensions.GetUlidHashCode(TemplateUlid),
                (int)Type,
                (int)Rarity,
                (int)Flags,
                (int)CategoryFlags,
                StackCount,
                MaxStack,
                Durability,
                MaxDurability
            );
        }

        public static bool operator ==(ItemData a, ItemData b) => a.Equals(b);
        public static bool operator !=(ItemData a, ItemData b) => !a.Equals(b);

        /// <summary>
        /// Validates that all item data is within reasonable ranges.
        /// </summary>
        public bool IsValid()
        {
            return EntityDataValidation.IsValidUlid(TemplateUlid)
                && EntityDataExtensions.IsInRange(StackCount, 0, MaxStack)
                && EntityDataExtensions.IsInRange(MaxStack, 1, int.MaxValue)
                && EntityDataExtensions.IsInRange(Durability, 0, MaxDurability)
                && EntityDataExtensions.IsInRange(MaxDurability, 0, int.MaxValue);
        }

        // ---- Item-specific helper properties ----
        public bool IsStackable => (Flags & ItemFlags.Stackable) != 0;
        public bool IsTradable => (Flags & ItemFlags.Tradable) != 0;
        public bool IsDroppable => (Flags & ItemFlags.Droppable) != 0;
        public bool IsConsumable => (Flags & ItemFlags.Consumable) != 0;
        public bool IsEquipable => (Flags & ItemFlags.Equipable) != 0;
        public bool IsQuestItem => (Flags & ItemFlags.Questitem) != 0;
        public bool IsUnique => (Flags & ItemFlags.Unique) != 0;
        public bool IsFullStack => StackCount >= MaxStack;
        public bool IsEmptyStack => StackCount <= 0;
        public bool IsBroken => Durability <= 0 && MaxDurability > 0;
        public bool HasDurability => MaxDurability > 0;

        // ---- Item-specific helper methods ----
        public ItemData SetFlag(ItemFlags flag, bool value)
        {
            var result = this;
            if (value)
                result.Flags |= flag;
            else
                result.Flags &= ~flag;
            return result;
        }

        public ItemData SetCategoryFlag(ItemCategoryFlags flag, bool value)
        {
            var result = this;
            if (value)
                result.CategoryFlags |= flag;
            else
                result.CategoryFlags &= ~flag;
            return result;
        }

        public ItemData AddToStack(int amount)
        {
            var result = this;
            result.StackCount = EntityDataExtensions.ClampInt(StackCount + amount, 0, MaxStack);
            return result;
        }

        public ItemData RemoveFromStack(int amount)
        {
            var result = this;
            result.StackCount = EntityDataExtensions.ClampInt(StackCount - amount, 0, MaxStack);
            return result;
        }

        public ItemData DamageDurability(int damage)
        {
            var result = this;
            if (HasDurability)
            {
                result.Durability = EntityDataExtensions.ClampInt(Durability - damage, 0, MaxDurability);
            }
            return result;
        }

        public ItemData RepairDurability(int repair)
        {
            var result = this;
            if (HasDurability)
            {
                result.Durability = EntityDataExtensions.ClampInt(Durability + repair, 0, MaxDurability);
            }
            return result;
        }
    }

    /// <summary>
    /// ECS component wrapper for ItemData.
    /// Provides seamless integration with Unity DOTS while maintaining protobuf serialization.
    /// </summary>
    public struct Item : IComponentData
    {
        public ItemData Data;

        // Implicit conversions for seamless usage
        public static implicit operator ItemData(Item component) => component.Data;
        public static implicit operator Item(ItemData data) => new Item { Data = data };
    }

    /// <summary>
    /// Item instance identifier component.
    /// </summary>
    public struct ItemID : IComponentData
    {
        public FixedBytes16 instanceUlid;
    }

    /// <summary>
    /// Extension methods for Item component that delegate to ItemData methods.
    /// Maintains compatibility with existing code patterns.
    /// </summary>
    public static class ItemExtensions
    {
        [MethodImpl(MethodImplOptions.AggressiveInlining)]
        public static bool IsStackable(this Item item) => item.Data.IsStackable;

        [MethodImpl(MethodImplOptions.AggressiveInlining)]
        public static bool IsTradable(this Item item) => item.Data.IsTradable;

        [MethodImpl(MethodImplOptions.AggressiveInlining)]
        public static bool IsDroppable(this Item item) => item.Data.IsDroppable;

        [MethodImpl(MethodImplOptions.AggressiveInlining)]
        public static bool IsConsumable(this Item item) => item.Data.IsConsumable;

        [MethodImpl(MethodImplOptions.AggressiveInlining)]
        public static bool IsEquipable(this Item item) => item.Data.IsEquipable;

        [MethodImpl(MethodImplOptions.AggressiveInlining)]
        public static bool IsQuestItem(this Item item) => item.Data.IsQuestItem;

        [MethodImpl(MethodImplOptions.AggressiveInlining)]
        public static bool IsUnique(this Item item) => item.Data.IsUnique;

        [MethodImpl(MethodImplOptions.AggressiveInlining)]
        public static bool IsFullStack(this Item item) => item.Data.IsFullStack;

        [MethodImpl(MethodImplOptions.AggressiveInlining)]
        public static bool IsEmptyStack(this Item item) => item.Data.IsEmptyStack;

        [MethodImpl(MethodImplOptions.AggressiveInlining)]
        public static bool IsBroken(this Item item) => item.Data.IsBroken;

        [MethodImpl(MethodImplOptions.AggressiveInlining)]
        public static bool HasDurability(this Item item) => item.Data.HasDurability;

        [MethodImpl(MethodImplOptions.AggressiveInlining)]
        public static void SetFlag(ref this Item item, ItemFlags flag, bool value)
        {
            item.Data = item.Data.SetFlag(flag, value);
        }

        [MethodImpl(MethodImplOptions.AggressiveInlining)]
        public static void SetCategoryFlag(ref this Item item, ItemCategoryFlags flag, bool value)
        {
            item.Data = item.Data.SetCategoryFlag(flag, value);
        }

        [MethodImpl(MethodImplOptions.AggressiveInlining)]
        public static void AddToStack(ref this Item item, int amount)
        {
            item.Data = item.Data.AddToStack(amount);
        }

        [MethodImpl(MethodImplOptions.AggressiveInlining)]
        public static void RemoveFromStack(ref this Item item, int amount)
        {
            item.Data = item.Data.RemoveFromStack(amount);
        }

        [MethodImpl(MethodImplOptions.AggressiveInlining)]
        public static void DamageDurability(ref this Item item, int damage)
        {
            item.Data = item.Data.DamageDurability(damage);
        }

        [MethodImpl(MethodImplOptions.AggressiveInlining)]
        public static void RepairDurability(ref this Item item, int repair)
        {
            item.Data = item.Data.RepairDurability(repair);
        }
    }

    /// <summary>
    /// Convenience type alias for serialization operations.
    /// Usage: ItemBlit.Serialize(itemData)
    /// </summary>
    public static class ItemBlit
    {
        public static byte[] Serialize(ItemData data) => GenericBlit<ItemData>.Serialize(data);
        public static ItemData Deserialize(byte[] bytes) => GenericBlit<ItemData>.Deserialize(bytes);
        public static bool ValidateSerializable(ItemData data) => GenericBlit<ItemData>.ValidateSerializable(data);
        public static ItemData Clone(ItemData data) => GenericBlit<ItemData>.Clone(data);
    }
}