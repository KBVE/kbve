using Unity.Collections;
using Unity.Entities;
using Unity.Mathematics;

namespace RareIcon
{
    /// <summary>Turn-cadence boat crafting at every Dock: once per CadenceTurns, drain TimberCost Timber from the Capital's CapitalLedger and emit a <see cref="SpawnFishingBoatRequest"/> on a river hex adjacent to the dock. Requests are queued in a NativeList during iteration and materialised as entities after the query closes so the structural changes don't invalidate the live iterator.</summary>
    [UpdateInGroup(typeof(EconomySystemGroup))]
    public partial class DockProductionSystem : SystemBase
    {
        protected override void OnCreate()
        {
            RequireForUpdate<DockTag>();
        }

        protected override void OnUpdate()
        {
            if (!SystemAPI.HasSingleton<WorldClock>()) return;
            uint turn = SystemAPI.GetSingleton<WorldClock>().TurnIndex;

            if (!SystemAPI.TryGetSingletonEntity<CapitalTag>(out var capital)) return;
            if (!EntityManager.HasBuffer<CapitalLedger>(capital)) return;

            var em = EntityManager;
            var capitalBuf = em.GetBuffer<CapitalLedger>(capital).Reinterpret<BankLedgerBase>();

            var pending = new NativeList<SpawnFishingBoatRequest>(8, Allocator.Temp);

            foreach (var (prodRef, building, entity) in
                     SystemAPI.Query<RefRW<DockProduction>, RefRO<Building>>()
                         .WithAll<DockTag>().WithEntityAccess())
            {
                var prod = prodRef.ValueRO;

                float tender = em.HasComponent<TenderMultiplier>(entity)
                    ? em.GetComponentData<TenderMultiplier>(entity).Value
                    : 0f;
                uint effectiveCadence = tender > 0.5f
                    ? (uint)math.max(1, (prod.CadenceTurns + 1) / 2)
                    : prod.CadenceTurns;
                if (turn < prod.LastProducedTurn + effectiveCadence) continue;

                if (BankLedgerOps.CountOf(capitalBuf, (ushort)ItemId.Timber) < prod.TimberCost)
                    continue;

                BankLedgerOps.RemoveItem(ref capitalBuf, (ushort)ItemId.Timber, prod.TimberCost);

                int2 rootHex = building.ValueRO.RootHex;
                int dir = (int)((uint)(entity.Index + (int)turn) % 6u);
                int2 spawnHex = rootHex + HexMeshUtil.HexNeighbor(dir);

                uint rng = (uint)entity.Index * 0x9E3779B1u ^ turn * 0x85EBCA77u;
                rng |= 1u;

                pending.Add(new SpawnFishingBoatRequest
                {
                    Hex     = spawnHex,
                    Seed    = rng,
                    Faction = FactionType.Player,
                });

                prod.LastProducedTurn = turn;
                prodRef.ValueRW = prod;
            }

            for (int i = 0; i < pending.Length; i++)
            {
                var req = em.CreateEntity();
                em.AddComponentData(req, pending[i]);
            }
            pending.Dispose();
        }
    }

    /// <summary>Main-thread drain for <see cref="SpawnFishingBoatRequest"/> — UnitSpawnSystem needs managed asset access so the spawn fanout lives on the main thread.</summary>
    [UpdateInGroup(typeof(EconomySystemGroup))]
    [UpdateAfter(typeof(DockProductionSystem))]
    public partial class FishingBoatSpawnApplierSystem : SystemBase
    {
        protected override void OnUpdate()
        {
            var em = EntityManager;
            var reqEntities = new NativeList<Entity>(4, Allocator.Temp);
            foreach (var (_, reqEntity) in
                     SystemAPI.Query<RefRO<SpawnFishingBoatRequest>>().WithEntityAccess())
            {
                reqEntities.Add(reqEntity);
            }

            for (int i = 0; i < reqEntities.Length; i++)
            {
                var reqEntity = reqEntities[i];
                var data = em.GetComponentData<SpawnFishingBoatRequest>(reqEntity);
                UnitSpawnSystem.SpawnFishingBoatAt(em, data.Hex, data.Seed, data.Faction);
                em.DestroyEntity(reqEntity);
            }

            reqEntities.Dispose();
        }
    }
}
