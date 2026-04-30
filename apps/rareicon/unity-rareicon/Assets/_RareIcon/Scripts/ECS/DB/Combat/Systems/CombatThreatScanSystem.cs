using Unity.Burst;
using Unity.Collections;
using Unity.Entities;
using Unity.Jobs;
using Unity.Mathematics;
using Unity.Transforms;

namespace RareIcon
{
    /// <summary>Parallel threat scan + edge-detection event emission — runs off the main thread. ThreatScanJob IJobEntity fans across Faction+LocalTransform chunks in Burst, filters hostiles in-job, writes ThreatRecords / ThreatDetectedRecords / this-frame Entity set via ParallelWriters. A serial ThreatClearedAndUpdateJob IJob then diffs PreviousFrameThreats vs thisFrame to emit ThreatClearedRecords, copies thisFrame into PreviousFrameThreats for next tick. All containers pre-sized before schedule so AddNoResize is lockless. PipelineHandle chained; ProfessionDispatchSystem calls state.CompleteDependency() before reading Threats.</summary>
    [BurstCompile]
    [UpdateInGroup(typeof(BehaviorSystemGroup))]
    [UpdateAfter(typeof(CombatDomainSystem))]
    [UpdateBefore(typeof(ProfessionDispatchSystem))]
    public partial struct CombatThreatScanSystem : ISystem
    {
        EntityQuery _scanQuery;

        public void OnCreate(ref SystemState state)
        {
            state.RequireForUpdate<CombatDBSingleton>();
            _scanQuery = new EntityQueryBuilder(Allocator.Temp)
                .WithAll<Faction, LocalTransform>()
                .Build(ref state);
        }

        [BurstCompile]
        public void OnUpdate(ref SystemState state)
        {
            ref var db = ref SystemAPI.GetSingletonRW<CombatDBSingleton>().ValueRW;

            foreach (var emRO in SystemAPI.Query<RefRO<TerritoryEmitter>>())
            {
                var em = emRO.ValueRO;
                if (em.Radius == 0) continue;
                if (em.OwnerFaction == FactionType.Player)       db.FriendlyEmitters.Add(em);
                else if (em.OwnerFaction == FactionType.Hostile) db.HostileEmitters.Add(em);
            }

            // Upper bound = full archetype population (hostiles share
            // Faction+LocalTransform with friendlies / neutrals; the job
            // filters by Faction.Value). Pre-sizing to this bound lets
            // ParallelWriter.AddNoResize run lockless with no growth risk.
            int bound = _scanQuery.CalculateEntityCountWithoutFiltering();

            EnsureListCapacity(ref db.Threats,                   bound);
            EnsureListCapacity(ref db.ThreatDetectedWriteBuffer, bound);
            EnsureListCapacity(ref db.ThreatClearedWriteBuffer,  db.PreviousFrameThreats.Count());

            // ThisFrame is built in parallel by the scan job and drained
            // by the serial cleared-and-update job the same tick. TempJob
            // is disposed at end of pipeline.
            var thisFrame = new NativeParallelHashSet<Entity>(math.max(bound, 16), Allocator.TempJob);

            var combined = JobHandle.CombineDependencies(state.Dependency, db.PipelineHandle);

            var scanJob = new ThreatScanJob
            {
                UnitLookup           = SystemAPI.GetComponentLookup<Unit>(true),
                Emitters             = db.FriendlyEmitters.AsArray(),
                PreviousFrameThreats = db.PreviousFrameThreats,
                ThreatsWriter        = db.Threats.AsParallelWriter(),
                DetectedWriter       = db.ThreatDetectedWriteBuffer.AsParallelWriter(),
                ThisFrameWriter      = thisFrame.AsParallelWriter(),
            };
            var scanHandle = scanJob.ScheduleParallel(_scanQuery, combined);

            var clearedJob = new ThreatClearedAndUpdateJob
            {
                UnitLookup           = SystemAPI.GetComponentLookup<Unit>(true),
                PreviousFrameThreats = db.PreviousFrameThreats,
                ThisFrame            = thisFrame,
                ThreatClearedWriter  = db.ThreatClearedWriteBuffer,
            };
            var clearedHandle = clearedJob.Schedule(scanHandle);

            var disposeHandle = thisFrame.Dispose(clearedHandle);

            state.Dependency  = disposeHandle;
            db.PipelineHandle = disposeHandle;
        }

