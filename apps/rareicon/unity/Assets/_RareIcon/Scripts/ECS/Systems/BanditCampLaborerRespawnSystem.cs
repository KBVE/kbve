using Unity.Collections;
using Unity.Entities;
using Unity.Mathematics;

namespace RareIcon
{
    /// <summary>Refills a camp's laborer cohort when chores die or wander into combat. Counts <see cref="BanditHome"/> entities grouped by camp, and for each camp under <see cref="LaborerQuota"/> spends <see cref="LaborerCost"/> loot from <see cref="BanditCampStockpile"/> to spawn a replacement laborer at the camp hex. Cadence-gated per camp via <see cref="BanditCampStockpile.NextLaborerRespawnTick"/> so a deep stockpile doesn't dump 4 fresh laborers in one frame.</summary>
    [WorldSystemFilter(WorldSystemFilterFlags.LocalSimulation | WorldSystemFilterFlags.ClientSimulation | WorldSystemFilterFlags.ThinClientSimulation)]
    [UpdateInGroup(typeof(BehaviorSystemGroup))]
    [UpdateAfter(typeof(BanditCampSpawnerSystem))]
    public partial class BanditCampLaborerRespawnSystem : SystemBase
    {
        const byte   LaborerQuota         = 4;
        const ushort LaborerCost          = 10;
        const uint   RespawnCadenceTicks  = 20000u;

        protected override void OnCreate()
        {
            RequireForUpdate<BanditCampStockpile>();
        }

        protected override void OnUpdate()
        {
            uint nowTick = (uint)(SystemAPI.Time.ElapsedTime * 1000d);

            var counts = new NativeHashMap<Entity, int>(8, Allocator.Temp);

            foreach (var home in SystemAPI.Query<RefRO<BanditHome>>())
            {
                var camp = home.ValueRO.Camp;
                if (camp == Entity.Null) continue;
                if (counts.TryGetValue(camp, out var c)) counts[camp] = c + 1;
                else counts.Add(camp, 1);
            }

            var pending = new NativeList<PendingRespawn>(4, Allocator.Temp);

            foreach (var (stockpileRef, building, entity) in
                     SystemAPI.Query<RefRW<BanditCampStockpile>, RefRO<Building>>()
                              .WithAll<BanditCampTag>().WithEntityAccess())
            {
                ref var stockpile = ref stockpileRef.ValueRW;
                if (nowTick < stockpile.NextLaborerRespawnTick) continue;

                int count = counts.TryGetValue(entity, out var c) ? c : 0;
                if (count >= LaborerQuota) continue;
                if (stockpile.Loot < LaborerCost) continue;

                stockpile.Loot = (ushort)(stockpile.Loot - LaborerCost);
                stockpile.NextLaborerRespawnTick = nowTick + RespawnCadenceTicks;

                pending.Add(new PendingRespawn
                {
                    Camp    = entity,
                    CampHex = building.ValueRO.RootHex,
                });
            }

            counts.Dispose();

            var em = EntityManager;
            uint rng = nowTick | 1u;
            for (int i = 0; i < pending.Length; i++)
            {
                rng = XorShift(rng);
                var laborer = UnitSpawnSystem.SpawnBanditAt(em, pending[i].CampHex, rng);
                if (laborer == Entity.Null) continue;
                em.AddComponentData(laborer, new BanditHome
                {
                    Camp    = pending[i].Camp,
                    CampHex = pending[i].CampHex,
                });
                em.AddComponentData(laborer, new BanditChore
                {
                    Phase       = 0,
                    TargetHex   = pending[i].CampHex,
                    NextActTick = nowTick + 1500u,
                });
            }
            pending.Dispose();
        }

        struct PendingRespawn
        {
            public Entity Camp;
            public int2   CampHex;
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
