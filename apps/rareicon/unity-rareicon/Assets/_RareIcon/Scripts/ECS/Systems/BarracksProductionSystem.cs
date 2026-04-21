using Unity.Burst;
using Unity.Collections;
using Unity.Entities;
using Unity.Mathematics;

namespace RareIcon
{
    /// <summary>Turn-cadence recruitment: once per BarracksProduction.CadenceTurns, consume CoinCost BanditCoin + FoodCost food (any FoodItems.IsFood item) from the building's InventorySlot storage and emit a SpawnSoldierRequest. Burst ISystem + ScheduleParallel over barracks entities — each barracks only touches its own inventory buffer, so the per-entity DynamicBuffer writes are race-free. Spawn fanout stays on the main thread in SoldierSpawnApplierSystem since UnitSpawnSystem.SpawnGoblinAt still needs managed prefab access.</summary>
    [BurstCompile]
    [UpdateInGroup(typeof(EconomySystemGroup))]
    public partial struct BarracksProductionSystem : ISystem
    {
        [BurstCompile] public void OnCreate(ref SystemState state) { }
        [BurstCompile] public void OnDestroy(ref SystemState state) { }

        [BurstCompile]
        public void OnUpdate(ref SystemState state)
        {
            if (!SystemAPI.HasSingleton<WorldClock>()) return;
            uint currentTurn = SystemAPI.GetSingleton<WorldClock>().TurnIndex;

            var ecb = SystemAPI.GetSingleton<EndSimulationEntityCommandBufferSystem.Singleton>()
                               .CreateCommandBuffer(state.WorldUnmanaged);

            state.Dependency = new BarracksProductionJob
            {
                CurrentTurn = currentTurn,
                Ecb         = ecb.AsParallelWriter(),
            }.ScheduleParallel(state.Dependency);
        }
    }

    [BurstCompile]
    [WithAll(typeof(BarracksTag))]
    public partial struct BarracksProductionJob : IJobEntity
    {
        public uint CurrentTurn;
        public EntityCommandBuffer.ParallelWriter Ecb;

        void Execute(Entity entity,
                     [ChunkIndexInQuery] int chunkIdx,
                     ref BarracksProduction prod,
                     in Building building,
                     ref DynamicBuffer<BarracksLedger> typedStorage)
        {
            if (CurrentTurn < prod.LastProducedTurn + prod.CadenceTurns) return;
            var storage = typedStorage.Reinterpret<BankLedgerBase>();
            if (BankLedgerOps.CountOf(storage, (ushort)ItemId.BanditCoin) < prod.CoinCost) return;
            if (FoodItems.Count(storage) < prod.FoodCost) return;

            BankLedgerOps.RemoveItem(ref storage, (ushort)ItemId.BanditCoin, (ushort)math.min(prod.CoinCost, ushort.MaxValue));
            ConsumeFood(ref storage, prod.FoodCost);

            int2 rootHex = building.RootHex;
            int dir = (int)((uint)(entity.Index + (int)CurrentTurn) % 6u);
            int2 spawnHex = rootHex + HexMeshUtil.HexNeighbor(dir);

            uint rng = (uint)entity.Index * 0x9E3779B1u ^ CurrentTurn * 0x85EBCA77u;
            rng |= 1u;

            var request = Ecb.CreateEntity(chunkIdx);
            Ecb.AddComponent(chunkIdx, request, new SpawnSoldierRequest
            {
                Hex      = spawnHex,
                Seed     = rng,
                Faction  = FactionType.Player,
                UnitType = UnitType.Soldier,
            });

            prod.LastProducedTurn = CurrentTurn;
        }

        static void ConsumeFood(ref DynamicBuffer<BankLedgerBase> inv, int amount)
        {
            for (int i = 0; i < inv.Length && amount > 0; i++)
            {
                if (!FoodItems.IsFood(inv[i].ItemId)) continue;
                var slot = inv[i];
                int take = math.min(slot.Count, amount);
                slot.Count = (ushort)(slot.Count - take);
                amount -= take;
                inv[i] = slot;
            }
        }
    }

    /// <summary>Main-thread drain for SpawnSoldierRequest intents emitted by BarracksProductionSystem. Kept on SystemBase because UnitSpawnSystem.SpawnGoblinAt reaches into managed prefab/mesh/material caches.</summary>
    [UpdateInGroup(typeof(EconomySystemGroup))]
    [UpdateAfter(typeof(BarracksProductionSystem))]
    public partial class SoldierSpawnApplierSystem : SystemBase
    {
        protected override void OnUpdate()
        {
            var em = EntityManager;

            var requestEntities = new NativeList<Entity>(8, Allocator.Temp);
            foreach (var (_, reqEntity) in
                     SystemAPI.Query<RefRO<SpawnSoldierRequest>>().WithEntityAccess())
            {
                requestEntities.Add(reqEntity);
            }

            for (int i = 0; i < requestEntities.Length; i++)
            {
                var reqEntity = requestEntities[i];
                var data = em.GetComponentData<SpawnSoldierRequest>(reqEntity);
                UnitSpawnSystem.SpawnGoblinAt(em, data.Hex, data.Seed,
                    default, data.Faction, data.UnitType);
                em.DestroyEntity(reqEntity);
            }

            requestEntities.Dispose();
        }
    }
}
