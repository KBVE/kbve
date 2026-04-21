using Unity.Entities;
using Unity.Mathematics;

namespace RareIcon
{
    /// <summary>Managed-side bridge to the Capital entity in the default DOTS world; returns false until the player builds one (CapitalTag becomes the singleton).</summary>
    public static class CapitalLocator
    {
        static EntityQuery _query;
        static bool _queryReady;

        public static bool TryGetRootHex(out int2 hex)
        {
            hex = default;
            if (!TryGetEntity(out var capital)) return false;
            var world = World.DefaultGameObjectInjectionWorld;
            hex = world.EntityManager.GetComponentData<Building>(capital).RootHex;
            return true;
        }

        public static bool TryGetEntity(out Entity capital)
        {
            capital = Entity.Null;
            var world = World.DefaultGameObjectInjectionWorld;
            if (world == null || !world.IsCreated) return false;

            EnsureQuery(world);
            if (_query.CalculateEntityCount() == 0) return false;
            capital = _query.GetSingletonEntity();
            return true;
        }

        static void EnsureQuery(World world)
        {
            if (_queryReady) return;
            _query = world.EntityManager.CreateEntityQuery(
                ComponentType.ReadOnly<CapitalTag>());
            _queryReady = true;
        }
    }
}
