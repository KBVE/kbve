using Unity.Entities;
using Unity.Mathematics;

namespace RareIcon
{
    /// <summary>Night-only Skeleton wave spawner — sister system to <see cref="ZombieNightSpawnSystem"/>. Drops a small cluster on a wider ring around the Capital each night, capped by total alive. Variant byte rolls per cluster (Plain default; Guard / Wraith / Fungal / Desert sprinkled in as the night index climbs) so the cluster gains visual + mechanical variety without needing a graveyard building. Runs alongside Zombie night spawns; the alive cap keeps the two from compounding into FPS oblivion.</summary>
    [UpdateInGroup(typeof(BehaviorSystemGroup))]
    public partial class SkeletonNightSpawnSystem : SystemBase
    {
        const float Interval         = 18.0f;
        const int   MaxSkeletons     = 14;
        const int   SpawnRingHexes   = 26;
        const int   SpawnRingJitter  = 6;
        const int   ClusterMinSize   = 2;
        const int   ClusterGrowthCap = 5;
        const int   ClusterRadius    = 2;

        float _timer;
        uint  _rng = 0xB0DECADEu & 0x7FFFFFFFu;
        uint  _lastNightIndex = uint.MaxValue;

        protected override void OnCreate()
        {
            RequireForUpdate<WorldClock>();
            RequireForUpdate<Building>();
        }

        protected override void OnUpdate()
        {
            var clock = SystemAPI.GetSingleton<WorldClock>();
            if (clock.IsDay)
            {
                _timer = 0f;
                return;
            }

            uint nightIndex = (clock.TurnIndex + 1u) / 2u;
            if (nightIndex != _lastNightIndex)
            {
                _timer = Interval;
                _lastNightIndex = nightIndex;
            }

            _timer += SystemAPI.Time.DeltaTime;
            if (_timer < Interval) return;
            _timer = 0f;

            if (!SystemAPI.TryGetSingletonEntity<CapitalTag>(out var capital)) return;
            int2 capitalHex = SystemAPI.GetComponent<Building>(capital).RootHex;

            int alive = 0;
            foreach (var u in SystemAPI.Query<RefRO<Unit>>())
            {
                if (u.ValueRO.Type == UnitType.Skeleton) alive++;
            }
            if (alive >= MaxSkeletons) return;

            int clusterSize = math.clamp((int)nightIndex + ClusterMinSize - 1,
                                          ClusterMinSize, ClusterGrowthCap);
            int budget = math.min(clusterSize, MaxSkeletons - alive);

            _rng = XorShift(_rng);
            float angle = (_rng & 0xFFFFu) / 65535f * math.PI * 2f;
            _rng = XorShift(_rng);
            int radius = SpawnRingHexes + (int)(_rng % (uint)SpawnRingJitter);
            int cq = capitalHex.x + (int)math.round(math.cos(angle) * radius);
            int cr = capitalHex.y + (int)math.round(math.sin(angle) * radius);

            byte variant = RollVariant(nightIndex, ref _rng);

            for (int i = 0; i < budget; i++)
            {
                _rng = XorShift(_rng);
                int dq = (int)(_rng % (uint)(ClusterRadius * 2 + 1)) - ClusterRadius;
                _rng = XorShift(_rng);
                int dr = (int)(_rng % (uint)(ClusterRadius * 2 + 1)) - ClusterRadius;

                _rng = XorShift(_rng);
                UnitSpawnSystem.SpawnSkeletonAt(
                    EntityManager,
                    new int2(cq + dq, cr + dr),
                    _rng | 1u,
                    variant);
            }
        }

        static byte RollVariant(uint nightIndex, ref uint rng)
        {
            rng = XorShift(rng);
            uint roll = rng % 100u;
            if (nightIndex >= 5 && roll < 8u)  return SkeletonVariantValue.Wraith;
            if (nightIndex >= 3 && roll < 22u) return SkeletonVariantValue.Guard;
            if (roll < 32u) return SkeletonVariantValue.Fungal;
            if (roll < 42u) return SkeletonVariantValue.Desert;
            return SkeletonVariantValue.Plain;
        }

        static uint XorShift(uint s)
        {
            s ^= s << 13;
            s ^= s >> 17;
            s ^= s << 5;
            return s == 0 ? 1u : s;
        }
    }
}
