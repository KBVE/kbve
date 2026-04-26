using Unity.Collections;
using Unity.Entities;

namespace RareIcon
{
    /// <summary>Burst-side blittable mirror of ItemDef. Strings live on managed ItemDB. Field order: 4-byte → 2-byte → 1-byte for natural alignment.</summary>
    public struct ItemDefRuntime
    {
        public uint   ShelfLifeSeconds;
        public float  RestoreHealth;
        public float  RestoreEnergy;
        public float  RestoreMana;
        public float  RegenPerSecond;
        public float  RegenDuration;
        public ushort Id;
        public ushort BaseValue;
        public ushort CompressesTo;
        public ushort CompressRatio;
        public ushort PoolGroup;
        public ushort SpoilsIntoId;
        public byte   Category;
        public byte   StackMax;
        public byte   HarvestRole;
        public byte   HarvestWeight;
        public byte   Perishable;  // bool packed
    }

    /// <summary>Burst-side ItemDB. Defs is a flat NativeArray indexed by ItemId. Bitsets answer hot Yes/No queries (valid, edible, food-pool, perishable) in two ops: word-load + bit-test.</summary>
    public struct ItemDBSingleton : IComponentData
    {
        public NativeArray<ItemDefRuntime> Defs;
        public NativeArray<ulong>          ValidBits;
        public NativeArray<ulong>          EdibleBits;
        public NativeArray<ulong>          FoodPoolBits;
        public NativeArray<ulong>          PerishableBits;
        public ushort MaxItemId;

        public bool IsValid(ushort id)
            => id < MaxItemId && (ValidBits[id >> 6] & (1ul << (id & 63))) != 0;

        public bool IsEdible(ushort id)
            => id < MaxItemId && (EdibleBits[id >> 6] & (1ul << (id & 63))) != 0;

        public bool IsFood(ushort id)
            => id < MaxItemId && (FoodPoolBits[id >> 6] & (1ul << (id & 63))) != 0;

        public bool IsPerishable(ushort id)
            => id < MaxItemId && (PerishableBits[id >> 6] & (1ul << (id & 63))) != 0;

        public bool TryGet(ushort id, out ItemDefRuntime def)
        {
            if (IsValid(id)) { def = Defs[id]; return true; }
            def = default;
            return false;
        }

        public float  EnergyValue(ushort id)        => IsValid(id) ? Defs[id].RestoreEnergy   : 0f;
        public float  HealthValue(ushort id)        => IsValid(id) ? Defs[id].RestoreHealth   : 0f;
        public float  ManaValue(ushort id)          => IsValid(id) ? Defs[id].RestoreMana     : 0f;
        public float  RegenPerSecond(ushort id)     => IsValid(id) ? Defs[id].RegenPerSecond  : 0f;
        public float  RegenDuration(ushort id)      => IsValid(id) ? Defs[id].RegenDuration   : 0f;
        public byte   GetHarvestRole(ushort id)     => IsValid(id) ? Defs[id].HarvestRole     : (byte)0;
        public byte   GetHarvestWeight(ushort id)   => IsValid(id) ? Defs[id].HarvestWeight   : (byte)100;
        public uint   GetShelfLifeSeconds(ushort id)=> IsValid(id) ? Defs[id].ShelfLifeSeconds: 0u;
        public ushort GetSpoilsIntoId(ushort id)    => IsValid(id) ? Defs[id].SpoilsIntoId    : (ushort)0;
    }
}
