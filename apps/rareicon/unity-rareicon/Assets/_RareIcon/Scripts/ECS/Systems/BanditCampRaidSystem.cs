using Unity.Collections;
using Unity.Entities;
using Unity.Mathematics;

namespace RareIcon
{
    /// <summary>Per-camp raid dispatch. When NowTick passes BanditCampState.NextRaidTick, spawns RaidPartySize bandits at jittered positions near the camp's RootHex and re-arms for the next cadence. Main-thread SystemBase because UnitSpawnSystem.SpawnBanditAt touches managed render assets; spawns are queued during the query iteration and executed after it closes so the structural changes don't invalidate the live iterator.</summary>
    [WorldSystemFilter(WorldSystemFilterFlags.LocalSimulation | WorldSystemFilterFlags.ClientSimulation | WorldSystemFilterFlags.ThinClientSimulation)]
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

            var pending = new NativeList<int2>(16, Allocator.Temp);

            foreach (var (stateRef, building) in
                     SystemAPI.Query<RefRW<BanditCampState>, RefRO<Building>>()
                              .WithAll<BanditCampTag>())
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
                    pending.Add(new int2(campHex.x + dx, campHex.y + dy));
                }

                state.NextRaidTick = nowTick + state.RaidCadenceTicks;
            }

            var em = EntityManager;
            for (int i = 0; i < pending.Length; i++)
            {
                _rng = XorShift(_rng);
                UnitSpawnSystem.SpawnBanditAt(em, pending[i], _rng | 1u);
            }
            pending.Dispose();
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
