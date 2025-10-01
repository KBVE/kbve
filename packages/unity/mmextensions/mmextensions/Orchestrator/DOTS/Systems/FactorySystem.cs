using Unity.Burst;
using Unity.Collections;
using Unity.Entities;
using Unity.Transforms;
using Unity.Mathematics;

/// DOTS v2 - PREPARING

namespace KBVE.MMExtensions.Orchestrator.DOTS.Systems
{
    /// <summary>
    /// Factory system for spawning entities , preparing for DOTS v2
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
            [ReadOnly] public ComponentLookup<HordeSpawnPoint> SpawnPointLookup;
            [ReadOnly] public NativeArray<Entity> AvailableSpawnPoints;

            private void Execute([ChunkIndexInQuery] int chunkIndex, ref FactoryTimer timer, ref FactoryData factoryData)
            {
                timer.value -= DeltaTime;

                if (timer.value <= 0 && factoryData.wavesSpawned < factoryData.maxWaves)
                {
                    timer.value += factoryData.duration;
                    factoryData.wavesSpawned++;

                    // Get spawn point from available spawn points
                    float3 hordeCenter;
                    float patrolRadius = 150f;

                    if (AvailableSpawnPoints.Length > 0)
                    {
                        // Use predefined spawn point
                        int spawnIndex = factoryData.wavesSpawned % AvailableSpawnPoints.Length;
                        var spawnEntity = AvailableSpawnPoints[spawnIndex];

                        if (SpawnPointLookup.TryGetComponent(spawnEntity, out var spawnPoint))
                        {
                            hordeCenter = spawnPoint.position;
                            patrolRadius = spawnPoint.patrolRadius;
                        }
                        else
                        {
                            // Fallback if spawn point not found
                            float2 hordeOffset = new float2((factoryData.wavesSpawned % 20 - 9.5f) * 250f, (factoryData.wavesSpawned / 20) * 250f);
                            hordeCenter = new float3(factoryData.instantiatePos.x + hordeOffset.x, factoryData.instantiatePos.y + hordeOffset.y, 1f);
                        }
                    }
                    else
                    {
                        // Fallback pattern if no spawn points defined
                        float2 hordeOffset = new float2((factoryData.wavesSpawned % 20 - 9.5f) * 250f, (factoryData.wavesSpawned / 20) * 250f);
                        hordeCenter = new float3(factoryData.instantiatePos.x + hordeOffset.x, factoryData.instantiatePos.y + hordeOffset.y, 1f);
                    }

                    // Create formation entity (Grid formation = traditional horde)
                    var formationEntity = ECB.CreateEntity(chunkIndex);
                    ECB.AddComponent(chunkIndex, formationEntity, new ZombieFormationEntity { formationType = HordeFormationType.Grid });
                    ECB.AddComponent(chunkIndex, formationEntity, new ZombieFormationSettings
                    {
                        formationSize = new int2(math.min(32, factoryData.count), math.max(1, factoryData.count / 32)),
                        zombieSpacing = new float2(2.5f, 2.5f),
                        formationType = HordeFormationType.Grid
                    });
                    ECB.AddComponent(chunkIndex, formationEntity, ZombieFormationCenter.CreateDefault(hordeCenter));
                    var zombieBuffer = ECB.AddBuffer<FormationMemberLink>(chunkIndex, formationEntity);

                    // Create individual zombies
                    var instanceEntities = new NativeArray<Entity>(factoryData.count, Allocator.Temp);
                    ECB.Instantiate(chunkIndex, factoryData.prefab, instanceEntities);

                    // Create random number generator for position offsets
                    var random = new Unity.Mathematics.Random((uint)(factoryData.prefab.Index * 1000 + chunkIndex + 1));

                    for (int j = 0; j < instanceEntities.Length; j++)
                    {
                        // Formation position for massive hordes - 32 wide formations with compact spacing
                        int2 gridPos = new int2(j % 32, j / 32);
                        float2 formationOffset = new float2(gridPos.x * 2.5f - 38.75f, gridPos.y * 2.5f);

                        var position = new Unity.Mathematics.float3(
                            hordeCenter.x + formationOffset.x,
                            hordeCenter.y + formationOffset.y,
                            1
                        );

                        ECB.SetComponent(chunkIndex, instanceEntities[j], LocalTransform.FromPosition(position));

                        // Link zombie to formation
                        zombieBuffer.Add(new FormationMemberLink { zombie = instanceEntities[j] });

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
            // Get available spawn points
            var spawnPointQuery = SystemAPI.QueryBuilder()
                .WithAll<HordeSpawnPoint>()
                .Build();

            var spawnPoints = spawnPointQuery.ToEntityArray(Allocator.TempJob);

            var productionJob = new ProductionJob
            {
                DeltaTime = SystemAPI.Time.DeltaTime,
                ECB = SystemAPI.GetSingleton<EndSimulationEntityCommandBufferSystem.Singleton>()
                    .CreateCommandBuffer(state.WorldUnmanaged)
                    .AsParallelWriter(),
                SpawnPointLookup = SystemAPI.GetComponentLookup<HordeSpawnPoint>(true),
                AvailableSpawnPoints = spawnPoints
            };

            state.Dependency = productionJob.ScheduleParallelByRef(state.Dependency);
            spawnPoints.Dispose(state.Dependency);
        }
    }
}