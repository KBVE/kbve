using Unity.Collections;
using Unity.Entities;
using Unity.Mathematics;

namespace RareIcon
{
    /// <summary>Allied city-states periodically gift the player a Soldier mercenary spawned at the Capital's RootHex. Cadence is shared across all Allied cities (one gift per cadence regardless of count) so the empire isn't flooded by a stack of allies. Manages own elapsed-time tracker since cadence is in real seconds rather than turns — keeps the gift rate even across speed scaling.</summary>
    [WorldSystemFilter(WorldSystemFilterFlags.LocalSimulation | WorldSystemFilterFlags.ClientSimulation | WorldSystemFilterFlags.ThinClientSimulation)]
    [UpdateInGroup(typeof(BehaviorSystemGroup))]
    public partial class CityStateMercenaryGiftSystem : SystemBase
    {
        const float CadenceSeconds = 120f;
        const float JitterRadius   = 2f;

        float _timer;
        uint  _rng = 0x6F39E120u;
        EntityQuery _alliedQuery;

        protected override void OnCreate()
        {
            _timer = CadenceSeconds * 0.5f;
            _alliedQuery = GetEntityQuery(
                ComponentType.ReadOnly<CityStateTag>(),
                ComponentType.ReadOnly<CityStateStatus>());
        }

        protected override void OnUpdate()
        {
            _timer -= SystemAPI.Time.DeltaTime;
            if (_timer > 0f) return;
            _timer = CadenceSeconds;

            if (!SystemAPI.TryGetSingletonEntity<CapitalTag>(out var capital)) return;
            int2 capitalHex = SystemAPI.GetComponent<Building>(capital).RootHex;

            int alliedCount = 0;
            foreach (var status in SystemAPI.Query<RefRO<CityStateStatus>>().WithAll<CityStateTag>())
                if (status.ValueRO.Value == CityStateStatusValue.Allied) alliedCount++;
            if (alliedCount == 0) return;

            int totalGifts = math.min(alliedCount, 3);
            for (int i = 0; i < totalGifts; i++)
            {
                _rng = XorShift(_rng);
                int dx = (int)(_rng % 5u) - 2;
                _rng = XorShift(_rng);
                int dy = (int)(_rng % 5u) - 2;
                int2 hex = new int2(capitalHex.x + dx, capitalHex.y + dy);

                _rng = XorShift(_rng);
                UnitSpawnSystem.SpawnGoblinAt(
                    EntityManager, hex, _rng | 1u,
                    state:    default,
                    faction:  FactionType.Player,
                    unitType: UnitType.Soldier);
            }
        }

        static uint XorShift(uint s)
        {
            s ^= s << 13; s ^= s >> 17; s ^= s << 5;
            return s == 0 ? 1u : s;
        }
    }
}
