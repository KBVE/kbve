using Unity.Entities;
using Unity.Mathematics;

namespace RareIcon
{
    /// <summary>Periodically spawns Hostile goblins on a ring around the Capital, capped by a max alive count.</summary>
    // TODO(rust-ffi): wave cadence + max-alive cap belong on the server side so the cap is authoritative — replace local _timer / _rng with reads from a Rust-owned spawn director.
    [UpdateInGroup(typeof(BehaviorSystemGroup))]
    public partial class HostileSpawnerSystem : SystemBase
    {
        const float Interval       = 8.0f;
        const int   MaxHostiles    = 12;
        const int   SpawnRingHexes = 32;
        const int   SpawnRingJitter = 6;
        const int   SpawnBatchSize = 2;

        float _timer;
        uint  _rng = 0xB01D_FACEu;

        protected override void OnCreate()
        {
            RequireForUpdate<Building>();
        }

        protected override void OnUpdate()
        {
            _timer += SystemAPI.Time.DeltaTime;
            if (_timer < Interval) return;
            _timer = 0f;

            int2 capitalHex = default;
            bool hasCapital = false;
            foreach (var b in SystemAPI.Query<RefRO<Building>>())
            {
                if (b.ValueRO.Type == BuildingType.Capital)
                {
                    capitalHex = b.ValueRO.RootHex;
                    hasCapital = true;
                    break;
                }
            }
            if (!hasCapital) return;

            int alive = 0;
            foreach (var f in SystemAPI.Query<RefRO<Faction>>())
            {
                if (f.ValueRO.Value == FactionType.Hostile) alive++;
            }
            if (alive >= MaxHostiles) return;

            int spawn = math.min(SpawnBatchSize, MaxHostiles - alive);
            for (int i = 0; i < spawn; i++)
            {
                _rng = XorShift(_rng);
                float angle = (_rng & 0xFFFFu) / 65535f * math.PI * 2f;
                _rng = XorShift(_rng);
                int radius = SpawnRingHexes + (int)(_rng % (uint)SpawnRingJitter);

                int q = capitalHex.x + (int)math.round(math.cos(angle) * radius);
                int r = capitalHex.y + (int)math.round(math.sin(angle) * radius);

                _rng = XorShift(_rng);
                UnitSpawnSystem.SpawnGoblinAt(
                    EntityManager,
                    new int2(q, r),
                    _rng | 1u,
                    default,
                    FactionType.Hostile);
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
