using System;
using Unity.Entities;

namespace RareIcon
{
    public struct LedgerKey : IEquatable<LedgerKey>, IComparable<LedgerKey>
    {
        public Entity Bank;
        public ushort ItemId;

        public bool Equals(LedgerKey other) => Bank == other.Bank && ItemId == other.ItemId;
        public override bool Equals(object obj) => obj is LedgerKey k && Equals(k);

        public override int GetHashCode()
        {
            unchecked
            {
                uint h = (uint)Bank.Index * 0xCC9E2D51u;
                h ^= (uint)Bank.Version * 0x1B873593u;
                h ^= (uint)ItemId       * 0x85EBCA6Bu;
                h ^= h >> 16;
                h *= 0x85EBCA6Bu;
                h ^= h >> 13;
                h *= 0xC2B2AE35u;
                h ^= h >> 16;
                return (int)h;
            }
        }

        public int CompareTo(LedgerKey other)
        {
            if (Bank.Index != other.Bank.Index) return Bank.Index < other.Bank.Index ? -1 : 1;
            uint a = ((uint)Bank.Version       << 16) | ItemId;
            uint b = ((uint)other.Bank.Version << 16) | other.ItemId;
            return a == b ? 0 : (a < b ? -1 : 1);
        }
    }
}
