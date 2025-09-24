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
                        formation = new int2(math.min(32, factoryData.count), math.max(1, factoryData.count / 32)),
                        spacing = 1.2f
                    });
                    ECB.AddComponent(chunkIndex, hordeEntity, new ZombieHordeTarget { position = factoryData.instantiatePos });
                    var zombieBuffer = ECB.AddBuffer<ZombieLink>(chunkIndex, hordeEntity);

                    // Create individual zombies
                    var instanceEntities = new NativeArray<Entity>(factoryData.count, Allocator.Temp);
                    ECB.Instantiate(chunkIndex, factoryData.prefab, instanceEntities);

                    // Create random number generator for position offsets
                    var random = new Unity.Mathematics.Random((uint)(factoryData.prefab.Index * 1000 + chunkIndex + 1));

                    for (int i = 0; i < instanceEntities.Length; i++)
                    {
                        // Formation position for massive hordes - 32 wide formations
                        int2 gridPos = new int2(i % 32, i / 32);
                        float2 formationOffset = new float2(gridPos.x * 1.2f - 18.6f, gridPos.y * 1.2f);

                        var position = new Unity.Mathematics.float3(
                            factoryData.instantiatePos.x + formationOffset.x,
                            factoryData.instantiatePos.y + formationOffset.y,
                            1
                        );

                        ECB.SetComponent(chunkIndex, instanceEntities[i], LocalTransform.FromPosition(position));

                        // Give each zombie a unique movement direction
                        float2 uniqueDirection = random.NextFloat2Direction();
                        ECB.AddComponent(chunkIndex, instanceEntities[i], new ZombieDirection { value = uniqueDirection });

                        // Link zombie to horde
                        zombieBuffer.Add(new ZombieLink { zombie = instanceEntities[i] });

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