        static void EnsureListCapacity<T>(ref NativeList<T> list, int needed) where T : unmanaged
        {
            if (list.Capacity < needed) list.Capacity = needed;
        }
    }

    /// <summary>Parallel hostile entity scan. Iterates the Faction+LocalTransform archetype in chunks; filters Hostile faction in-job. Writes snapshot + edge-triggered ThreatDetected records and populates the this-frame Entity set for downstream cleared-detection.</summary>
    [BurstCompile]
    public partial struct ThreatScanJob : IJobEntity
    {
        [ReadOnly] public ComponentLookup<Unit>            UnitLookup;
        [ReadOnly] public NativeArray<TerritoryEmitter>    Emitters;
        [ReadOnly] public NativeParallelHashSet<Entity>    PreviousFrameThreats;

        public NativeList<ThreatRecord>.ParallelWriter          ThreatsWriter;
        public NativeList<ThreatDetectedRecord>.ParallelWriter  DetectedWriter;
        public NativeParallelHashSet<Entity>.ParallelWriter     ThisFrameWriter;

        void Execute(Entity entity, in Faction faction, in LocalTransform tf)
        {
            byte f = faction.Value;
            if (f != FactionType.Hostile) return;

            var pos = new float2(tf.Position.x, tf.Position.y);
            var hex = HexMeshUtil.WorldToHex(pos.x, pos.y, 0.25f);

            bool inside = false;
            for (int i = 0; i < Emitters.Length; i++)
            {
                var e = Emitters[i];
                if (HexMeshUtil.HexDistance(hex, e.Center) <= e.Radius) { inside = true; break; }
            }

            byte unitType = 0;
            if (UnitLookup.HasComponent(entity)) unitType = UnitLookup[entity].Type;

            ThreatsWriter.AddNoResize(new ThreatRecord
            {
                Entity                  = entity,
                Position                = pos,
                Hex                     = hex,
                Faction                 = f,
                UnitType                = unitType,
                InsideFriendlyTerritory = inside,
            });

            ThisFrameWriter.Add(entity);

            if (!PreviousFrameThreats.Contains(entity))
            {
                DetectedWriter.AddNoResize(new ThreatDetectedRecord
                {
                    Entity                  = entity,
                    UnitType                = unitType,
                    Hex                     = hex,
                    InsideFriendlyTerritory = inside,
                });
            }
        }
    }

    /// <summary>Serial cleared-detection + previous-set update. Runs after the parallel scan job. Emits ThreatClearedRecord for every entity in PreviousFrameThreats not in ThisFrame, then rewrites PreviousFrameThreats to mirror ThisFrame for next tick.</summary>
    [BurstCompile]
    public struct ThreatClearedAndUpdateJob : IJob
    {
        [ReadOnly] public ComponentLookup<Unit>         UnitLookup;
        [ReadOnly] public NativeParallelHashSet<Entity> ThisFrame;
        public NativeParallelHashSet<Entity>            PreviousFrameThreats;
        public NativeList<ThreatClearedRecord>          ThreatClearedWriter;

        public void Execute()
        {
            foreach (var prev in PreviousFrameThreats)
            {
                if (ThisFrame.Contains(prev)) continue;
                byte unitType = 0;
                if (UnitLookup.HasComponent(prev)) unitType = UnitLookup[prev].Type;
                ThreatClearedWriter.Add(new ThreatClearedRecord
                {
                    Entity   = prev,
                    UnitType = unitType,
                    LastHex  = default,
                });
            }

            PreviousFrameThreats.Clear();
            foreach (var e in ThisFrame) PreviousFrameThreats.Add(e);
        }
    }

}
