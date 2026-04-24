using System;
using Unity.Burst;
using Unity.Collections;
using Unity.Entities;
using Unity.Jobs;
using Unity.Mathematics;

namespace RareIcon
{
    /// <summary>100:1 raw→bulk rollup per-bank. Reads each per-bank ledger RO; submits Consume reservations for the raws being rolled up and Produce reservations for the bulk output, keyed on the same bank entity. Five jobs (one per ledger type) chained sequentially through the shared Reservations ParallelWriter.</summary>
    [UpdateInGroup(typeof(EconomySystemGroup), OrderLast = true)]
    public partial struct StorageConsolidatorSystem : ISystem
    {
        public void OnCreate(ref SystemState state)
        {
            state.RequireForUpdate<ItemDBSingleton>();
            state.RequireForUpdate<LogisticsDBSingleton>();
        }

        public void OnDestroy(ref SystemState state) { }

        public void OnUpdate(ref SystemState state)
        {
            var itemDb = SystemAPI.GetSingleton<ItemDBSingleton>();
            long nowMs = (long)(SystemAPI.Time.ElapsedTime * 1000.0);
            uint  seed = (uint)math.max(1, nowMs & 0xFFFFFFFF);
            uint  tick = (uint)nowMs;

            ref var db   = ref SystemAPI.GetSingletonRW<LogisticsDBSingleton>().ValueRW;
            var reservations = db.Reservations.AsParallelWriter();

            var dep = JobHandle.CombineDependencies(state.Dependency, db.PipelineHandle);
            dep = new ConsolidateCapitalJob    { Db = itemDb, NowMs = nowMs, Seed = seed, Tick = tick, Reservations = reservations }.ScheduleParallel(dep);
            dep = new ConsolidateFurnaceJob    { Db = itemDb, NowMs = nowMs, Seed = seed, Tick = tick, Reservations = reservations }.ScheduleParallel(dep);
            dep = new ConsolidateFarmJob       { Db = itemDb, NowMs = nowMs, Seed = seed, Tick = tick, Reservations = reservations }.ScheduleParallel(dep);
            dep = new ConsolidateBarracksJob   { Db = itemDb, NowMs = nowMs, Seed = seed, Tick = tick, Reservations = reservations }.ScheduleParallel(dep);
            dep = new ConsolidateGoblinCaveJob { Db = itemDb, NowMs = nowMs, Seed = seed, Tick = tick, Reservations = reservations }.ScheduleParallel(dep);

            db.PipelineHandle = dep;
            state.Dependency  = dep;
        }
    }

    [BurstCompile]
    public partial struct ConsolidateCapitalJob : IJobEntity
    {
        [ReadOnly] public ItemDBSingleton Db;
        public long NowMs; public uint Seed; public uint Tick;
        public NativeParallelMultiHashMap<LedgerKey, ReservationRecord>.ParallelWriter Reservations;
        void Execute([EntityIndexInQuery] int eiq, Entity entity, in DynamicBuffer<CapitalLedger> typedBuf)
            => ConsolidatorCore.Run(typedBuf.Reinterpret<BankLedgerBase>(), entity, eiq, Seed, NowMs, Tick, in Db, ref Reservations);
    }

    [BurstCompile]
    public partial struct ConsolidateFurnaceJob : IJobEntity
    {
        [ReadOnly] public ItemDBSingleton Db;
        public long NowMs; public uint Seed; public uint Tick;
        public NativeParallelMultiHashMap<LedgerKey, ReservationRecord>.ParallelWriter Reservations;
        void Execute([EntityIndexInQuery] int eiq, Entity entity, in DynamicBuffer<FurnaceLedger> typedBuf)
            => ConsolidatorCore.Run(typedBuf.Reinterpret<BankLedgerBase>(), entity, eiq, Seed, NowMs, Tick, in Db, ref Reservations);
    }

    [BurstCompile]
    public partial struct ConsolidateFarmJob : IJobEntity
    {
        [ReadOnly] public ItemDBSingleton Db;
        public long NowMs; public uint Seed; public uint Tick;
        public NativeParallelMultiHashMap<LedgerKey, ReservationRecord>.ParallelWriter Reservations;
        void Execute([EntityIndexInQuery] int eiq, Entity entity, in DynamicBuffer<FarmLedger> typedBuf)
            => ConsolidatorCore.Run(typedBuf.Reinterpret<BankLedgerBase>(), entity, eiq, Seed, NowMs, Tick, in Db, ref Reservations);
    }

    [BurstCompile]
    public partial struct ConsolidateBarracksJob : IJobEntity
    {
        [ReadOnly] public ItemDBSingleton Db;
        public long NowMs; public uint Seed; public uint Tick;
        public NativeParallelMultiHashMap<LedgerKey, ReservationRecord>.ParallelWriter Reservations;
        void Execute([EntityIndexInQuery] int eiq, Entity entity, in DynamicBuffer<BarracksLedger> typedBuf)
            => ConsolidatorCore.Run(typedBuf.Reinterpret<BankLedgerBase>(), entity, eiq, Seed, NowMs, Tick, in Db, ref Reservations);
    }

    [BurstCompile]
    public partial struct ConsolidateGoblinCaveJob : IJobEntity
    {
        [ReadOnly] public ItemDBSingleton Db;
        public long NowMs; public uint Seed; public uint Tick;
        public NativeParallelMultiHashMap<LedgerKey, ReservationRecord>.ParallelWriter Reservations;
        void Execute([EntityIndexInQuery] int eiq, Entity entity, in DynamicBuffer<GoblinCaveLedger> typedBuf)
            => ConsolidatorCore.Run(typedBuf.Reinterpret<BankLedgerBase>(), entity, eiq, Seed, NowMs, Tick, in Db, ref Reservations);
    }

    internal static class ConsolidatorCore
    {
        public static void Run(in DynamicBuffer<BankLedgerBase> inv,
                               Entity target,
                               int eiq,
                               uint seed,
                               long nowMs,
                               uint tick,
                               in ItemDBSingleton db,
                               ref NativeParallelMultiHashMap<LedgerKey, ReservationRecord>.ParallelWriter res)
        {
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
                res.Add(ReservationOps.Key(target, slot.ItemId),      ReservationOps.Consume(target, drain,   tick));
                res.Add(ReservationOps.Key(target, def.CompressesTo), ReservationOps.Produce(target, batches, tick));
            }

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
                    res.Add(ReservationOps.Key(target, inv[i].ItemId), ReservationOps.Consume(target, take, tick));
                    remaining -= take;
                }
                res.Add(ReservationOps.Key(target, foodTarget), ReservationOps.Produce(target, meals, tick));
            }
        }
    }
}
