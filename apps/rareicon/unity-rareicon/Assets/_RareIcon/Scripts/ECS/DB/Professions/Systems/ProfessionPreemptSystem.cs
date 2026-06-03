using Unity.Burst;
using Unity.Collections;
using Unity.Entities;
using Unity.Mathematics;
using Unity.Transforms;

namespace RareIcon
{
    /// <summary>Second phase of the split dispatcher pipeline (#11 from #11716). Runs after ProfessionTaskReconcileSystem, before ProfessionDispatchSystem. Yanks the current task off any unit whose Guard priority is past the preempt threshold and an in-territory threat is nearby; writes a Guard ProfessionIntent + emits a Preempted event. System-level skip when CombatDBSingleton.Threats is empty — no chunk iteration on quiet ticks. Splits out of the prior monolithic ProfessionDispatchSystem so this scan is a focused job that only runs when threats are actually present.</summary>
    [BurstCompile]
    [UpdateInGroup(typeof(BehaviorSystemGroup))]
    [UpdateAfter(typeof(ProfessionTaskReconcileSystem))]
    [UpdateAfter(typeof(CombatThreatScanSystem))]
    public partial struct ProfessionPreemptSystem : ISystem
    {
        const byte GuardPreemptThreshold = 3;

        public void OnCreate(ref SystemState state)
        {
            state.RequireForUpdate<ProfessionsDBSingleton>();
            state.RequireForUpdate<CombatDBSingleton>();
        }

        [BurstCompile]
        public void OnUpdate(ref SystemState state)
        {
            var combatDB = SystemAPI.GetSingleton<CombatDBSingleton>();
            state.Dependency = Unity.Jobs.JobHandle.CombineDependencies(state.Dependency, combatDB.PipelineHandle);

            if (combatDB.Threats.Length == 0)
                return;

            ref var dbRef       = ref SystemAPI.GetSingletonRW<ProfessionsDBSingleton>().ValueRW;
            var     writeBuffer = dbRef.WriteBuffer;

            var job = new PreemptJob
            {
                Threats = combatDB.Threats.AsArray(),
                Events  = writeBuffer.AsParallelWriter(),
                NowTick = (uint)(SystemAPI.Time.ElapsedTime * 1000d),
            };

            state.Dependency      = job.ScheduleParallel(state.Dependency);
            dbRef.PipelineHandle  = state.Dependency;
        }

        [BurstCompile]
        partial struct PreemptJob : IJobEntity
        {
            [ReadOnly] public NativeArray<ThreatRecord>                       Threats;
            public           NativeList<ProfessionChangedMessage>.ParallelWriter Events;
            public           uint                                               NowTick;

            public void Execute(
                Entity entity,
                in ProfessionPriorities priorities,
                in LocalTransform transform,
                ref ProfessionIntent intent,
                DynamicBuffer<TaskMemory> tasks)
            {
                if (priorities.Guard < GuardPreemptThreshold) return;
                if (tasks.Length == 0)                        return;

                var head = tasks[0];
                if (head.State != TaskState.Active) return;
                if (head.Kind  == ProfessionKind.Guard) return;

                if (!TryFindClosestThreat(Threats, transform.Position, out var hex, out var hostile))
                    return;

                tasks.Clear();
                var preemptedIntent = intent;
                intent = new ProfessionIntent
                {
                    Kind         = ProfessionKind.Guard,
                    TargetHex    = hex,
                    TargetEntity = hostile,
                };
                tasks.Add(new TaskMemory
                {
                    Kind         = ProfessionKind.Guard,
                    TargetHex    = hex,
                    TargetEntity = hostile,
                    State        = TaskState.Active,
                    IssuedTick   = NowTick,
                });
                if (preemptedIntent.Kind != ProfessionKind.Guard)
                    ProfessionEventSink.Add(ref Events, entity, preemptedIntent.Kind, ProfessionKind.Guard, hex, hostile, NowTick, ProfessionChangeReason.Preempted);
            }
        }

        static bool TryFindClosestThreat(
            NativeArray<ThreatRecord> threats,
            float3 originWorld,
            out int2 outHex, out Entity outEntity)
        {
            const float ScanRadiusSq = 6f * 6f;

            Entity bestEntity = Entity.Null, inBestEntity = Entity.Null;
            int2   bestHex    = default,     inBestHex    = default;
            float  bestSq     = float.MaxValue, inBestSq   = float.MaxValue;

            var origin = new float2(originWorld.x, originWorld.y);

            for (int i = 0; i < threats.Length; i++)
            {
                var t = threats[i];
                float d2 = math.distancesq(origin, t.Position);
                if (d2 > ScanRadiusSq) continue;

                if (d2 < bestSq)
                {
                    bestSq = d2; bestHex = t.Hex; bestEntity = t.Entity;
                }
                if (t.InsideFriendlyTerritory && d2 < inBestSq)
                {
                    inBestSq = d2; inBestHex = t.Hex; inBestEntity = t.Entity;
                }
            }

            if (inBestEntity != Entity.Null)
            {
                outHex    = inBestHex;
                outEntity = inBestEntity;
                return true;
            }

            if (bestEntity == Entity.Null)
            {
                outHex = default; outEntity = Entity.Null;
                return false;
            }

            outHex    = bestHex;
            outEntity = bestEntity;
            return true;
        }
    }
}
