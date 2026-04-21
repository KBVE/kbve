using System;
using Unity.Burst;
using Unity.Collections;
using Unity.Entities;
using Unity.Jobs;
using Unity.Mathematics;

namespace RareIcon
{
    /// <summary>100:1 raw→bulk rollup per-bank. Reads each per-bank ledger RO; enqueues negative-delta BankTransfers for the raws being consumed and positive-delta BankTransfers for the bulk created. Runs five parallel jobs, one per ledger type, all RO on their source so the applier stays the only writer.</summary>
    [UpdateInGroup(typeof(EconomySystemGroup), OrderLast = true)]
    [UpdateBefore(typeof(InventoryTransferApplierSystem))]
    public partial struct StorageConsolidatorSystem : ISystem
    {
        NativeQueue<BankTransfer> _queue;

        public void OnCreate(ref SystemState state)
        {
            state.RequireForUpdate<ItemDBSingleton>();
            var bus = state.World.GetExistingSystemManaged<BankTransferQueueSystem>()
                      ?? state.World.CreateSystemManaged<BankTransferQueueSystem>();
            _queue = bus.AllocateProducerQueue();
        }

        public void OnDestroy(ref SystemState state) { }

        public void OnUpdate(ref SystemState state)
        {
            var db    = SystemAPI.GetSingleton<ItemDBSingleton>();
            var queue = _queue.AsParallelWriter();
            long nowMs = (long)(SystemAPI.Time.ElapsedTime * 1000.0);
            uint  seed = (uint)math.max(1, nowMs & 0xFFFFFFFF);

            var dep = state.Dependency;
            dep = new ConsolidateCapitalJob    { Db = db, NowMs = nowMs, Seed = seed, Queue = queue }.ScheduleParallel(dep);
            dep = new ConsolidateFurnaceJob    { Db = db, NowMs = nowMs, Seed = seed, Queue = queue }.ScheduleParallel(dep);
            dep = new ConsolidateFarmJob       { Db = db, NowMs = nowMs, Seed = seed, Queue = queue }.ScheduleParallel(dep);
            dep = new ConsolidateBarracksJob   { Db = db, NowMs = nowMs, Seed = seed, Queue = queue }.ScheduleParallel(dep);
            dep = new ConsolidateGoblinCaveJob { Db = db, NowMs = nowMs, Seed = seed, Queue = queue }.ScheduleParallel(dep);

            state.World.GetExistingSystemManaged<BankTransferQueueSystem>().AddJobHandleForProducer(dep);
            state.Dependency = dep;
        }
    }

    [BurstCompile]
    public partial struct ConsolidateCapitalJob : IJobEntity
    {
        [ReadOnly] public ItemDBSingleton Db;
        public long NowMs; public uint Seed;
        public NativeQueue<BankTransfer>.ParallelWriter Queue;
        void Execute([EntityIndexInQuery] int eiq, Entity entity, in DynamicBuffer<CapitalLedger> typedBuf)
            => ConsolidatorCore.Run(typedBuf.Reinterpret<BankLedgerBase>(), entity, eiq, Seed, NowMs, in Db, ref Queue);
    }

    [BurstCompile]
    public partial struct ConsolidateFurnaceJob : IJobEntity
    {
        [ReadOnly] public ItemDBSingleton Db;
        public long NowMs; public uint Seed;
        public NativeQueue<BankTransfer>.ParallelWriter Queue;
        void Execute([EntityIndexInQuery] int eiq, Entity entity, in DynamicBuffer<FurnaceLedger> typedBuf)
            => ConsolidatorCore.Run(typedBuf.Reinterpret<BankLedgerBase>(), entity, eiq, Seed, NowMs, in Db, ref Queue);
    }

    [BurstCompile]
    public partial struct ConsolidateFarmJob : IJobEntity
    {
        [ReadOnly] public ItemDBSingleton Db;
        public long NowMs; public uint Seed;
        public NativeQueue<BankTransfer>.ParallelWriter Queue;
        void Execute([EntityIndexInQuery] int eiq, Entity entity, in DynamicBuffer<FarmLedger> typedBuf)
            => ConsolidatorCore.Run(typedBuf.Reinterpret<BankLedgerBase>(), entity, eiq, Seed, NowMs, in Db, ref Queue);
    }

