using Unity.Entities;
using Unity.Mathematics;

namespace RareIcon
{
    /// <summary>Periodically spawns Hostile units (goblins + bandits) on a ring around the Capital, capped by a max alive count. Bandit chance ramps with the wave so early raids are pure goblin and later waves carry mixed bandits as the empire grows.</summary>

    [UpdateInGroup(typeof(BehaviorSystemGroup))]
    public partial class HostileSpawnerSystem : SystemBase
    {
        const float Interval        = 8.0f;
        const int   MaxHostiles     = 12;
        const int   SpawnRingHexes  = 32;
        const int   SpawnRingJitter = 6;
        const int   SpawnBatchSize  = 2;

        const float BanditShareStart = 0.0f;
        const float BanditShareCap   = 0.5f;
        const int   BanditRampWaves  = 10;

        int   _waveIndex;

        float _timer;
        uint  _rng = 0xB01D_FACEu;

        EntityQuery _banditCampQuery;

        protected override void OnCreate()
        {
            RequireForUpdate<Building>();
            _banditCampQuery = GetEntityQuery(ComponentType.ReadOnly<BanditCampTag>());
        }

        protected override void OnUpdate()
        {
            if (!MultiplayerAuthority.IsAuthority) return;

            _timer += SystemAPI.Time.DeltaTime;
            if (_timer < Interval) return;
            _timer = 0f;

            if (!SystemAPI.TryGetSingletonEntity<CapitalTag>(out var capital)) return;
            int2 capitalHex = SystemAPI.GetComponent<Building>(capital).RootHex;

            int alive = 0;
            foreach (var f in SystemAPI.Query<RefRO<Faction>>())
            {
                if (f.ValueRO.Value == FactionType.Hostile) alive++;
            }
            if (alive >= MaxHostiles) return;

            bool campActive = !_banditCampQuery.IsEmpty;

            int spawn = math.min(SpawnBatchSize, MaxHostiles - alive);
            float banditShare = campActive
                ? 0f
                : math.lerp(BanditShareStart, BanditShareCap,
                    math.saturate((float)_waveIndex / BanditRampWaves));
            _waveIndex++;

            for (int i = 0; i < spawn; i++)
            {
                _rng = XorShift(_rng);
                float angle = (_rng & 0xFFFFu) / 65535f * math.PI * 2f;
                _rng = XorShift(_rng);
                int radius = SpawnRingHexes + (int)(_rng % (uint)SpawnRingJitter);

                int q = capitalHex.x + (int)math.round(math.cos(angle) * radius);
                int r = capitalHex.y + (int)math.round(math.sin(angle) * radius);

                _rng = XorShift(_rng);
                float kindRoll = (_rng & 0xFFFFu) / 65535f;

                _rng = XorShift(_rng);
                if (kindRoll < banditShare)
                {
                    UnitSpawnSystem.SpawnBanditAt(
                        EntityManager,
                        new int2(q, r),
                        _rng | 1u);
                }
                else
                {
                    UnitSpawnSystem.SpawnGoblinAt(
                        EntityManager,
                        new int2(q, r),
                        _rng | 1u,
                        default,
                        FactionType.Hostile);
                }
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
