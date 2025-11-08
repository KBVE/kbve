using Unity.Burst;
using Unity.Collections;
using Unity.Entities;
using Unity.Mathematics;
using Unity.Transforms;

namespace KBVE.MMExtensions.Orchestrator.DOTS
{
    /// <summary>
    /// System responsible for managing resource health, damage, and lifecycle.
    /// - Applies damage from nearby attacking combatants
    /// - Marks resources as depleted when Amount reaches 0
    /// - Destroys depleted resources using ECB (triggers cache update via change filters)
    /// </summary>
    [BurstCompile]
    [UpdateInGroup(typeof(SimulationSystemGroup))]
    [UpdateAfter(typeof(CombatantAttackResourceSystem))]
    public partial struct ResourceControllerSystem : ISystem
    {
        /// <summary>
        /// Component to track accumulated fractional damage on resources
        /// </summary>
        public struct ResourceDamageAccumulator : IComponentData
        {
            public float AccumulatedDamage; // Fractional damage that hasn't reduced Amount yet
        }

        [BurstCompile]
        private partial struct ApplyDamageJob : IJobEntity
        {
            [ReadOnly] public NativeArray<Entity> AttackingCombatants;
            [ReadOnly] public NativeArray<LocalTransform> CombatantTransforms;
            [ReadOnly] public NativeArray<Combatant> Combatants;
            public float DeltaTime;

            private void Execute(Entity resourceEntity, ref Resource resource, ref ResourceDamageAccumulator accumulator, in LocalTransform resourceTransform)
            {
                // Skip if already depleted or no attacking combatants
                if (resource.Data.IsDepleted || AttackingCombatants.Length == 0)
                    return;

                // Check all attacking combatants for proximity
                for (int i = 0; i < AttackingCombatants.Length; i++)
                {
                    var combatant = Combatants[i];
                    var combatantTransform = CombatantTransforms[i];

                    // Calculate distance to this combatant
                    float distance = math.distance(resourceTransform.Position, combatantTransform.Position);

                    // Attack range check (same as in CombatantAttackResourceSystem)
                    float attackRange = math.min(combatant.Data.DetectionRange * 0.5f, 2f);

                    // Only apply damage if combatant is within attack range
                    if (distance <= attackRange)
                    {
                        // Fixed damage rate: 1 damage per second (ignoring combatant stats)
                        // This makes resources deplete at a predictable rate
                        // Example: 90 Amount resource = 90 seconds to deplete

                        const float DAMAGE_PER_SECOND = 1.0f;
                        float damageThisFrame = DAMAGE_PER_SECOND * DeltaTime;

                        // Accumulate damage directly on the component
                        accumulator.AccumulatedDamage += damageThisFrame;

                        // Only reduce Amount when accumulated damage >= 1.0
                        if (accumulator.AccumulatedDamage >= 1.0f)
                        {
                            int damageToApply = (int)accumulator.AccumulatedDamage;
                            accumulator.AccumulatedDamage -= damageToApply; // Keep fractional remainder

                            var newData = resource.Data;
                            newData.Amount = math.max(0, newData.Amount - damageToApply);

                            // Check if depleted
                            if (newData.Amount <= 0)
                            {
                                newData = newData.SetDepleted(true);
                            }

                            resource.Data = newData;
                        }

                        // Only take damage from one combatant per frame (prevents multi-hit)
                        break;
                    }
                }
            }
        }

        [BurstCompile]
        private partial struct AddDamageAccumulatorJob : IJobEntity
        {
            public EntityCommandBuffer.ParallelWriter ECB;

            private void Execute(Entity entity, [ChunkIndexInQuery] int chunkIndex, in Resource resource)
            {
                // Add damage accumulator component to resources that don't have one yet
                ECB.AddComponent(chunkIndex, entity, new ResourceDamageAccumulator { AccumulatedDamage = 0f });
            }
        }

        [BurstCompile]
        private partial struct DestroyDepletedResourcesJob : IJobEntity
        {
            public EntityCommandBuffer.ParallelWriter ECB;

            private void Execute(Entity entity, [ChunkIndexInQuery] int chunkIndex, in Resource resource)
            {
                // Destroy depleted resources
                if (resource.Data.IsDepleted)
                {
                    ECB.DestroyEntity(chunkIndex, entity);
                }
            }
        }

        [BurstCompile]
        private partial struct FilterAttackingCombatantsJob : IJobEntity
        {
            public NativeList<Entity>.ParallelWriter FilteredEntities;
            public NativeList<LocalTransform>.ParallelWriter FilteredTransforms;
            public NativeList<Combatant>.ParallelWriter FilteredCombatants;

            private void Execute(Entity entity, in Combatant combatant, in LocalTransform transform)
            {
                // Only include combatants in Attacking state
                if (combatant.Data.State == CombatantState.Attacking)
                {
                    FilteredEntities.AddNoResize(entity);
                    FilteredTransforms.AddNoResize(transform);
                    FilteredCombatants.AddNoResize(combatant);
                }
            }
        }

