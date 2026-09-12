using Unity.Burst;
using Unity.Collections;
using Unity.Entities;
using Unity.Jobs;
using Unity.Mathematics;

namespace RareIcon
{
    /// <summary>Writes TenderMultiplier.Value = 1 when any Lumberjack-intent unit stands on a Lumbercamp's footprint *or* is ShelteredInside the camp (Phase B garrison path). Otherwise 0 — LumbercampProductionSystem refuses to start a cycle without a worker. Prep scans run as parallel IJobEntity passes into NativeParallelHashSet ParallelWriters, replacing the prior pair of main-thread foreach scans.</summary>
    [BurstCompile]
    [UpdateInGroup(typeof(BehaviorSystemGroup))]
    [UpdateAfter(typeof(ProfessionDispatchSystem))]
    public partial struct LumbercampTenderScanSystem : ISystem
    {
        [BurstCompile] public void OnCreate(ref SystemState state) { }
        [BurstCompile] public void OnDestroy(ref SystemState state) { }

        [BurstCompile]
        public void OnUpdate(ref SystemState state)
        {
            var tendedHexes  = new NativeParallelHashSet<int2>(256, Allocator.TempJob);
            var tendingHosts = new NativeParallelHashSet<Entity>(64, Allocator.TempJob);

            var hexHandle = new CollectLumberjackHexesJob
            {
                Writer = tendedHexes.AsParallelWriter(),
            }.ScheduleParallel(state.Dependency);

            var hostHandle = new CollectLumberjackHostsJob
            {
                Writer = tendingHosts.AsParallelWriter(),
            }.ScheduleParallel(state.Dependency);

            state.Dependency = new LumbercampTenderJob
            {
                TendedHexes  = tendedHexes,
                TendingHosts = tendingHosts,
            }.ScheduleParallel(JobHandle.CombineDependencies(hexHandle, hostHandle));

            state.Dependency = tendedHexes.Dispose(state.Dependency);
            state.Dependency = tendingHosts.Dispose(state.Dependency);
        }
    }

    [BurstCompile]
    [WithNone(typeof(ShelteredInside))]
    public partial struct CollectLumberjackHexesJob : IJobEntity
    {
        public NativeParallelHashSet<int2>.ParallelWriter Writer;

        void Execute(in ProfessionIntent intent, in UnitMovement movement)
        {
            if (intent.Kind != ProfessionKind.Lumberjack) return;
            Writer.Add(movement.CurrentHex);
        }
    }

    [BurstCompile]
    public partial struct CollectLumberjackHostsJob : IJobEntity
    {
        public NativeParallelHashSet<Entity>.ParallelWriter Writer;

        void Execute(in ProfessionIntent intent, in ShelteredInside sheltered)
        {
            if (intent.Kind != ProfessionKind.Lumberjack) return;
            Writer.Add(sheltered.Host);
        }
    }

    [BurstCompile]
    [WithAll(typeof(LumbercampTag))]
    public partial struct LumbercampTenderJob : IJobEntity
    {
        [ReadOnly] public NativeParallelHashSet<int2>   TendedHexes;
        [ReadOnly] public NativeParallelHashSet<Entity> TendingHosts;

        void Execute(Entity entity, in Building building, ref TenderMultiplier tender)
        {
            bool tended = TendedHexes.Contains(building.RootHex) || TendingHosts.Contains(entity);
            tender.Value = tended ? 1f : 0f;
        }
    }

    /// <summary>Writes TenderMultiplier.Value = 1 when any Miner-intent unit stands on a Mining Pit's footprint *or* is ShelteredInside the pit (Phase B garrison path). Otherwise 0 — MiningPitProductionSystem refuses to start a cycle without a worker. Prep scans run as parallel IJobEntity passes into NativeParallelHashSet ParallelWriters, replacing the prior pair of main-thread foreach scans.</summary>
    [BurstCompile]
    [UpdateInGroup(typeof(BehaviorSystemGroup))]
    [UpdateAfter(typeof(ProfessionDispatchSystem))]
    public partial struct MiningPitTenderScanSystem : ISystem
    {
        [BurstCompile] public void OnCreate(ref SystemState state) { }
        [BurstCompile] public void OnDestroy(ref SystemState state) { }

        [BurstCompile]
        public void OnUpdate(ref SystemState state)
        {
            var tendedHexes  = new NativeParallelHashSet<int2>(256, Allocator.TempJob);
            var tendingHosts = new NativeParallelHashSet<Entity>(64, Allocator.TempJob);

            var hexHandle = new CollectMinerHexesJob
            {
                Writer = tendedHexes.AsParallelWriter(),
            }.ScheduleParallel(state.Dependency);

            var hostHandle = new CollectMinerHostsJob
            {
                Writer = tendingHosts.AsParallelWriter(),
            }.ScheduleParallel(state.Dependency);

            state.Dependency = new MiningPitTenderJob
            {
                TendedHexes  = tendedHexes,
                TendingHosts = tendingHosts,
            }.ScheduleParallel(JobHandle.CombineDependencies(hexHandle, hostHandle));

            state.Dependency = tendedHexes.Dispose(state.Dependency);
            state.Dependency = tendingHosts.Dispose(state.Dependency);
        }
    }

    [BurstCompile]
    [WithNone(typeof(ShelteredInside))]
    public partial struct CollectMinerHexesJob : IJobEntity
    {
        public NativeParallelHashSet<int2>.ParallelWriter Writer;

        void Execute(in ProfessionIntent intent, in UnitMovement movement)
        {
            if (intent.Kind != ProfessionKind.Miner) return;
            Writer.Add(movement.CurrentHex);
        }
    }

    [BurstCompile]
    public partial struct CollectMinerHostsJob : IJobEntity
    {
        public NativeParallelHashSet<Entity>.ParallelWriter Writer;

        void Execute(in ProfessionIntent intent, in ShelteredInside sheltered)
        {
            if (intent.Kind != ProfessionKind.Miner) return;
            Writer.Add(sheltered.Host);
        }
    }

    [BurstCompile]
    [WithAll(typeof(MiningPitTag))]
    public partial struct MiningPitTenderJob : IJobEntity
    {
        [ReadOnly] public NativeParallelHashSet<int2>   TendedHexes;
        [ReadOnly] public NativeParallelHashSet<Entity> TendingHosts;

        void Execute(Entity entity, in Building building, ref TenderMultiplier tender)
        {
            bool tended = TendedHexes.Contains(building.RootHex) || TendingHosts.Contains(entity);
            tender.Value = tended ? 1f : 0f;
        }
    }
}
