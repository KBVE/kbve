using Unity.Burst;
using Unity.Collections;
using Unity.Entities;
using Unity.Jobs;
using Unity.Mathematics;

namespace RareIcon
{
    /// <summary>First phase of the split dispatcher pipeline (#11 from #11716). Runs every tick: handles ReliefIntent + ControlledUnitTag overrides, pops drained or invalidated task heads, and promotes Pending → Active. Splits out of the prior monolithic ProfessionDispatchSystem so the override / queue-reconcile path is a small, focused job that runs every frame regardless of full-dispatch cadence; ProfessionPreemptSystem + ProfessionDispatchSystem run after this and only act on units this phase didn't already commit. Emits ReliefOverride / ManualOverride events via the parallel ProfessionEventSink overload; pre-grows ProfessionsDBSingleton.WriteBuffer capacity on the main thread to keep AddNoResize safe across worker threads.</summary>
    [BurstCompile]
    [UpdateInGroup(typeof(BehaviorSystemGroup))]
    [UpdateAfter(typeof(ReliefSystem))]
    [UpdateAfter(typeof(ProfessionsDomainSystem))]
    public partial struct ProfessionTaskReconcileSystem : ISystem
    {
        public void OnCreate(ref SystemState state)
        {
            state.RequireForUpdate<ProfessionsDBSingleton>();
        }

        [BurstCompile]
        public void OnUpdate(ref SystemState state)
        {
            ref var dbRef       = ref SystemAPI.GetSingletonRW<ProfessionsDBSingleton>().ValueRW;
            var     writeBuffer = dbRef.WriteBuffer;

            // Capacity headroom for the worst case where every unit emits a
            // ReliefOverride / ManualOverride this tick. Reconcile is the
            // first profession system to write into WriteBuffer each frame,
            // so we grow once here on behalf of Preempt + Dispatch too — all
            // three then AddNoResize without contention.
            var unitQuery = SystemAPI.QueryBuilder()
                .WithAll<ProfessionPriorities, ReliefIntent, ProfessionIntent, TaskMemory>()
                .Build();
            int unitCount        = unitQuery.CalculateEntityCount();
            int requiredCapacity = writeBuffer.Length + unitCount;
            if (writeBuffer.Capacity < requiredCapacity)
                writeBuffer.SetCapacity(math.max(requiredCapacity, writeBuffer.Capacity * 2));

            var job = new ReconcileJob
            {
                ControlledLookup = SystemAPI.GetComponentLookup<ControlledUnitTag>(true),
                Events           = writeBuffer.AsParallelWriter(),
                NowTick          = (uint)(SystemAPI.Time.ElapsedTime * 1000d),
            };

            state.Dependency      = job.ScheduleParallel(state.Dependency);
            dbRef.PipelineHandle  = state.Dependency;
        }

        [BurstCompile]
        partial struct ReconcileJob : IJobEntity
        {
            [ReadOnly] public ComponentLookup<ControlledUnitTag>             ControlledLookup;
            public           NativeList<ProfessionChangedMessage>.ParallelWriter Events;
            public           uint                                               NowTick;

            public void Execute(
                Entity entity,
                in ReliefIntent reliefIntent,
                ref ProfessionIntent intent,
                DynamicBuffer<TaskMemory> tasks)
            {
                if (reliefIntent.Kind != ReliefKind.None)
                {
                    if (tasks.Length > 0)
                    {
                        var head = tasks[0];
                        if (head.State == TaskState.Active)
                        {
                            head.State = TaskState.Pending;
                            tasks[0]   = head;
                        }
                    }
                    var prev = intent;
                    if (prev.Kind != ProfessionKind.None)
                    {
                        intent = default;
                        ProfessionEventSink.Add(ref Events, entity, prev.Kind, ProfessionKind.None, default, Entity.Null, NowTick, ProfessionChangeReason.ReliefOverride);
                    }
                    return;
                }

                if (ControlledLookup.HasComponent(entity))
                {
                    if (tasks.Length > 0) tasks.Clear();
                    var prev = intent;
                    if (prev.Kind != ProfessionKind.None)
                    {
                        intent = default;
                        ProfessionEventSink.Add(ref Events, entity, prev.Kind, ProfessionKind.None, default, Entity.Null, NowTick, ProfessionChangeReason.ManualOverride);
                    }
                    return;
                }

                // Pop drained / invalidated heads so Preempt + Dispatch see
                // the next live task (or an empty queue).
                while (tasks.Length > 0 &&
                       (tasks[0].State == TaskState.Invalidated ||
                        tasks[0].State == TaskState.Completed))
                {
                    tasks.RemoveAt(0);
                }

                if (tasks.Length > 0)
                {
                    var head = tasks[0];
                    if (head.State == TaskState.Pending)
                    {
                        head.State = TaskState.Active;
                        tasks[0]   = head;
                        intent = new ProfessionIntent
                        {
                            Kind         = head.Kind,
                            TargetHex    = head.TargetHex,
                            TargetEntity = head.TargetEntity,
                        };
                    }
                }
            }
        }
    }
}