        private struct SystemData : IComponentData
        {
            public EntityQuery ResourceQuery;
            public EntityQuery ResourcesWithoutAccumulatorQuery;
            public EntityQuery AttackingCombatantQuery;
        }

        [BurstCompile]
        public void OnCreate(ref SystemState state)
        {
            var systemData = new SystemData();

            // Query for all resources with damage accumulator
            var resourceQueryBuilder = new EntityQueryBuilder(Allocator.Temp)
                .WithAll<Resource, LocalTransform, ResourceDamageAccumulator>();
            systemData.ResourceQuery = state.GetEntityQuery(resourceQueryBuilder);
            resourceQueryBuilder.Dispose();

            // Query for resources without damage accumulator
            var resourcesWithoutAccumulatorBuilder = new EntityQueryBuilder(Allocator.Temp)
                .WithAll<Resource>()
                .WithNone<ResourceDamageAccumulator>();
            systemData.ResourcesWithoutAccumulatorQuery = state.GetEntityQuery(resourcesWithoutAccumulatorBuilder);
            resourcesWithoutAccumulatorBuilder.Dispose();

            // Query for combatants that are currently attacking
            var combatantQueryBuilder = new EntityQueryBuilder(Allocator.Temp)
                .WithAll<Combatant, LocalTransform>();
            systemData.AttackingCombatantQuery = state.GetEntityQuery(combatantQueryBuilder);
            combatantQueryBuilder.Dispose();

            state.EntityManager.AddComponentData(state.SystemHandle, systemData);
        }

        [BurstCompile]
        public void OnUpdate(ref SystemState state)
        {
            var systemData = SystemAPI.GetComponent<SystemData>(state.SystemHandle);

            // Add damage accumulators to resources that don't have them yet
            if (!systemData.ResourcesWithoutAccumulatorQuery.IsEmpty)
            {
                var accumulatorEcbSingleton = SystemAPI.GetSingleton<BeginSimulationEntityCommandBufferSystem.Singleton>();
                var accumulatorEcb = accumulatorEcbSingleton.CreateCommandBuffer(state.WorldUnmanaged);

                var addAccumulatorJob = new AddDamageAccumulatorJob
                {
                    ECB = accumulatorEcb.AsParallelWriter()
                };
                state.Dependency = addAccumulatorJob.ScheduleParallel(systemData.ResourcesWithoutAccumulatorQuery, state.Dependency);
            }

            // Pre-allocate filtered lists with estimated capacity to avoid resizing
            var combatantCount = systemData.AttackingCombatantQuery.CalculateEntityCount();
            if (combatantCount == 0)
            {
                return; // Early exit if no combatants at all
            }

            NativeList<Entity> filteredEntities = new NativeList<Entity>(combatantCount, Allocator.TempJob);
            NativeList<LocalTransform> filteredTransforms = new NativeList<LocalTransform>(combatantCount, Allocator.TempJob);
            NativeList<Combatant> filteredCombatants = new NativeList<Combatant>(combatantCount, Allocator.TempJob);

            // Use Burst-compiled job to filter attacking combatants asynchronously
            var filterJob = new FilterAttackingCombatantsJob
            {
                FilteredEntities = filteredEntities.AsParallelWriter(),
                FilteredTransforms = filteredTransforms.AsParallelWriter(),
                FilteredCombatants = filteredCombatants.AsParallelWriter()
            };
            state.Dependency = filterJob.ScheduleParallel(systemData.AttackingCombatantQuery, state.Dependency);

            // Early exit check will be done after job completes (via dependency chain)
            // Note: We can't check filteredEntities.Length here without completing the job
            // So we'll let the ApplyDamageJob handle empty arrays efficiently

            // Apply damage job - use AsDeferredJobArray() to avoid blocking on filter job completion
            var applyDamageJob = new ApplyDamageJob
            {
                AttackingCombatants = filteredEntities.AsDeferredJobArray(),
                CombatantTransforms = filteredTransforms.AsDeferredJobArray(),
                Combatants = filteredCombatants.AsDeferredJobArray(),
                DeltaTime = SystemAPI.Time.DeltaTime
            };
            state.Dependency = applyDamageJob.ScheduleParallel(state.Dependency);

            // Destroy depleted resources using ECB
            var ecbSingleton = SystemAPI.GetSingleton<BeginSimulationEntityCommandBufferSystem.Singleton>();
            var ecb = ecbSingleton.CreateCommandBuffer(state.WorldUnmanaged);

            var destroyJob = new DestroyDepletedResourcesJob
            {
                ECB = ecb.AsParallelWriter()
            };
            state.Dependency = destroyJob.ScheduleParallel(state.Dependency);

            // Dispose filtered arrays after jobs complete
            state.Dependency = filteredEntities.Dispose(state.Dependency);
            state.Dependency = filteredTransforms.Dispose(state.Dependency);
            state.Dependency = filteredCombatants.Dispose(state.Dependency);
        }
    }
}
