using Unity.Collections;
using Unity.Entities;
using Unity.Mathematics;

namespace RareIcon
{
    /// <summary>
    /// Bridge from managed code (UI / services) to the Capital building
    /// in the default DOTS world. Two callers justify this wrapper — the
    /// Treasury panel and the future "center camera on capital" button —
    /// which is why it stayed when the single-caller KingLocator was
    /// retired in favour of inlining its DOTS query into WorldHUD.
    ///
    /// Returns false until the player has placed a Capital — the world
    /// starts with `CityBuildsRemaining = 1` and no actual Capital entity
    /// exists until BuildingSpawnSystem consumes a BuildCityRequest.
    /// </summary>
    public static class CapitalLocator
    {
        static EntityQuery _query;
        static bool _queryReady;

        /// <summary>
        /// Try to read the Capital's root hex coordinate. Returns false if
        /// no Capital exists yet (player hasn't built one) or no DOTS world
        /// is available (uninitialized / shutting down).
        /// </summary>
        public static bool TryGetRootHex(out int2 hex)
        {
            hex = default;

            var world = World.DefaultGameObjectInjectionWorld;
            if (world == null || !world.IsCreated) return false;

            EnsureQuery(world);
            if (_query.CalculateEntityCount() == 0) return false;

            // Filter to Capital-type buildings — once Barracks / Farms
            // ship the query will return non-capitals too. Pick the first
            // Capital found; "nearest capital" is a future extension.
            var arr = _query.ToEntityArray(Allocator.Temp);
            try
            {
                var em = world.EntityManager;
                for (int i = 0; i < arr.Length; i++)
                {
                    var b = em.GetComponentData<Building>(arr[i]);
                    if (b.Type == BuildingType.Capital)
                    {
                        hex = b.RootHex;
                        return true;
                    }
                }
                return false;
            }
            finally
            {
                arr.Dispose();
            }
        }

        /// <summary>
        /// Try to look up the Capital entity itself. Used by UITreasury to
        /// read the storage InventorySlot buffer directly.
        /// </summary>
        public static bool TryGetEntity(out Entity capital)
        {
            capital = Entity.Null;

            var world = World.DefaultGameObjectInjectionWorld;
            if (world == null || !world.IsCreated) return false;

            EnsureQuery(world);
            if (_query.CalculateEntityCount() == 0) return false;

            var arr = _query.ToEntityArray(Allocator.Temp);
            try
            {
                var em = world.EntityManager;
                for (int i = 0; i < arr.Length; i++)
                {
                    if (em.GetComponentData<Building>(arr[i]).Type == BuildingType.Capital)
                    {
                        capital = arr[i];
                        return true;
                    }
                }
                return false;
            }
            finally
            {
                arr.Dispose();
            }
        }

        static void EnsureQuery(World world)
        {
            if (_queryReady) return;
            _query = world.EntityManager.CreateEntityQuery(
                ComponentType.ReadOnly<Building>());
            _queryReady = true;
        }
    }
}
