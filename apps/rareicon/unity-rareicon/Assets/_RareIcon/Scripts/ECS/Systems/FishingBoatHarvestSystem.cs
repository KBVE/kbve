using Unity.Burst;
using Unity.Collections;
using Unity.Entities;
using Unity.Mathematics;
using Unity.Transforms;

namespace RareIcon
{
    /// <summary>Abstract fishing tick — every <see cref="HarvestCadenceSecs"/>, each FishingBoat scans a small radius around its current hex for a river tile carrying <see cref="WaterResource"/> stock, decrements the catch by 1, and deposits the resulting fish into the Capital's <see cref="CapitalLedger"/>. Skips physical movement to a fish hex (boat already wanders the river); the catch is treated as ambient line-fishing rather than a per-trip animation. River hexes regen passively from <see cref="WaterResourceRegenSystem"/>.</summary>
    [UpdateInGroup(typeof(SimulationSystemGroup))]
    public partial struct FishingBoatHarvestSystem : ISystem
    {
        const float HarvestCadenceSecs = 6f;
        const float HarvestRadius      = 5f;
        const float HexSize            = 0.25f;

        float _accum;

        public void OnCreate(ref SystemState state)
        {
            state.RequireForUpdate<FishingBoatTag>();
            state.RequireForUpdate<CapitalTag>();
            state.RequireForUpdate<WorldClock>();
        }

        [BurstCompile] public void OnDestroy(ref SystemState state) { }

        public void OnUpdate(ref SystemState state)
        {
            _accum += SystemAPI.Time.DeltaTime;
            if (_accum < HarvestCadenceSecs) return;
            _accum = 0f;

            var capital = SystemAPI.GetSingletonEntity<CapitalTag>();
            var em      = state.EntityManager;
            if (!em.HasBuffer<CapitalLedger>(capital)) return;

            var waterQuery = em.CreateEntityQuery(
                ComponentType.ReadWrite<WaterResource>(),
                ComponentType.ReadOnly<HexCoord>());
            using var waterArr = waterQuery.ToEntityArray(Allocator.Temp);
            if (waterArr.Length == 0) return;

            var ledger = em.GetBuffer<CapitalLedger>(capital).Reinterpret<BankLedgerBase>();

            int harvested = 0;
            foreach (var (boatTf, _) in
                     SystemAPI.Query<RefRO<LocalTransform>>().WithAll<FishingBoatTag>())
            {
                int2 boatHex = HexMeshUtil.WorldToHex(boatTf.ValueRO.Position.x, boatTf.ValueRO.Position.y, HexSize);
                int  bestIdx = -1;
                int  bestDist = int.MaxValue;
                for (int i = 0; i < waterArr.Length; i++)
                {
                    var wr = em.GetComponentData<WaterResource>(waterArr[i]);
                    if (wr.Amount == 0) continue;
                    var hc = em.GetComponentData<HexCoord>(waterArr[i]);
                    int d = HexMeshUtil.HexDistance(boatHex, new int2(hc.Q, hc.R));
                    if (d > HarvestRadius) continue;
                    if (d < bestDist) { bestDist = d; bestIdx = i; }
                }
                if (bestIdx < 0) continue;

                var pick = waterArr[bestIdx];
                var pickWr = em.GetComponentData<WaterResource>(pick);
                pickWr.Amount = (byte)math.max(0, pickWr.Amount - 1);
                em.SetComponentData(pick, pickWr);

                BankLedgerOps.AddItem(ref ledger, pickWr.ItemId, 1, UlidFactory.NewUid());
                harvested++;
            }
        }
    }

    /// <summary>Background regen for depleted <see cref="WaterResource"/> stocks. Each tick walks the population and tops up by 1 toward MaxAmount when the per-hex regen timer has elapsed. Cheap because the work scales with currently-loaded river hexes only.</summary>
    [UpdateInGroup(typeof(SimulationSystemGroup))]
    [UpdateAfter(typeof(FishingBoatHarvestSystem))]
    public partial struct WaterResourceRegenSystem : ISystem
    {
        const float RegenSeconds = 8f;
        const float RegenCadence = 2f;

        float _accum;

        public void OnCreate(ref SystemState state)
        {
            state.RequireForUpdate<WaterResource>();
            state.RequireForUpdate<WorldClock>();
        }

        [BurstCompile] public void OnDestroy(ref SystemState state) { }

        public void OnUpdate(ref SystemState state)
        {
            _accum += SystemAPI.Time.DeltaTime;
            if (_accum < RegenCadence) return;
            _accum = 0f;

            float now = SystemAPI.GetSingleton<WorldClock>().AbsSeconds;

            foreach (var wrRW in SystemAPI.Query<RefRW<WaterResource>>())
            {
                ref var wr = ref wrRW.ValueRW;
                if (wr.Amount >= wr.MaxAmount) continue;
                if (now < wr.NextRegenSecond) continue;
                wr.Amount++;
                wr.NextRegenSecond = now + RegenSeconds;
            }
        }
    }
}
