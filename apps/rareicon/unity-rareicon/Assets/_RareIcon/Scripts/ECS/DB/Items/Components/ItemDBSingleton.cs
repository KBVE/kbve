using Unity.Collections;
using Unity.Entities;

namespace RareIcon
{
    /// <summary>Burst-accessible subset of ItemDef — everything except the managed NameKey string. Mirrored into ItemDBSingleton.Lookup at boot so any Burst ISystem / IJobEntity can ask "is this edible? how much energy does it give?" without reaching into the managed ItemDB._byId Dictionary.</summary>
    public struct ItemDefRuntime
    {
        public ushort Id;
        public byte   Category;
        public byte   StackMax;
        public ushort BaseValue;
        public float  RestoreHealth;
        public float  RestoreEnergy;
        public float  RestoreMana;
        public float  RegenPerSecond;
        public float  RegenDuration;
        public byte   HarvestRole;
        public byte   HarvestWeight;
        public ushort CompressesTo;
        public ushort CompressRatio;
        public ushort PoolGroup;
        public byte   Perishable;        // 1 if the item spoils, 0 otherwise (bool padded to byte for blittable layout)
        public uint   ShelfLifeSeconds;  // 0 when Perishable == 0
        public ushort SpoilsIntoId;      // ItemId of the target; 0 when non-perishable, auto-fallback to rotten-food at Materialise time
    }

    /// <summary>Burst-safe mirror of ItemDB. ItemDBBootstrapSystem populates Lookup once at startup from the managed ItemDB table; consumers read via SystemAPI.GetSingleton&lt;ItemDBSingleton&gt;() and call the helper methods inside any Burst job.</summary>
    public struct ItemDBSingleton : IComponentData
    {
        public NativeHashMap<ushort, ItemDefRuntime> Lookup;

        public bool IsEdible(ushort itemId)
            => Lookup.TryGetValue(itemId, out var def) && def.RestoreEnergy > 0f;

        public float EnergyValue(ushort itemId)
            => Lookup.TryGetValue(itemId, out var def) ? def.RestoreEnergy : 0f;

        public float HealthValue(ushort itemId)
            => Lookup.TryGetValue(itemId, out var def) ? def.RestoreHealth : 0f;

        public float ManaValue(ushort itemId)
            => Lookup.TryGetValue(itemId, out var def) ? def.RestoreMana : 0f;

        public float RegenPerSecond(ushort itemId)
            => Lookup.TryGetValue(itemId, out var def) ? def.RegenPerSecond : 0f;

        public float RegenDuration(ushort itemId)
            => Lookup.TryGetValue(itemId, out var def) ? def.RegenDuration : 0f;

        public bool TryGet(ushort itemId, out ItemDefRuntime def)
            => Lookup.TryGetValue(itemId, out def);

        public byte GetHarvestRole(ushort itemId)
            => Lookup.TryGetValue(itemId, out var def) ? def.HarvestRole : (byte)0;

        public byte GetHarvestWeight(ushort itemId)
            => Lookup.TryGetValue(itemId, out var def) ? def.HarvestWeight : (byte)100;

        public bool IsPerishable(ushort itemId)
            => Lookup.TryGetValue(itemId, out var def) && def.Perishable != 0;

        public uint GetShelfLifeSeconds(ushort itemId)
            => Lookup.TryGetValue(itemId, out var def) ? def.ShelfLifeSeconds : 0u;

        public ushort GetSpoilsIntoId(ushort itemId)
            => Lookup.TryGetValue(itemId, out var def) ? def.SpoilsIntoId : (ushort)0;
    }
}
