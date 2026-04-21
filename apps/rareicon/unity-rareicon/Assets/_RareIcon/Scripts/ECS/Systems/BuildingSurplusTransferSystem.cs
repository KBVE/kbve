using Unity.Burst;
using Unity.Collections;
using Unity.Entities;
using Unity.Jobs;
using Unity.Mathematics;

namespace RareIcon
{
    /// <summary>Drains each building's above-floor SurplusExport items into the Capital treasury per tick. Post-per-bank-split, each source bank type (Farm/Furnace/Barracks) runs its own ScheduleParallel job — since their ledger types are distinct, Unity schedules all three in parallel on worker threads. Source buffers are written directly (per-entity, exclusive); the Capital add queues through PendingItemTransfer for InventoryTransferApplierSystem.</summary>
    [BurstCompile]
    [UpdateInGroup(typeof(EconomySystemGroup))]
    public partial struct BuildingSurplusTransferSystem : ISystem
    {
        [BurstCompile] public void OnCreate(ref SystemState state) { }
        [BurstCompile] public void OnDestroy(ref SystemState state) { }

        [BurstCompile]
        public void OnUpdate(ref SystemState state)
        {
            if (!SystemAPI.TryGetSingletonEntity<CapitalTag>(out var capital)) return;

            var ecb = SystemAPI.GetSingleton<EndSimulationEntityCommandBufferSystem.Singleton>()
                               .CreateCommandBuffer(state.WorldUnmanaged).AsParallelWriter();

            var farmH = new FarmSurplusJob        { Capital = capital, Ecb = ecb }.ScheduleParallel(state.Dependency);
            var furnH = new FurnaceSurplusJob     { Capital = capital, Ecb = ecb }.ScheduleParallel(state.Dependency);
            var barrH = new BarracksSurplusJob    { Capital = capital, Ecb = ecb }.ScheduleParallel(state.Dependency);

            state.Dependency = JobHandle.CombineDependencies(
                JobHandle.CombineDependencies(farmH, furnH), barrH);
        }
    }

    [BurstCompile]
    [WithAll(typeof(FarmTag))]
    public partial struct FarmSurplusJob : IJobEntity
    {
        public Entity Capital;
        public EntityCommandBuffer.ParallelWriter Ecb;

        void Execute(Entity entity,
                     [ChunkIndexInQuery] int chunkIdx,
                     ref DynamicBuffer<FarmLedger> typedStorage,
                     in DynamicBuffer<SurplusExport> exports)
        {
            if (entity == Capital) return;
            var storage = typedStorage.Reinterpret<BankLedgerBase>();
            SurplusTransferShared.Run(ref storage, exports, Capital, chunkIdx, Ecb);
        }
    }

    [BurstCompile]
    [WithAll(typeof(FurnaceTag))]
    public partial struct FurnaceSurplusJob : IJobEntity
    {
        public Entity Capital;
        public EntityCommandBuffer.ParallelWriter Ecb;

        void Execute(Entity entity,
                     [ChunkIndexInQuery] int chunkIdx,
                     ref DynamicBuffer<FurnaceLedger> typedStorage,
                     in DynamicBuffer<SurplusExport> exports)
        {
            if (entity == Capital) return;
            var storage = typedStorage.Reinterpret<BankLedgerBase>();
            SurplusTransferShared.Run(ref storage, exports, Capital, chunkIdx, Ecb);
        }
    }

    [BurstCompile]
    [WithAll(typeof(BarracksTag))]
    public partial struct BarracksSurplusJob : IJobEntity
    {
        public Entity Capital;
        public EntityCommandBuffer.ParallelWriter Ecb;

        void Execute(Entity entity,
                     [ChunkIndexInQuery] int chunkIdx,
                     ref DynamicBuffer<BarracksLedger> typedStorage,
                     in DynamicBuffer<SurplusExport> exports)
        {
            if (entity == Capital) return;
            var storage = typedStorage.Reinterpret<BankLedgerBase>();
            SurplusTransferShared.Run(ref storage, exports, Capital, chunkIdx, Ecb);
        }
    }

    internal static class SurplusTransferShared
    {
        public static void Run(ref DynamicBuffer<BankLedgerBase> storage,
                               in DynamicBuffer<SurplusExport> exports,
                               Entity capital,
                               int chunkIdx,
                               EntityCommandBuffer.ParallelWriter ecb)
        {
            for (int e = 0; e < exports.Length; e++)
            {
                ushort itemId = exports[e].ItemId;
                ushort floor  = exports[e].Floor;

                int have = BankLedgerOps.CountOf(storage, itemId);
                if (have <= floor) continue;

                int move = have - floor;
                int remaining = move;
                for (int i = 0; i < storage.Length && remaining > 0; i++)
                {
                    if (storage[i].ItemId != itemId) continue;
                    var slot = storage[i];
                    int take = math.min(slot.Count, remaining);
                    slot.Count = (ushort)(slot.Count - take);
                    storage[i] = slot;
                    remaining -= take;
                }

                var req = ecb.CreateEntity(chunkIdx);
                ecb.AddComponent(chunkIdx, req, new PendingItemTransfer
                {
                    Target = capital,
                    ItemId = itemId,
                    Delta  = move,
                });
            }
        }
    }
}
