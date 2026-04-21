using Unity.Burst;
using Unity.Collections;
using Unity.Entities;
using Unity.Jobs;
using Unity.Mathematics;

namespace RareIcon
{
    /// <summary>Drains each source building's above-floor SurplusExport items into Capital. Reads source bank ledger RO; enqueues -source and +Capital BankTransfers per above-floor item. Three parallel jobs (Farm/Furnace/Barracks) — distinct ledger types so Unity parallelizes them freely.</summary>
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
            if (!SystemAPI.TryGetSingleton<BankTransferQueue>(out var qSingleton)) return;
            var queue = qSingleton.Queue.AsParallelWriter();

            var farmH = new FarmSurplusJob     { Capital = capital, Queue = queue }.ScheduleParallel(state.Dependency);
            var furnH = new FurnaceSurplusJob  { Capital = capital, Queue = queue }.ScheduleParallel(state.Dependency);
            var barrH = new BarracksSurplusJob { Capital = capital, Queue = queue }.ScheduleParallel(state.Dependency);

            state.Dependency = JobHandle.CombineDependencies(
                JobHandle.CombineDependencies(farmH, furnH), barrH);
        }
    }

    [BurstCompile]
    [WithAll(typeof(FarmTag))]
    public partial struct FarmSurplusJob : IJobEntity
    {
        public Entity Capital;
        public NativeQueue<BankTransfer>.ParallelWriter Queue;

        void Execute(Entity entity, in DynamicBuffer<FarmLedger> typedStorage, in DynamicBuffer<SurplusExport> exports)
        {
            if (entity == Capital) return;
            var storage = typedStorage.Reinterpret<BankLedgerBase>();
            SurplusTransferShared.Run(storage, exports, Capital, entity, ref Queue);
        }
    }

    [BurstCompile]
    [WithAll(typeof(FurnaceTag))]
    public partial struct FurnaceSurplusJob : IJobEntity
    {
        public Entity Capital;
        public NativeQueue<BankTransfer>.ParallelWriter Queue;

        void Execute(Entity entity, in DynamicBuffer<FurnaceLedger> typedStorage, in DynamicBuffer<SurplusExport> exports)
        {
            if (entity == Capital) return;
            var storage = typedStorage.Reinterpret<BankLedgerBase>();
            SurplusTransferShared.Run(storage, exports, Capital, entity, ref Queue);
        }
    }

    [BurstCompile]
    [WithAll(typeof(BarracksTag))]
    public partial struct BarracksSurplusJob : IJobEntity
    {
        public Entity Capital;
        public NativeQueue<BankTransfer>.ParallelWriter Queue;

        void Execute(Entity entity, in DynamicBuffer<BarracksLedger> typedStorage, in DynamicBuffer<SurplusExport> exports)
        {
            if (entity == Capital) return;
            var storage = typedStorage.Reinterpret<BankLedgerBase>();
            SurplusTransferShared.Run(storage, exports, Capital, entity, ref Queue);
        }
    }

    internal static class SurplusTransferShared
    {
        public static void Run(in DynamicBuffer<BankLedgerBase> storage,
                               in DynamicBuffer<SurplusExport> exports,
                               Entity capital,
                               Entity source,
                               ref NativeQueue<BankTransfer>.ParallelWriter queue)
        {
            for (int e = 0; e < exports.Length; e++)
            {
                ushort itemId = exports[e].ItemId;
                ushort floor  = exports[e].Floor;

                int have = BankLedgerOps.CountOf(storage, itemId);
                if (have <= floor) continue;

                int move = have - floor;
                queue.Enqueue(new BankTransfer { Target = source,  ItemId = itemId, Delta = -move });
                queue.Enqueue(new BankTransfer { Target = capital, ItemId = itemId, Delta =  move });
            }
        }
    }
}
