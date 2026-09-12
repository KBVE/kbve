using Unity.Collections;
using Unity.Entities;
using Unity.Mathematics;

namespace RareIcon
{
    /// <summary>Turn-cadence Galley crafting at every Shipyard (Dock T1+). Once per <see cref="ShipyardGalleyProduction.CadenceTurns"/>, drains <see cref="ShipyardGalleyProduction.TimberCost"/> Timber + <see cref="ShipyardGalleyProduction.StoneCost"/> StoneBlock from the Capital ledger and emits a <see cref="SpawnGalleyRequest"/> on a hex adjacent to the dock. Mirrors <c>DockProductionSystem</c> for FishingBoats; runs in parallel so Shipyards keep producing fishing fleet AND combat boats once they upgrade.</summary>
    [UpdateInGroup(typeof(EconomySystemGroup))]
    public partial class ShipyardGalleyProductionSystem : SystemBase
    {
        protected override void OnCreate()
        {
            RequireForUpdate<ShipyardGalleyProduction>();
            RequireForUpdate<WorldClock>();
            RequireForUpdate<CapitalTag>();
        }

        protected override void OnUpdate()
        {
            uint turn = SystemAPI.GetSingleton<WorldClock>().TurnIndex;

            var capital = SystemAPI.GetSingletonEntity<CapitalTag>();
            if (!EntityManager.HasBuffer<CapitalLedger>(capital)) return;

            var em = EntityManager;
            var capitalBuf = em.GetBuffer<CapitalLedger>(capital).Reinterpret<BankLedgerBase>();

            var pending = new NativeList<SpawnGalleyRequest>(4, Allocator.Temp);

            foreach (var (prodRef, building, entity) in
                     SystemAPI.Query<RefRW<ShipyardGalleyProduction>, RefRO<Building>>()
                         .WithAll<DockTag>().WithEntityAccess())
            {
                var prod = prodRef.ValueRO;
                if (turn < prod.LastProducedTurn + prod.CadenceTurns) continue;

                if (BankLedgerOps.CountOf(capitalBuf, (ushort)ItemId.Timber) < prod.TimberCost) continue;
                if (BankLedgerOps.CountOf(capitalBuf, (ushort)ItemId.StoneBlock) < prod.StoneCost) continue;

                BankLedgerOps.RemoveItem(ref capitalBuf, (ushort)ItemId.Timber, prod.TimberCost);
                BankLedgerOps.RemoveItem(ref capitalBuf, (ushort)ItemId.StoneBlock, prod.StoneCost);

                int2 rootHex = building.ValueRO.RootHex;
                int dir = (int)((uint)(entity.Index + (int)turn) % 6u);
                int2 spawnHex = rootHex + HexMeshUtil.HexNeighbor(dir);

                uint rng = (uint)entity.Index * 0x9E3779B1u ^ turn * 0x85EBCA77u;
                rng |= 1u;

                pending.Add(new SpawnGalleyRequest
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

    /// <summary>Main-thread drain for <see cref="SpawnGalleyRequest"/> — mirrors <c>FishingBoatSpawnApplierSystem</c>.</summary>
    [UpdateInGroup(typeof(EconomySystemGroup))]
    [UpdateAfter(typeof(ShipyardGalleyProductionSystem))]
    public partial class GalleySpawnApplierSystem : SystemBase
    {
        protected override void OnCreate()
        {
            RequireForUpdate<SpawnGalleyRequest>();
        }

        protected override void OnUpdate()
        {
            var em = EntityManager;
            var reqEntities = new NativeList<Entity>(4, Allocator.Temp);
            foreach (var (_, reqEntity) in
                     SystemAPI.Query<RefRO<SpawnGalleyRequest>>().WithEntityAccess())
            {
                reqEntities.Add(reqEntity);
            }

            for (int i = 0; i < reqEntities.Length; i++)
            {
                var reqEntity = reqEntities[i];
                var data = em.GetComponentData<SpawnGalleyRequest>(reqEntity);
                UnitSpawnSystem.SpawnGalleyAt(em, data.Hex, data.Seed, data.Faction);
                em.DestroyEntity(reqEntity);
            }
            reqEntities.Dispose();
        }
    }
}
