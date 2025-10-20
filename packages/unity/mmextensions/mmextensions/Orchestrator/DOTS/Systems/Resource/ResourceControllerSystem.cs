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
            public ComponentLookup<ResourceDamageAccumulator> DamageAccumulatorLookup;
            public float DeltaTime;

            private void Execute(Entity resourceEntity, ref Resource resource, in LocalTransform resourceTransform)
            {
                // Skip if already depleted
                if (resource.Data.IsDepleted)
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

                        // Get or create damage accumulator
                        if (!DamageAccumulatorLookup.HasComponent(resourceEntity))
                        {
                            // Will be added by separate job - skip this frame
                            break;
                        }

                        var accumulator = DamageAccumulatorLookup[resourceEntity];
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

                        // Save accumulator
                        DamageAccumulatorLookup[resourceEntity] = accumulator;

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

            // Query for all resources
            var resourceQueryBuilder = new EntityQueryBuilder(Allocator.Temp)
                .WithAll<Resource, LocalTransform>();
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

            // Get all attacking combatants
            var attackingCombatantsFilter = systemData.AttackingCombatantQuery.ToEntityArray(Allocator.TempJob);
            var combatantTransforms = systemData.AttackingCombatantQuery.ToComponentDataArray<LocalTransform>(Allocator.TempJob);
            var combatants = systemData.AttackingCombatantQuery.ToComponentDataArray<Combatant>(Allocator.TempJob);

            // Filter to only those in Attacking state
            NativeList<Entity> filteredEntities = new NativeList<Entity>(Allocator.TempJob);
            NativeList<LocalTransform> filteredTransforms = new NativeList<LocalTransform>(Allocator.TempJob);
            NativeList<Combatant> filteredCombatants = new NativeList<Combatant>(Allocator.TempJob);

            for (int i = 0; i < combatants.Length; i++)
            {
                if (combatants[i].Data.State == CombatantState.Attacking)
                {
                    filteredEntities.Add(attackingCombatantsFilter[i]);
                    filteredTransforms.Add(combatantTransforms[i]);
                    filteredCombatants.Add(combatants[i]);
                }
            }

            // Dispose original arrays
            attackingCombatantsFilter.Dispose();
            combatantTransforms.Dispose();
            combatants.Dispose();

            // Early exit if no attacking combatants
            if (filteredEntities.Length == 0)
            {
                filteredEntities.Dispose();
                filteredTransforms.Dispose();
                filteredCombatants.Dispose();
                return;
            }

            // Apply damage job
            var applyDamageJob = new ApplyDamageJob
            {
                AttackingCombatants = filteredEntities.AsArray(),
                CombatantTransforms = filteredTransforms.AsArray(),
                Combatants = filteredCombatants.AsArray(),
                DamageAccumulatorLookup = SystemAPI.GetComponentLookup<ResourceDamageAccumulator>(false),
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
