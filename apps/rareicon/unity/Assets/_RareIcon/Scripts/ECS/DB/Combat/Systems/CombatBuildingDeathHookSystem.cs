using Unity.Burst;
using Unity.Collections;
using Unity.Entities;
using Unity.Jobs;

namespace RareIcon
{
    /// <summary>Parallel building destruction event producer. Iterates the BuildingHealth+Building archetype via IJobEntity.ScheduleParallel; emits a BuildingDestroyedRecord for every entity whose Value dropped to zero. Pre-sizes CombatDBSingleton.BuildingDestroyedWriteBuffer to the archetype population before schedule so AddNoResize is lockless. Runs before BuildingDeathSystem so the Entity handle in the record captures the entity while it is still alive. Same-frame destroy prevents duplicate emissions next tick — no edge-detection set is required.</summary>
    [BurstCompile]
    [UpdateInGroup(typeof(CleanupSystemGroup))]
    [UpdateBefore(typeof(BuildingDeathSystem))]
    public partial struct CombatBuildingDeathHookSystem : ISystem
    {
        EntityQuery _buildingQuery;

        public void OnCreate(ref SystemState state)
        {
            state.RequireForUpdate<CombatDBSingleton>();
            _buildingQuery = new EntityQueryBuilder(Allocator.Temp)
                .WithAll<BuildingHealth, Building>()
                .Build(ref state);
            state.RequireForUpdate(_buildingQuery);
        }

        [BurstCompile]
        public void OnUpdate(ref SystemState state)
        {
            ref var db = ref SystemAPI.GetSingletonRW<CombatDBSingleton>().ValueRW;

            int bound = _buildingQuery.CalculateEntityCountWithoutFiltering();
            if (db.BuildingDestroyedWriteBuffer.Capacity < bound)
                db.BuildingDestroyedWriteBuffer.Capacity = bound;

            var combined = JobHandle.CombineDependencies(state.Dependency, db.PipelineHandle);

            var handle = new BuildingDestroyedHookJob
            {
                Writer = db.BuildingDestroyedWriteBuffer.AsParallelWriter(),
            }.ScheduleParallel(_buildingQuery, combined);

            state.Dependency  = handle;
            db.PipelineHandle = handle;
        }
    }

    /// <summary>Per-entity Burst job — filters in-job by BuildingHealth.Value == 0 (the archetype filter would require an enableable flag; cheap value check is fine) and captures Entity + type + faction + root hex into a BuildingDestroyedRecord.</summary>
    [BurstCompile]
    public partial struct BuildingDestroyedHookJob : IJobEntity
    {
        public NativeList<BuildingDestroyedRecord>.ParallelWriter Writer;

        void Execute(Entity entity, in BuildingHealth health, in Building building)
        {
            if (health.Value > 0) return;
            Writer.AddNoResize(new BuildingDestroyedRecord
            {
                Entity       = entity,
                BuildingType = building.Type,
                Faction      = building.OwnerFaction,
                RootHex      = building.RootHex,
            });
        }
    }
}
