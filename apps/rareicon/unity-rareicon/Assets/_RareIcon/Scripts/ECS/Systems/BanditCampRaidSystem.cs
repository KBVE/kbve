using Unity.Entities;
using Unity.Mathematics;

namespace RareIcon
{
    /// <summary>Per-camp raid dispatch. When NowTick passes BanditCampState.NextRaidTick, spawns RaidPartySize bandits at jittered positions near the camp's RootHex and re-arms for the next cadence. Main-thread SystemBase because UnitSpawnSystem.SpawnBanditAt touches managed render assets; raid cadence is low-frequency so the main-thread cost is negligible.</summary>
    [UpdateInGroup(typeof(BehaviorSystemGroup))]
    [UpdateAfter(typeof(BanditCampSpawnerSystem))]
    public partial class BanditCampRaidSystem : SystemBase
    {
        uint _rng = 0xB4D_B01Du;

        protected override void OnCreate()
        {
            RequireForUpdate<BanditCampTag>();
        }

        protected override void OnUpdate()
        {
            uint nowTick = (uint)(SystemAPI.Time.ElapsedTime * 1000d);

            var em = EntityManager;
            foreach (var (stateRef, building, campEntity) in
                     SystemAPI.Query<RefRW<BanditCampState>, RefRO<Building>>()
                              .WithAll<BanditCampTag>()
                              .WithEntityAccess())
            {
                ref var state = ref stateRef.ValueRW;
                if (nowTick < state.NextRaidTick) continue;

                int2 campHex = building.ValueRO.RootHex;
                int party = state.RaidPartySize;
                for (int i = 0; i < party; i++)
                {
                    _rng = XorShift(_rng);
                    int dx = (int)(_rng % 5u) - 2;
                    _rng = XorShift(_rng);
                    int dy = (int)(_rng % 5u) - 2;

                    int2 spawnHex = new int2(campHex.x + dx, campHex.y + dy);
                    _rng = XorShift(_rng);
                    UnitSpawnSystem.SpawnBanditAt(em, spawnHex, _rng | 1u);
                }

                state.NextRaidTick = nowTick + state.RaidCadenceTicks;
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
