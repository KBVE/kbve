using Unity.Burst;
using Unity.Collections;
using Unity.Entities;
using Unity.Jobs;

namespace RareIcon
{
    /// <summary>Per-furnace active cycle. Inputs consumed from Capital, outputs produced into Capital via Consume/Produce reservations on the same key.</summary>
    [UpdateInGroup(typeof(EconomySystemGroup))]
    public partial struct FurnaceProductionSystem : ISystem
    {
        public void OnCreate(ref SystemState state)
        {
            state.RequireForUpdate<LogisticsDBSingleton>();
        }

        public void OnDestroy(ref SystemState state) { }

        public void OnUpdate(ref SystemState state)
        {
            if (!SystemAPI.HasSingleton<WorldClock>()) return;
            if (!SystemAPI.TryGetSingletonEntity<CapitalTag>(out var capital)) return;
            if (!SystemAPI.HasBuffer<CapitalLedger>(capital)) return;

            float now  = SystemAPI.GetSingleton<WorldClock>().AbsSeconds;
            uint  tick = (uint)(SystemAPI.Time.ElapsedTime * 1000d);

            ref var db = ref SystemAPI.GetSingletonRW<LogisticsDBSingleton>().ValueRW;
            var dep    = JobHandle.CombineDependencies(state.Dependency, db.PipelineHandle);

            var handle = new FurnaceTickJob
            {
                Capital       = capital,
                CapitalLookup = SystemAPI.GetBufferLookup<CapitalLedger>(true),
                Reservations  = db.Reservations.AsParallelWriter(),
                Now           = now,
                Tick          = tick,
            }.ScheduleParallel(dep);

            db.PipelineHandle = handle;
            state.Dependency  = handle;
        }
    }

    [BurstCompile]
    public partial struct FurnaceTickJob : IJobEntity
    {
        public Entity Capital;
        [ReadOnly] public BufferLookup<CapitalLedger> CapitalLookup;
        public NativeParallelMultiHashMap<LedgerKey, ReservationRecord>.ParallelWriter Reservations;
        public float Now;
        public uint  Tick;

        public void Execute(in FurnaceTag tag, ref FurnaceProduction prod)
        {
            if (prod.CycleEndsAt > 0f)
            {
                if (Now < prod.CycleEndsAt) return;

                if (prod.Output1Amount > 0)
                    Reservations.Add(ReservationOps.Key(Capital, prod.Output1Id), ReservationOps.Produce(Capital, prod.Output1Amount, Tick));
                if (prod.Output2Amount > 0)
                    Reservations.Add(ReservationOps.Key(Capital, prod.Output2Id), ReservationOps.Produce(Capital, prod.Output2Amount, Tick));
                if (prod.Output3Amount > 0)
                    Reservations.Add(ReservationOps.Key(Capital, prod.Output3Id), ReservationOps.Produce(Capital, prod.Output3Amount, Tick));

                prod.CycleEndsAt = 0f;
                return;
            }

            var storage = CapitalLookup[Capital].Reinterpret<BankLedgerBase>();
            if (prod.Input1Amount > 0 && BankLedgerOps.CountOf(storage, prod.Input1Id) < prod.Input1Amount) return;
            if (prod.Input2Amount > 0 && BankLedgerOps.CountOf(storage, prod.Input2Id) < prod.Input2Amount) return;

            if (prod.Input1Amount > 0)
                Reservations.Add(ReservationOps.Key(Capital, prod.Input1Id), ReservationOps.Consume(Capital, prod.Input1Amount, Tick));
            if (prod.Input2Amount > 0)
                Reservations.Add(ReservationOps.Key(Capital, prod.Input2Id), ReservationOps.Consume(Capital, prod.Input2Amount, Tick));

            prod.CycleEndsAt = Now + prod.CycleDuration;
        }
    }
}
