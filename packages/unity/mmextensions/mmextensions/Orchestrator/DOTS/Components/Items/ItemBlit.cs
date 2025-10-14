
using System;
using System.Runtime.InteropServices;
using Unity.Collections;
using Unity.Mathematics;
using Unity.Collections.LowLevel.Unsafe;

namespace KBVE.MMExtensions.Orchestrator.DOTS
{
    /// <summary>
    /// Item-specific data. Only present when entity is an Item.
    /// Size: ~12 bytes
    /// </summary>
    [StructLayout(LayoutKind.Sequential)]
    public struct ItemBlit : IEquatable<ItemBlit>
    {
        public byte ItemType;           // 1 byte
        public byte Rarity;             // 1 byte
        public int StackCount;          // 4 bytes
        public int MaxStack;            // 4 bytes
        // Padding: ~2 bytes

        // ---- Equality ----
        public bool Equals(ItemBlit other)
        {
            return ItemType == other.ItemType
                && Rarity == other.Rarity
                && StackCount == other.StackCount
                && MaxStack == other.MaxStack;
        }

        public override bool Equals(object obj) => obj is ItemBlit o && Equals(o);

        public override int GetHashCode()
        {
            unsafe
            {
                unchecked
                {
                    int hash = ItemType * 16777619;
                    hash = (hash * 397) ^ Rarity;
                    hash = (hash * 397) ^ StackCount;
                    hash = (hash * 397) ^ MaxStack;
                    return hash;
                }
            }
        }

        public static bool operator ==(ItemBlit a, ItemBlit b) => a.Equals(b);
        public static bool operator !=(ItemBlit a, ItemBlit b) => !a.Equals(b);
    }

}