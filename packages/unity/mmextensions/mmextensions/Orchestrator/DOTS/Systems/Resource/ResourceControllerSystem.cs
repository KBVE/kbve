using Unity.Burst;
using Unity.Collections;
using Unity.Entities;
using Unity.Mathematics;
using Unity.Transforms;

namespace KBVE.MMExtensions.Orchestrator.DOTS
{
    /// <summary>
    /// System responsible for managing resource health, damage, and lifecycle.
    /// - Combatants damage their targets directly (O(C) complexity instead of O(R×C))
    /// - Marks resources as depleted when Amount reaches 0
    /// - Destroys depleted resources using ECB (triggers cache update via change filters)
    ///
    /// PERFORMANCE FIX:
    /// - Before: O(R × C) = 20k resources × 1000 combatants = 20 MILLION distance checks/frame
    /// - After: O(C) = 1000 combatants damage their targets = 1000 ops/frame (20000x faster!)
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

        /// <summary>
        /// NEW APPROACH: Each attacking combatant damages its target directly
        /// Complexity: O(C) where C = number of attacking combatants
        /// </summary>
        [BurstCompile]
        private partial struct CombatantDamageTargetJob : IJobEntity
        {
            [NativeDisableParallelForRestriction]
            public ComponentLookup<Resource> ResourceLookup;

            [NativeDisableParallelForRestriction]
            public ComponentLookup<ResourceDamageAccumulator> AccumulatorLookup;

            public float DeltaTime;

            private void Execute(in Combatant combatant)
            {
                // Only process combatants that are attacking
                if (combatant.Data.State != CombatantState.Attacking)
                    return;

                // Check if combatant has a target
                Entity targetEntity = combatant.Data.TargetEntity;
                if (targetEntity == Entity.Null)
                    return;

                // Check if target is a valid resource
                if (!ResourceLookup.HasComponent(targetEntity))
                    return;

                var resource = ResourceLookup[targetEntity];

                // Skip if already depleted
                if (resource.Data.IsDepleted)
                    return;

                // Apply damage to the target resource
                const float DAMAGE_PER_SECOND = 1.0f;
                float damageThisFrame = DAMAGE_PER_SECOND * DeltaTime;

                // Get or create accumulator for this resource
                if (!AccumulatorLookup.HasComponent(targetEntity))
                    return; // Accumulator will be added by AddDamageAccumulatorJob

                var accumulator = AccumulatorLookup[targetEntity];
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

                // Write back modified components
                ResourceLookup[targetEntity] = resource;
                AccumulatorLookup[targetEntity] = accumulator;
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
            public EntityQuery ResourcesWithoutAccumulatorQuery;
        }

        [BurstCompile]
        public void OnCreate(ref SystemState state)
        {
            var systemData = new SystemData();

            // Query for resources without damage accumulator
            var resourcesWithoutAccumulatorBuilder = new EntityQueryBuilder(Allocator.Temp)
                .WithAll<Resource>()
                .WithNone<ResourceDamageAccumulator>();
            systemData.ResourcesWithoutAccumulatorQuery = state.GetEntityQuery(resourcesWithoutAccumulatorBuilder);
            resourcesWithoutAccumulatorBuilder.Dispose();

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

            // NEW APPROACH: Each attacking combatant damages its target directly
            // Complexity: O(C) where C = number of attacking combatants
            // This eliminates the O(R × C) bottleneck where resources iterated through all combatants
            var damageJob = new CombatantDamageTargetJob
            {
                ResourceLookup = SystemAPI.GetComponentLookup<Resource>(false),
                AccumulatorLookup = SystemAPI.GetComponentLookup<ResourceDamageAccumulator>(false),
                DeltaTime = SystemAPI.Time.DeltaTime
            };
            state.Dependency = damageJob.ScheduleParallel(state.Dependency);

            // Destroy depleted resources using ECB
            var ecbSingleton = SystemAPI.GetSingleton<BeginSimulationEntityCommandBufferSystem.Singleton>();
            var ecb = ecbSingleton.CreateCommandBuffer(state.WorldUnmanaged);

            var destroyJob = new DestroyDepletedResourcesJob
            {
                ECB = ecb.AsParallelWriter()
            };
            state.Dependency = destroyJob.ScheduleParallel(state.Dependency);
        }
    }
}
