using Unity.Collections;
using Unity.Entities;

namespace RareIcon
{
    /// <summary>Rebuilds the per-frame <see cref="CityIndexSingleton"/> from every entity carrying <see cref="CityTag"/> + <see cref="Building"/>. Runs OrderFirst in <see cref="InitializationSystemGroup"/> so downstream Burst readers (tribute, shop, shrine) see a stable snapshot. Lightweight — typical empires have a handful of cities, so a managed sweep + writeback into a Persistent NativeList costs less than wiring per-system component lookups.</summary>
    [WorldSystemFilter(WorldSystemFilterFlags.LocalSimulation | WorldSystemFilterFlags.ClientSimulation | WorldSystemFilterFlags.ThinClientSimulation)]
    [UpdateInGroup(typeof(InitializationSystemGroup), OrderFirst = true)]
    public partial class CityIndexSystem : SystemBase
    {
        NativeList<CityIndexEntry> _entries;
        EntityQuery _cityQuery;

        protected override void OnCreate()
        {
            _entries = new NativeList<CityIndexEntry>(8, Allocator.Persistent);
            EntityManager.CreateSingleton(new CityIndexSingleton { Entries = _entries });
            _cityQuery = GetEntityQuery(
                ComponentType.ReadOnly<CityTag>(),
                ComponentType.ReadOnly<Building>());
        }

        protected override void OnDestroy()
        {
            if (_entries.IsCreated) _entries.Dispose();
        }

        protected override void OnUpdate()
        {
            _entries.Clear();
            if (_cityQuery.IsEmpty) return;

            var em = EntityManager;
            using var arr = _cityQuery.ToEntityArray(Allocator.Temp);
            for (int i = 0; i < arr.Length; i++)
            {
                var e = arr[i];
                var b = em.GetComponentData<Building>(e);
                byte radius = em.HasComponent<CityAdminRadius>(e)
                    ? em.GetComponentData<CityAdminRadius>(e).Radius
                    : (byte)0;
                _entries.Add(new CityIndexEntry
                {
                    Entity           = e,
                    RootHex          = b.RootHex,
                    Faction          = b.OwnerFaction,
                    AdminRadius      = radius,
                    HasCapitalLedger = (byte)(em.HasBuffer<CapitalLedger>(e) ? 1 : 0),
                    HasCityLedger    = (byte)(em.HasBuffer<CityLedger>(e)    ? 1 : 0),
                });
            }
        }
    }
}
