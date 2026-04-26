using Unity.Burst;
using Unity.Collections;
using Unity.Entities;
using Unity.Jobs;

namespace RareIcon
{
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
            uint tick  = (uint)(SystemAPI.Time.ElapsedTime * 1000.0);

            ref var db   = ref SystemAPI.GetSingletonRW<LogisticsDBSingleton>().ValueRW;
            var reservations = db.Reservations.AsParallelWriter();

            var dep = JobHandle.CombineDependencies(state.Dependency, db.PipelineHandle);
            dep = new ConsolidateCapitalJob    { Db = itemDb, Tick = tick, Reservations = reservations }.ScheduleParallel(dep);
            dep = new ConsolidateFurnaceJob    { Db = itemDb, Tick = tick, Reservations = reservations }.ScheduleParallel(dep);
            dep = new ConsolidateFarmJob       { Db = itemDb, Tick = tick, Reservations = reservations }.ScheduleParallel(dep);
            dep = new ConsolidateBarracksJob   { Db = itemDb, Tick = tick, Reservations = reservations }.ScheduleParallel(dep);
            dep = new ConsolidateGoblinCaveJob { Db = itemDb, Tick = tick, Reservations = reservations }.ScheduleParallel(dep);

            db.PipelineHandle = dep;
            state.Dependency  = dep;
        }
    }

    [BurstCompile]
    public partial struct ConsolidateCapitalJob : IJobEntity
    {
        [ReadOnly] public ItemDBSingleton Db;
        public uint Tick;
        public NativeParallelMultiHashMap<LedgerKey, ReservationRecord>.ParallelWriter Reservations;
        void Execute(Entity entity, in DynamicBuffer<CapitalLedger> typedBuf)
            => ConsolidatorCore.Run(typedBuf.Reinterpret<BankLedgerBase>(), entity, Tick, in Db, ref Reservations);
    }

    [BurstCompile]
    public partial struct ConsolidateFurnaceJob : IJobEntity
    {
        [ReadOnly] public ItemDBSingleton Db;
        public uint Tick;
        public NativeParallelMultiHashMap<LedgerKey, ReservationRecord>.ParallelWriter Reservations;
        void Execute(Entity entity, in DynamicBuffer<FurnaceLedger> typedBuf)
            => ConsolidatorCore.Run(typedBuf.Reinterpret<BankLedgerBase>(), entity, Tick, in Db, ref Reservations);
    }

    [BurstCompile]
    public partial struct ConsolidateFarmJob : IJobEntity
    {
        [ReadOnly] public ItemDBSingleton Db;
        public uint Tick;
        public NativeParallelMultiHashMap<LedgerKey, ReservationRecord>.ParallelWriter Reservations;
        void Execute(Entity entity, in DynamicBuffer<FarmLedger> typedBuf)
            => ConsolidatorCore.Run(typedBuf.Reinterpret<BankLedgerBase>(), entity, Tick, in Db, ref Reservations);
    }

    [BurstCompile]
    public partial struct ConsolidateBarracksJob : IJobEntity
    {
        [ReadOnly] public ItemDBSingleton Db;
        public uint Tick;
        public NativeParallelMultiHashMap<LedgerKey, ReservationRecord>.ParallelWriter Reservations;
        void Execute(Entity entity, in DynamicBuffer<BarracksLedger> typedBuf)
            => ConsolidatorCore.Run(typedBuf.Reinterpret<BankLedgerBase>(), entity, Tick, in Db, ref Reservations);
    }

    [BurstCompile]
    public partial struct ConsolidateGoblinCaveJob : IJobEntity
    {
        [ReadOnly] public ItemDBSingleton Db;
        public uint Tick;
        public NativeParallelMultiHashMap<LedgerKey, ReservationRecord>.ParallelWriter Reservations;
        void Execute(Entity entity, in DynamicBuffer<GoblinCaveLedger> typedBuf)
            => ConsolidatorCore.Run(typedBuf.Reinterpret<BankLedgerBase>(), entity, Tick, in Db, ref Reservations);
    }

    internal static class ConsolidatorCore
    {
        public static void Run(in DynamicBuffer<BankLedgerBase> inv,
                               Entity target,
                               uint tick,
                               in ItemDBSingleton db,
                               ref NativeParallelMultiHashMap<LedgerKey, ReservationRecord>.ParallelWriter res)
        {
            FixedList128Bytes<byte> foodIdx = default;
            int    foodTotal  = 0;
            ushort foodTarget = 0;
            ushort foodRatio  = 100;

            int n = inv.Length;
            for (int i = 0; i < n; i++)
            {
                var slot = inv[i];
                if (slot.Count == 0) continue;
                if (!db.TryGet(slot.ItemId, out var def)) continue;

                if (def.PoolGroup == PoolGroup.Food)
                {
                    if (foodTarget == 0)
                    {
                        foodTarget = def.CompressesTo;
                        if (def.CompressRatio > 0) foodRatio = def.CompressRatio;
                    }
                    foodTotal += slot.Count;
                    if (foodIdx.Length < foodIdx.Capacity) foodIdx.Add((byte)i);
                    continue;
                }

                if (def.CompressesTo == 0 || def.CompressRatio == 0) continue;
                if (slot.Count < def.CompressRatio) continue;

                int batches = slot.Count / def.CompressRatio;
                int drain   = batches * def.CompressRatio;
                res.Add(ReservationOps.Key(target, slot.ItemId),      ReservationOps.Consume(target, drain,   tick));
                res.Add(ReservationOps.Key(target, def.CompressesTo), ReservationOps.Produce(target, batches, tick));
            }

            if (foodTarget == 0 || foodTotal < foodRatio) return;

            int meals     = foodTotal / foodRatio;
            int remaining = meals * foodRatio;
            int fn        = foodIdx.Length;
            for (int j = 0; j < fn && remaining > 0; j++)
            {
                var slot = inv[foodIdx[j]];
                int take = slot.Count < remaining ? slot.Count : remaining;
                res.Add(ReservationOps.Key(target, slot.ItemId), ReservationOps.Consume(target, take, tick));
                remaining -= take;
            }
            res.Add(ReservationOps.Key(target, foodTarget), ReservationOps.Produce(target, meals, tick));
        }
    }
}
