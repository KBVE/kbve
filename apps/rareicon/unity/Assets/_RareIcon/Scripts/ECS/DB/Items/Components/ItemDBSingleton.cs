using Unity.Collections;
using Unity.Entities;

namespace RareIcon
{
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
        public byte   Flags;
        public byte   StackMax;
        public byte   HarvestWeight;

        public byte Category    => (byte)(Flags & 0x07);
        public byte HarvestRole => (byte)((Flags >> 3) & 0x03);
        public bool Perishable  => (Flags & 0x20) != 0;

        public static byte PackFlags(byte category, byte harvestRole, bool perishable)
            => (byte)((category & 0x07) | ((harvestRole & 0x03) << 3) | (perishable ? 0x20 : 0));
    }

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
