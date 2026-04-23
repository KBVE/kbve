using Unity.Entities;
using Unity.Mathematics;

namespace RareIcon
{
    /// <summary>Managed-side bridge to the Capital entity in the default DOTS world; returns false until the player builds one (CapitalTag becomes the singleton).</summary>
    public static class CapitalLocator
    {
        static World _boundWorld;
        static EntityQuery _query;
        static Entity _cachedCapital;
        static int2 _cachedRootHex;
        static bool _hasCachedCapital;

        public static bool TryGetRootHex(out int2 hex)
        {
            hex = default;
            if (!TryRefreshCache())
                return false;

            hex = _cachedRootHex;
            return true;
        }

        public static bool TryGetEntity(out Entity capital)
        {
            capital = Entity.Null;
            if (!TryRefreshCache())
                return false;

            capital = _cachedCapital;
            return true;
        }

        static bool TryRefreshCache()
        {
            var world = World.DefaultGameObjectInjectionWorld;
            if (world == null || !world.IsCreated)
            {
                ClearCache();
                return false;
            }

            EnsureQuery(world);
            var em = world.EntityManager;

            if (_hasCachedCapital)
            {
                if (em.Exists(_cachedCapital) && em.HasComponent<Building>(_cachedCapital))
                {
                    _cachedRootHex = em.GetComponentData<Building>(_cachedCapital).RootHex;
                    return true;
                }

                _hasCachedCapital = false;
                _cachedCapital = Entity.Null;
                _cachedRootHex = default;
            }

            if (_query.IsEmptyIgnoreFilter)
                return false;

            _cachedCapital = _query.GetSingletonEntity();
            _cachedRootHex = em.GetComponentData<Building>(_cachedCapital).RootHex;
            _hasCachedCapital = true;
            return true;
        }

        static void EnsureQuery(World world)
        {
            if (_boundWorld == world)
                return;

            _boundWorld = world;
            _query = world.EntityManager.CreateEntityQuery(
                ComponentType.ReadOnly<CapitalTag>(),
                ComponentType.ReadOnly<Building>());

            _hasCachedCapital = false;
            _cachedCapital = Entity.Null;
            _cachedRootHex = default;
        }

        static void ClearCache()
        {
            _boundWorld = null;
            _query = default;
            _cachedCapital = Entity.Null;
            _cachedRootHex = default;
            _hasCachedCapital = false;
        }
    }
}
