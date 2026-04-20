using Unity.Entities;
using Unity.Mathematics;

namespace RareIcon
{
    /// <summary>Night-only Zombie wave spawner: drops escalating clusters on a ring around the Capital while WorldClock is in night, capped by total alive.</summary>
    [UpdateInGroup(typeof(BehaviorSystemGroup))]
    public partial class ZombieNightSpawnSystem : SystemBase
    {
        const float Interval         = 12.0f;
        const int   MaxZombies       = 18;
        const int   SpawnRingHexes   = 22;
        const int   SpawnRingJitter  = 5;
        const int   ClusterMinSize   = 2;
        const int   ClusterGrowthCap = 7;
        const int   ClusterRadius    = 2;

        float _timer;
        uint  _rng = 0xDEADB0DFu;
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
                if (u.ValueRO.Type == UnitType.Zombie) alive++;
            }
            if (alive >= MaxZombies) return;

            int clusterSize = math.clamp((int)nightIndex + ClusterMinSize - 1,
                                          ClusterMinSize, ClusterGrowthCap);
            int budget = math.min(clusterSize, MaxZombies - alive);

            _rng = XorShift(_rng);
            float angle = (_rng & 0xFFFFu) / 65535f * math.PI * 2f;
            _rng = XorShift(_rng);
            int radius = SpawnRingHexes + (int)(_rng % (uint)SpawnRingJitter);
            int cq = capitalHex.x + (int)math.round(math.cos(angle) * radius);
            int cr = capitalHex.y + (int)math.round(math.sin(angle) * radius);

            for (int i = 0; i < budget; i++)
            {
                _rng = XorShift(_rng);
                int dq = (int)(_rng % (uint)(ClusterRadius * 2 + 1)) - ClusterRadius;
                _rng = XorShift(_rng);
                int dr = (int)(_rng % (uint)(ClusterRadius * 2 + 1)) - ClusterRadius;

                _rng = XorShift(_rng);
                UnitSpawnSystem.SpawnZombieAt(
                    EntityManager,
                    new int2(cq + dq, cr + dr),
                    _rng | 1u);
            }
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
