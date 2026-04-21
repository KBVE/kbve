using System;
using Unity.Entities;

namespace RareIcon
{
    public struct LedgerKey : IEquatable<LedgerKey>
    {
        public Entity Bank;
        public ushort ItemId;

        public bool Equals(LedgerKey other) => Bank == other.Bank && ItemId == other.ItemId;
        public override bool Equals(object obj) => obj is LedgerKey k && Equals(k);
        public override int GetHashCode() => unchecked(Bank.Index ^ (int)(ItemId * 0x9E3779B1u));
    }
}
