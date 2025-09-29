using Unity.Entities;
using Unity.Burst;
using Unity.Collections;

namespace KBVE.MMExtensions.Orchestrator.DOTS.Systems
{
    /// <summary>
    /// High-performance system to initialize LocalAvoidanceData for new zombies
    /// Uses ISystem with burst compilation for maximum performance
    /// </summary>
    [UpdateInGroup(typeof(InitializationSystemGroup))]
    [BurstCompile]
    public partial struct ZombieAvoidanceInitSystem : ISystem
    {
        private uint _randomSeed;
        private EntityQuery _zombieQuery;

        public void OnCreate(ref SystemState state)
        {
            _randomSeed = 1234;

            // Only run when there are zombies without avoidance data
            _zombieQuery = state.GetEntityQuery(
                ComponentType.ReadOnly<ZombieTag>(),
                ComponentType.Exclude<LocalAvoidanceData>()
            );

            state.RequireForUpdate(_zombieQuery);
        }

        [BurstCompile]
        public void OnUpdate(ref SystemState state)
        {
            // Early exit if no zombies need initialization
            if (_zombieQuery.IsEmpty)
                return;

            var ecb = new EntityCommandBuffer(Allocator.TempJob);
            var currentSeed = _randomSeed;

            // Use burst-compiled job for maximum performance
            var initJob = new InitializeAvoidanceDataJob
            {
                ECB = ecb.AsParallelWriter(),
                BaseSeed = currentSeed
            };

            var jobHandle = initJob.ScheduleParallel(_zombieQuery, state.Dependency);
            jobHandle.Complete();

            ecb.Playback(state.EntityManager);
            ecb.Dispose();

            _randomSeed += 1000; // Update for next batch
        }

        [BurstCompile]
        public void OnDestroy(ref SystemState state)
        {
            // Cleanup if needed
        }
    }

    /// <summary>
    /// Burst-compiled job to initialize avoidance data in parallel
    /// </summary>
    [BurstCompile]
    public partial struct InitializeAvoidanceDataJob : IJobEntity
    {
        public EntityCommandBuffer.ParallelWriter ECB;
        [ReadOnly] public uint BaseSeed;

        public void Execute([ChunkIndexInQuery] int chunkIndex, Entity entity, in ZombieTag zombieTag)
        {
            // Generate unique seed for this entity
            uint entitySeed = BaseSeed + (uint)entity.Index;
            entitySeed = entitySeed * 1664525u + 1013904223u; // LCG for distribution

            // Create randomized avoidance data
            var avoidanceData = LocalAvoidanceData.CreateRandom(entitySeed);

            ECB.AddComponent(chunkIndex, entity, avoidanceData);
        }
    }
}