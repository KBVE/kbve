using Unity.Burst;
using Unity.Collections;
using Unity.Entities;
using Unity.Transforms;
using Unity.Mathematics;

namespace KBVE.MMExtensions.Orchestrator.DOTS.Systems
{
    /// <summary>
    /// Factory system for spawning entities - exact match to Age-of-Sprites pattern
    /// Clean, simple, proven implementation
    /// </summary>
    [BurstCompile]
    public partial struct FactorySystem : ISystem
    {
        [BurstCompile]
        private partial struct ProductionJob : IJobEntity
        {
            public float DeltaTime;
            public EntityCommandBuffer.ParallelWriter ECB;

            private void Execute([ChunkIndexInQuery] int chunkIndex, ref FactoryTimer timer, ref FactoryData factoryData)
            {
                timer.value -= DeltaTime;

                if (timer.value <= 0 && factoryData.wavesSpawned < factoryData.maxWaves)
                {
                    timer.value += factoryData.duration;
                    factoryData.wavesSpawned++;


                    // Create zombie horde entity first
                    var hordeEntity = ECB.CreateEntity(chunkIndex);
                    ECB.AddComponent(chunkIndex, hordeEntity, new ZombieHordeTag());
                    ECB.AddComponent(chunkIndex, hordeEntity, new ZombieHordeSettings
                    {
                        formationSize = new int2(math.min(32, factoryData.count), math.max(1, factoryData.count / 32)),
                        zombieSpacing = new float2(4.0f, 4.0f),
                        formationType = HordeFormationType.Grid
                    });
                    ECB.AddComponent(chunkIndex, hordeEntity, new ZombieHordeTarget { position = factoryData.instantiatePos });

                    // Spread out horde centers across the map instead of clustering at spawn point
                    float2 hordeOffset = new float2((factoryData.wavesSpawned % 4 - 1.5f) * 150f, (factoryData.wavesSpawned / 4) * 150f);
                    float3 hordeCenter = new float3(factoryData.instantiatePos.x + hordeOffset.x, factoryData.instantiatePos.y + hordeOffset.y, 1f);
                    ECB.AddComponent(chunkIndex, hordeEntity, ZombieHordeCenter.CreateDefault(hordeCenter));
                    var zombieBuffer = ECB.AddBuffer<ZombieLink>(chunkIndex, hordeEntity);

                    // Create individual zombies
                    var instanceEntities = new NativeArray<Entity>(factoryData.count, Allocator.Temp);
                    ECB.Instantiate(chunkIndex, factoryData.prefab, instanceEntities);

                    // Create random number generator for position offsets
                    var random = new Unity.Mathematics.Random((uint)(factoryData.prefab.Index * 1000 + chunkIndex + 1));

                    for (int j = 0; j < instanceEntities.Length; j++)
                    {
                        // Formation position for massive hordes - 32 wide formations with better spacing
                        int2 gridPos = new int2(j % 32, j / 32);
                        float2 formationOffset = new float2(gridPos.x * 4.0f - 62f, gridPos.y * 4.0f);

                        var position = new Unity.Mathematics.float3(
                            hordeCenter.x + formationOffset.x,
                            hordeCenter.y + formationOffset.y,
                            1
                        );

                        ECB.SetComponent(chunkIndex, instanceEntities[j], LocalTransform.FromPosition(position));

                        // Give each zombie a unique movement direction
                        float2 uniqueDirection = random.NextFloat2Direction();
                        ECB.AddComponent(chunkIndex, instanceEntities[j], new ZombieDirection { value = uniqueDirection });

                        // Link zombie to horde
                        zombieBuffer.Add(new ZombieLink { zombie = instanceEntities[j] });

                    }

                    instanceEntities.Dispose();
                }
            }
        }

        [BurstCompile]
        public void OnCreate(ref SystemState state)
        {
            state.RequireForUpdate<EndSimulationEntityCommandBufferSystem.Singleton>();
        }

        [BurstCompile]
        public void OnDestroy(ref SystemState state)
        {
            // Complete any pending jobs to prevent memory leaks
            state.CompleteDependency();
        }

        [BurstCompile]
        public void OnUpdate(ref SystemState state)
        {
            var productionJob = new ProductionJob
            {
                DeltaTime = SystemAPI.Time.DeltaTime,
                ECB = SystemAPI.GetSingleton<EndSimulationEntityCommandBufferSystem.Singleton>()
                    .CreateCommandBuffer(state.WorldUnmanaged)
                    .AsParallelWriter()
            };

            state.Dependency = productionJob.ScheduleParallel(state.Dependency);
        }
    }
}