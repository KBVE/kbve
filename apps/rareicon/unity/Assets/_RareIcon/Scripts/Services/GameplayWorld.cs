using Unity.Entities;

namespace RareIcon
{
    /// <summary>Pushes the gameplay World ref into <see cref="GameplayWorld"/>. SystemBase (managed) so it can call into a managed static. Filtered to the same world flags as every gameplay system so it lands in ClientWorld / LocalSimulation only.</summary>
    [WorldSystemFilter(WorldSystemFilterFlags.LocalSimulation | WorldSystemFilterFlags.ClientSimulation | WorldSystemFilterFlags.ThinClientSimulation)]
    [UpdateInGroup(typeof(InitializationSystemGroup), OrderFirst = true)]
    public partial class GameplayWorldRegistrarSystem : SystemBase
    {
        protected override void OnCreate()
        {
            GameplayWorld.Register(World);
            Enabled = false;
        }
        protected override void OnUpdate() { }
    }

    /// <summary>Resolves the World that holds gameplay entities (King, Capital, units, hex tiles). NetCode's bootstrap creates ServerWorld + ClientWorld, but every gameplay system uses <c>WorldSystemFilter(LocalSimulation | ClientSimulation | ThinClientSimulation)</c> so all entities live only in the client/local world. <c>World.DefaultGameObjectInjectionWorld</c> can resolve to ServerWorld depending on bootstrap order, so UI / VContainer services must use this helper instead.</summary>
    public static class GameplayWorld
    {
        static World _cached;

        /// <summary>Called from a gameplay-world system's OnCreate to push the World ref into the cache. Eliminates the lazy-scan cost on the first call.</summary>
        public static void Register(World world) => _cached = world;

        public static World Resolve()
        {
            if (_cached != null && _cached.IsCreated) return _cached;
            _cached = null;
            foreach (var w in World.All)
            {
                if (!w.IsCreated) continue;
                if ((w.Flags & WorldFlags.GameServer) != 0) continue;
                using var q = w.EntityManager.CreateEntityQuery(ComponentType.ReadOnly<HexDBSingleton>());
                if (q.IsEmpty) continue;
                _cached = w;
                break;
            }
            if (_cached == null) _cached = World.DefaultGameObjectInjectionWorld;
            return _cached;
        }

        public static void Invalidate() => _cached = null;
    }
}
