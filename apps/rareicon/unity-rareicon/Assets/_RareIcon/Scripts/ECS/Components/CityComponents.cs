using Unity.Entities;

namespace RareIcon
{
    /// <summary>Marker tag for any city-class structure on the map — Capital, Player-founded cities, neutral CityStates. Provides a single query handle for the future CityManagementPanel + per-city ledger routing so callers don't have to union <see cref="CapitalTag"/> + <see cref="CityStateTag"/> + future Player-city tags by hand. Capital keeps <see cref="CapitalTag"/> + <see cref="CapitalLedger"/> as its specialization for backwards-compat with existing singleton lookups; new player cities + CityStates get <see cref="CityLedger"/> as their independent treasury.</summary>
    public struct CityTag : IComponentData { }

    /// <summary>Admin radius in hex tiles around the city's RootHex. Buildings on hexes inside the radius are managed by this city — drives the consolidator panel's "buildings under this city" filter and (future) per-city ledger routing for tribute / shop / shrine drops to the nearest city. Default radii: Capital 12 (large empire seed), CityState 6, Player-founded cities 8. Tunable via <see cref="BuildingDB"/> or mapdb in a later pass.</summary>
    public struct CityAdminRadius : IComponentData
    {
        public byte Radius;
    }
}
