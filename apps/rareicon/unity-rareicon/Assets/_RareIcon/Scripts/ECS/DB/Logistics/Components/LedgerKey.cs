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
        public override int GetHashCode() => unchecked(Bank.Index ^ (int)(ItemId * 0x9E3779B1u));

        public int CompareTo(LedgerKey other)
        {
            if (Bank.Index != other.Bank.Index)   return Bank.Index < other.Bank.Index ? -1 : 1;
            if (Bank.Version != other.Bank.Version) return Bank.Version < other.Bank.Version ? -1 : 1;
            if (ItemId != other.ItemId)           return ItemId < other.ItemId ? -1 : 1;
            return 0;
        }
    }
}
