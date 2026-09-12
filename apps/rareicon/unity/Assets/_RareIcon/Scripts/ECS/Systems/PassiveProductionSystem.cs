using Unity.Burst;
using Unity.Collections;
using Unity.Entities;
using Unity.Jobs;

namespace RareIcon
{
    /// <summary>Ticks PassiveProduction entities — free per-cycle Produce reservation against Capital.</summary>
    [UpdateInGroup(typeof(EconomySystemGroup), OrderFirst = true)]
    public partial struct PassiveProductionSystem : ISystem
    {
        public void OnCreate(ref SystemState state)
        {
            state.RequireForUpdate<LogisticsDBSingleton>();
            state.RequireForUpdate<WorldClock>();
            state.RequireForUpdate<PassiveProduction>();
            state.RequireForUpdate<CapitalTag>();
        }

        public void OnDestroy(ref SystemState state) { }

        public void OnUpdate(ref SystemState state)
        {
            var capital = SystemAPI.GetSingletonEntity<CapitalTag>();

            float now  = SystemAPI.GetSingleton<WorldClock>().AbsSeconds;
            uint  tick = (uint)(SystemAPI.Time.ElapsedTime * 1000d);

            ref var db = ref SystemAPI.GetSingletonRW<LogisticsDBSingleton>().ValueRW;
            var dep    = JobHandle.CombineDependencies(state.Dependency, db.PipelineHandle);

            var handle = new PassiveTickJob
            {
                Capital      = capital,
                Reservations = db.Reservations.AsParallelWriter(),
                Now          = now,
                Tick         = tick,
            }.ScheduleParallel(dep);

            db.PipelineHandle = handle;
            state.Dependency  = handle;
        }
    }

    [BurstCompile]
    public partial struct PassiveTickJob : IJobEntity
    {
        public Entity Capital;
        public NativeParallelMultiHashMap<LedgerKey, ReservationRecord>.ParallelWriter Reservations;
        public float  Now;
        public uint   Tick;

        public void Execute(ref PassiveProduction prod)
        {
            if (prod.CycleEndsAt == 0f)
            {
                prod.CycleEndsAt = Now + prod.CycleDuration;
                return;
            }
            if (Now < prod.CycleEndsAt) return;

            Reservations.Add(
                ReservationOps.Key(Capital, prod.OutputId),
                ReservationOps.Produce(Capital, prod.OutputAmount, Tick));

            prod.CycleEndsAt = prod.CycleEndsAt + prod.CycleDuration;
        }
    }
}