    [BurstCompile]
    public partial struct ConsolidateBarracksJob : IJobEntity
    {
        [ReadOnly] public ItemDBSingleton Db;
        public long NowMs; public uint Seed;
        public NativeQueue<BankTransfer>.ParallelWriter Queue;
        void Execute([EntityIndexInQuery] int eiq, Entity entity, in DynamicBuffer<BarracksLedger> typedBuf)
            => ConsolidatorCore.Run(typedBuf.Reinterpret<BankLedgerBase>(), entity, eiq, Seed, NowMs, in Db, ref Queue);
    }

    [BurstCompile]
    public partial struct ConsolidateGoblinCaveJob : IJobEntity
    {
        [ReadOnly] public ItemDBSingleton Db;
        public long NowMs; public uint Seed;
        public NativeQueue<BankTransfer>.ParallelWriter Queue;
        void Execute([EntityIndexInQuery] int eiq, Entity entity, in DynamicBuffer<GoblinCaveLedger> typedBuf)
            => ConsolidatorCore.Run(typedBuf.Reinterpret<BankLedgerBase>(), entity, eiq, Seed, NowMs, in Db, ref Queue);
    }

    internal static class ConsolidatorCore
    {
        public static void Run(in DynamicBuffer<BankLedgerBase> inv, Entity target, int eiq, uint seed, long nowMs, in ItemDBSingleton db, ref NativeQueue<BankTransfer>.ParallelWriter queue)
        {
            // Pass 1 — single-source rollup. For each raw slot that holds
            // >= CompressRatio, enqueue -drain on the raw + +batches on
            // the bulk item (target same entity).
            for (int i = 0; i < inv.Length; i++)
            {
                var slot = inv[i];
                if (slot.Count == 0) continue;
                if (!db.TryGet(slot.ItemId, out var def)) continue;
                if (def.CompressesTo == 0 || def.CompressRatio == 0) continue;
                if (def.PoolGroup != PoolGroup.None) continue;
                if (slot.Count < def.CompressRatio) continue;

                int batches = slot.Count / def.CompressRatio;
                int drain   = batches * def.CompressRatio;
                queue.Enqueue(new BankTransfer { Target = target, ItemId = slot.ItemId,       Delta = -drain });
                queue.Enqueue(new BankTransfer { Target = target, ItemId = def.CompressesTo,  Delta =  batches });
            }

            // Pass 2 — food pool. Sum every PoolGroup.Food slot, convert
            // floor(total / ratio) into Meal, emit negative deltas across
            // the pool members proportionally.
            int foodTotal = 0; ushort foodTarget = 0; ushort foodRatio = 100;
            for (int i = 0; i < inv.Length; i++)
            {
                if (inv[i].Count == 0) continue;
                if (!db.TryGet(inv[i].ItemId, out var def)) continue;
                if (def.PoolGroup != PoolGroup.Food) continue;
                foodTotal += inv[i].Count;
                if (foodTarget == 0)
                {
                    foodTarget = def.CompressesTo;
                    if (def.CompressRatio > 0) foodRatio = def.CompressRatio;
                }
            }

            if (foodTarget != 0 && foodTotal >= foodRatio)
            {
                int meals = foodTotal / foodRatio;
                int drain = meals * foodRatio;
                int remaining = drain;
                for (int i = 0; i < inv.Length && remaining > 0; i++)
                {
                    if (inv[i].Count == 0) continue;
                    if (!db.TryGet(inv[i].ItemId, out var d)) continue;
                    if (d.PoolGroup != PoolGroup.Food) continue;
                    int take = inv[i].Count < remaining ? inv[i].Count : remaining;
                    queue.Enqueue(new BankTransfer { Target = target, ItemId = inv[i].ItemId, Delta = -take });
                    remaining -= take;
                }
                queue.Enqueue(new BankTransfer { Target = target, ItemId = foodTarget, Delta = meals });
            }
        }
    }
}
