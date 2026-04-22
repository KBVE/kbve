using Unity.Burst;
using Unity.Collections;
using Unity.Entities;
using Unity.Jobs;

namespace RareIcon
{
    /// <summary>Parallel death event producer. Iterates the DeadTag+Unit+Faction+UnitMovement archetype via IJobEntity.ScheduleParallel and appends UnitKilledRecord into CombatDBSingleton.UnitKilledWriteBuffer via a NativeList.ParallelWriter. Pre-sizes the buffer to the archetype population before schedule so AddNoResize is lockless. Runs in CleanupSystemGroup before DeathCleanupSystem destroys the entity; chained into CombatDBSingleton.PipelineHandle so CombatDomainSystem's next-frame swap drains cleanly.</summary>
    [BurstCompile]
    [UpdateInGroup(typeof(CleanupSystemGroup))]
    [UpdateBefore(typeof(DeathCleanupSystem))]
    public partial struct CombatDeathHookSystem : ISystem
    {
        EntityQuery _deadQuery;

        public void OnCreate(ref SystemState state)
        {
            state.RequireForUpdate<CombatDBSingleton>();
            _deadQuery = new EntityQueryBuilder(Allocator.Temp)
                .WithAll<DeadTag, Unit, Faction, UnitMovement>()
                .Build(ref state);
            state.RequireForUpdate(_deadQuery);
        }

        [BurstCompile]
        public void OnUpdate(ref SystemState state)
        {
            ref var db = ref SystemAPI.GetSingletonRW<CombatDBSingleton>().ValueRW;

            int bound = _deadQuery.CalculateEntityCountWithoutFiltering();
            if (db.UnitKilledWriteBuffer.Capacity < bound)
                db.UnitKilledWriteBuffer.Capacity = bound;

            var combined = JobHandle.CombineDependencies(state.Dependency, db.PipelineHandle);

            var handle = new UnitKilledHookJob
            {
                Writer = db.UnitKilledWriteBuffer.AsParallelWriter(),
            }.ScheduleParallel(_deadQuery, combined);

            state.Dependency  = handle;
            db.PipelineHandle = handle;
        }
    }

    /// <summary>Per-entity Burst job — captures the Entity + unit type + faction + current hex into a UnitKilledRecord. Must run before DeathCleanupSystem destroys the entity so the Entity handle in the record is still live for the one-frame consumer window.</summary>
    [BurstCompile]
    [WithAll(typeof(DeadTag))]
    public partial struct UnitKilledHookJob : IJobEntity
    {
        public NativeList<UnitKilledRecord>.ParallelWriter Writer;

        void Execute(Entity entity, in Unit unit, in Faction faction, in UnitMovement movement)
        {
            Writer.AddNoResize(new UnitKilledRecord
            {
                Entity   = entity,
                UnitType = unit.Type,
                Faction  = faction.Value,
                Hex      = movement.CurrentHex,
            });
        }
    }
}
