using Unity.Burst;
using Unity.Collections;
using Unity.Entities;
using Unity.Jobs;
using Unity.Mathematics;

namespace RareIcon
{
    /// <summary>Drains each source building's above-floor SurplusExport items into Capital via Surplus reservations keyed on the source bank. Five serialized jobs (Farm/Furnace/Barracks/Lumbercamp/MiningPit) sharing the same Reservations writer.</summary>
    [UpdateInGroup(typeof(EconomySystemGroup))]
    public partial struct BuildingSurplusTransferSystem : ISystem
    {
        public void OnCreate(ref SystemState state)
        {
            state.RequireForUpdate<LogisticsDBSingleton>();
        }

        public void OnDestroy(ref SystemState state) { }

        public void OnUpdate(ref SystemState state)
        {
            if (!SystemAPI.TryGetSingletonEntity<CapitalTag>(out var capital)) return;

            uint tick = (uint)(SystemAPI.Time.ElapsedTime * 1000d);

            ref var db = ref SystemAPI.GetSingletonRW<LogisticsDBSingleton>().ValueRW;
            var reservations = db.Reservations.AsParallelWriter();

            var dep = JobHandle.CombineDependencies(state.Dependency, db.PipelineHandle);
            dep = new FarmSurplusJob       { Capital = capital, Tick = tick, Reservations = reservations }.ScheduleParallel(dep);
            dep = new FurnaceSurplusJob    { Capital = capital, Tick = tick, Reservations = reservations }.ScheduleParallel(dep);
            dep = new BarracksSurplusJob   { Capital = capital, Tick = tick, Reservations = reservations }.ScheduleParallel(dep);
            dep = new LumbercampSurplusJob { Capital = capital, Tick = tick, Reservations = reservations }.ScheduleParallel(dep);
            dep = new MiningPitSurplusJob  { Capital = capital, Tick = tick, Reservations = reservations }.ScheduleParallel(dep);

            db.PipelineHandle = dep;
            state.Dependency  = dep;
        }
    }

    [BurstCompile]
    [WithAll(typeof(FarmTag))]
    public partial struct FarmSurplusJob : IJobEntity
    {
        public Entity Capital;
        public uint   Tick;
        public NativeParallelMultiHashMap<LedgerKey, ReservationRecord>.ParallelWriter Reservations;

        void Execute(Entity entity, in DynamicBuffer<FarmLedger> typedStorage, in DynamicBuffer<SurplusExport> exports)
        {
            if (entity == Capital) return;
            SurplusTransferShared.Run(typedStorage.Reinterpret<BankLedgerBase>(), exports, Capital, entity, Tick, ref Reservations);
        }
    }

    [BurstCompile]
    [WithAll(typeof(FurnaceTag))]
    public partial struct FurnaceSurplusJob : IJobEntity
    {
        public Entity Capital;
        public uint   Tick;
        public NativeParallelMultiHashMap<LedgerKey, ReservationRecord>.ParallelWriter Reservations;

        void Execute(Entity entity, in DynamicBuffer<FurnaceLedger> typedStorage, in DynamicBuffer<SurplusExport> exports)
        {
            if (entity == Capital) return;
            SurplusTransferShared.Run(typedStorage.Reinterpret<BankLedgerBase>(), exports, Capital, entity, Tick, ref Reservations);
        }
    }

    [BurstCompile]
    [WithAll(typeof(BarracksTag))]
    public partial struct BarracksSurplusJob : IJobEntity
    {
        public Entity Capital;
        public uint   Tick;
        public NativeParallelMultiHashMap<LedgerKey, ReservationRecord>.ParallelWriter Reservations;

        void Execute(Entity entity, in DynamicBuffer<BarracksLedger> typedStorage, in DynamicBuffer<SurplusExport> exports)
        {
            if (entity == Capital) return;
            SurplusTransferShared.Run(typedStorage.Reinterpret<BankLedgerBase>(), exports, Capital, entity, Tick, ref Reservations);
        }
    }

    [BurstCompile]
    [WithAll(typeof(LumbercampTag))]
    public partial struct LumbercampSurplusJob : IJobEntity
    {
        public Entity Capital;
        public uint   Tick;
        public NativeParallelMultiHashMap<LedgerKey, ReservationRecord>.ParallelWriter Reservations;

        void Execute(Entity entity, in DynamicBuffer<LumbercampLedger> typedStorage, in DynamicBuffer<SurplusExport> exports)
        {
            if (entity == Capital) return;
            SurplusTransferShared.Run(typedStorage.Reinterpret<BankLedgerBase>(), exports, Capital, entity, Tick, ref Reservations);
        }
    }

    [BurstCompile]
    [WithAll(typeof(MiningPitTag))]
    public partial struct MiningPitSurplusJob : IJobEntity
    {
        public Entity Capital;
        public uint   Tick;
        public NativeParallelMultiHashMap<LedgerKey, ReservationRecord>.ParallelWriter Reservations;

        void Execute(Entity entity, in DynamicBuffer<MiningPitLedger> typedStorage, in DynamicBuffer<SurplusExport> exports)
        {
            if (entity == Capital) return;
            SurplusTransferShared.Run(typedStorage.Reinterpret<BankLedgerBase>(), exports, Capital, entity, Tick, ref Reservations);
        }
    }

    internal static class SurplusTransferShared
    {
        public static void Run(in DynamicBuffer<BankLedgerBase> storage,
                               in DynamicBuffer<SurplusExport> exports,
                               Entity capital,
                               Entity source,
                               uint tick,
                               ref NativeParallelMultiHashMap<LedgerKey, ReservationRecord>.ParallelWriter reservations)
        {
            for (int e = 0; e < exports.Length; e++)
            {
                ushort itemId = exports[e].ItemId;
                ushort floor  = exports[e].Floor;

                int have = BankLedgerOps.CountOf(storage, itemId);
                if (have <= floor) continue;

                int move = have - floor;
                reservations.Add(ReservationOps.Key(source, itemId), ReservationOps.Surplus(source, capital, move, tick));
            }
        }
    }
}
