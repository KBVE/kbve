using Unity.Collections;
using Unity.Entities;
using Unity.Mathematics;

namespace RareIcon
{
    /// <summary>Periodic oceanic spawner — once every <see cref="Interval"/> seconds, if fewer than <see cref="MaxWhales"/> whales are alive, picks a random river/ocean hex from the hex lookup and emits a <see cref="SpawnWhaleRequest"/>. Pure sampling rejection loop; bails cheaply when the cap is hit.</summary>
    [UpdateInGroup(typeof(BehaviorSystemGroup))]
    public partial class WhaleSpawnerSystem : SystemBase
    {
        const float Interval  = 30f;
        const int   MaxWhales = 3;
        const int   MaxTries  = 16;

        float _timer;
        uint  _rng = 0xCAFEB0B5u;

        EntityQuery _whaleQuery;

        protected override void OnCreate()
        {
            RequireForUpdate<HexLookupSingleton>();
            _whaleQuery = GetEntityQuery(ComponentType.ReadOnly<WhaleTag>());
        }

        protected override void OnUpdate()
        {
            _timer += SystemAPI.Time.DeltaTime;
            if (_timer < Interval) return;
            _timer = 0f;

            if (_whaleQuery.CalculateEntityCount() >= MaxWhales) return;

            var em = EntityManager;
            var lookup = SystemAPI.GetSingleton<HexLookupSingleton>().Lookup;

            var keys = lookup.GetKeyArray(Allocator.Temp);
            if (keys.Length == 0) { keys.Dispose(); return; }

            // Rejection-sample a water hex out of the lookup — cheap when
            // the world is water-heavy; bails without spawning if all
            // sampled tiles come up dry, which is fine (whale pop cap is
            // already below target next tick).
            int2 spawn = default;
            bool found = false;
            for (int i = 0; i < MaxTries; i++)
            {
                _rng = XorShift(_rng);
                int idx = (int)(_rng % (uint)keys.Length);
                var hex = keys[idx];
                if (!lookup.TryGetValue(hex, out var tile)) continue;
                if (!em.HasComponent<BiomeType>(tile)) continue;
                byte biome = em.GetComponentData<BiomeType>(tile).Value;
                if (biome != BiomeGenerator.BIOME_RIVER && biome != BiomeGenerator.BIOME_OCEAN)
                    continue;
                spawn = hex;
                found = true;
                break;
            }
            keys.Dispose();

            if (!found) return;

            _rng = XorShift(_rng);
            var req = em.CreateEntity();
            em.AddComponentData(req, new SpawnWhaleRequest
            {
                Hex  = spawn,
                Seed = _rng | 1u,
            });
        }

        static uint XorShift(uint s)
        {
            s ^= s << 13;
            s ^= s >> 17;
            s ^= s << 5;
            return s == 0 ? 1u : s;
        }
    }

    /// <summary>Main-thread drain for <see cref="SpawnWhaleRequest"/> — UnitSpawnSystem.SpawnWhaleAt needs managed asset access.</summary>
    [UpdateInGroup(typeof(BehaviorSystemGroup))]
    [UpdateAfter(typeof(WhaleSpawnerSystem))]
    public partial class WhaleSpawnApplierSystem : SystemBase
    {
        protected override void OnUpdate()
        {
            var em = EntityManager;
            var reqEntities = new NativeList<Entity>(4, Allocator.Temp);
            foreach (var (_, reqEntity) in
                     SystemAPI.Query<RefRO<SpawnWhaleRequest>>().WithEntityAccess())
            {
                reqEntities.Add(reqEntity);
            }

            for (int i = 0; i < reqEntities.Length; i++)
            {
                var reqEntity = reqEntities[i];
                var data = em.GetComponentData<SpawnWhaleRequest>(reqEntity);
                UnitSpawnSystem.SpawnWhaleAt(em, data.Hex, data.Seed);
                em.DestroyEntity(reqEntity);
            }

            reqEntities.Dispose();
        }
    }
}
