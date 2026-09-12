using Unity.Collections;
using Unity.Entities;
using Unity.Mathematics;

namespace RareIcon
{
    /// <summary>Per-camp raid dispatch. When NowTick passes <see cref="BanditCampState.NextRaidTick"/>, spawns <see cref="BanditCampState.RaidPartySize"/> bandits stacked on the camp's RootHex (they emerge from the camp itself and disperse via wander/hunt) and re-arms for the next cadence. Independently of cadence, if a camp's <see cref="BanditCampStockpile.Loot"/> exceeds the next-tier cost by <see cref="OverflowExcess"/>, spends <see cref="OverflowSpend"/> loot to fire an immediate <see cref="OverflowPartySize"/>-bandit surprise wave so untouched camps don't just stockpile forever. Main-thread SystemBase because UnitSpawnSystem.SpawnBanditAt touches managed render assets; spawns are queued during the query iteration and executed after it closes so the structural changes don't invalidate the live iterator.</summary>
    [WorldSystemFilter(WorldSystemFilterFlags.LocalSimulation | WorldSystemFilterFlags.ClientSimulation | WorldSystemFilterFlags.ThinClientSimulation)]
    [UpdateInGroup(typeof(BehaviorSystemGroup))]
    [UpdateAfter(typeof(BanditCampSpawnerSystem))]
    public partial class BanditCampRaidSystem : SystemBase
    {
        const ushort StrongholdLootCost = 30;
        const ushort FortressLootCost   = 80;
        const ushort OverflowExcess     = 50;
        const ushort OverflowSpend      = 50;
        const byte   OverflowPartySize  = 4;

        uint _rng = 0xB4D_B01Du;

        protected override void OnCreate()
        {
            RequireForUpdate<BanditCampTag>();
        }

        protected override void OnUpdate()
        {
            uint nowTick = (uint)(SystemAPI.Time.ElapsedTime * 1000d);

            var pending = new NativeList<int2>(16, Allocator.Temp);

            foreach (var (stateRef, growthRO, stockpileRef, building) in
                     SystemAPI.Query<RefRW<BanditCampState>,
                                     RefRO<BanditCampGrowth>,
                                     RefRW<BanditCampStockpile>,
                                     RefRO<Building>>()
                              .WithAll<BanditCampTag>())
            {
                ref var state     = ref stateRef.ValueRW;
                ref var stockpile = ref stockpileRef.ValueRW;
                int2 campHex      = building.ValueRO.RootHex;

                if (nowTick >= state.NextRaidTick)
                {
                    int party = state.RaidPartySize;
                    for (int i = 0; i < party; i++)
                        pending.Add(campHex);
                    state.NextRaidTick = nowTick + state.RaidCadenceTicks;
                }

                ushort tierCost = growthRO.ValueRO.Tier == 0
                    ? StrongholdLootCost
                    : (growthRO.ValueRO.Tier == 1 ? FortressLootCost : (ushort)0);
                int overflowThreshold = tierCost + OverflowExcess;
                if (stockpile.Loot >= overflowThreshold)
                {
                    stockpile.Loot = (ushort)(stockpile.Loot - OverflowSpend);
                    for (int i = 0; i < OverflowPartySize; i++)
                        pending.Add(campHex);
                }
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
