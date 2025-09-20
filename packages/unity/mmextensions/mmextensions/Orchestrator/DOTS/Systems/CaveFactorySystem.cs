using Unity.Entities;
using Unity.Mathematics;
using Unity.Collections;
using Unity.Burst;
using Unity.Transforms;
using UnityEngine;

namespace KBVE.MMExtensions.Orchestrator.DOTS.Systems
{
    /// <summary>
    /// Cave factory system for spawning zombies from cave entities
    /// Based on Age-of-Sprites FactorySystem pattern but specialized for caves
    /// </summary>
    [UpdateInGroup(typeof(SimulationSystemGroup))]
    [BurstCompile]
    public partial struct CaveFactorySystem : ISystem
    {
        private EntityQuery _caveQuery;

        [BurstCompile]
        public void OnCreate(ref SystemState state)
        {
            // Query for cave spawners
            _caveQuery = SystemAPI.QueryBuilder()
                .WithAll<FactoryData, FactoryTimer, CaveSpawnerTag, CaveSpawnerConfig>()
                .Build();

            // Require caves to exist
            state.RequireForUpdate(_caveQuery);
        }

        [BurstCompile]
        public void OnUpdate(ref SystemState state)
        {
            var deltaTime = SystemAPI.Time.DeltaTime;
            var elapsedTime = (float)SystemAPI.Time.ElapsedTime;
            var entityManager = state.EntityManager;

            foreach (var (factoryData, factoryTimer, caveConfig, entity) in
                SystemAPI.Query<RefRO<FactoryData>, RefRW<FactoryTimer>, RefRO<CaveSpawnerConfig>>()
                .WithAll<CaveSpawnerTag>()
                .WithEntityAccess())
            {
                ProcessCaveSpawner(ref state, entity, factoryData.ValueRO, ref factoryTimer.ValueRW,
                    caveConfig.ValueRO, deltaTime, elapsedTime);
            }
        }

        [BurstCompile]
        private void ProcessCaveSpawner(ref SystemState state, Entity caveEntity,
            in FactoryData factoryData, ref FactoryTimer factoryTimer,
            in CaveSpawnerConfig caveConfig, float deltaTime, float elapsedTime)
        {
            // Update timer
            factoryTimer.value -= deltaTime;

            // Check if it's time to spawn
            if (factoryTimer.value <= 0f)
            {
                SpawnZombiesFromCave(ref state, caveEntity, factoryData, caveConfig);

                // Reset timer
                factoryTimer.value = factoryData.duration;
            }
        }

        [BurstCompile]
        private void SpawnZombiesFromCave(ref SystemState state, Entity caveEntity,
            in FactoryData factoryData, in CaveSpawnerConfig caveConfig)
        {
            var entityManager = state.EntityManager;
            var random = new Unity.Mathematics.Random((uint)(SystemAPI.Time.ElapsedTime * 1000) + (uint)caveEntity.Index + 1);

            UnityEngine.Debug.Log($"[CaveFactory] Cave {caveEntity.Index} spawning {factoryData.count} zombies");

            // Batch instantiation following Age-of-Sprites pattern
            var zombieEntities = new NativeArray<Entity>(factoryData.count, Allocator.Temp);
            entityManager.Instantiate(factoryData.prefab, zombieEntities);

            float3 caveCenter = new float3(factoryData.instantiatePos.x, 0, factoryData.instantiatePos.y);

            for (int i = 0; i < factoryData.count; i++)
            {
                var zombieEntity = zombieEntities[i];

                // Calculate spawn position around cave
                float3 spawnPosition = CalculateSpawnPosition(caveCenter, caveConfig, ref random, i, factoryData.count);

                // Set transform
                entityManager.SetComponentData(zombieEntity, new LocalTransform
                {
                    Position = spawnPosition,
                    Rotation = quaternion.identity,
                    Scale = 1f
                });

                // Set LocalToWorld for rendering
                entityManager.SetComponentData(zombieEntity, new LocalToWorld
                {
                    Value = float4x4.TRS(spawnPosition, quaternion.identity, new float3(1f))
                });

                // Set WorldPosition2D for 2D sprite rendering
                if (entityManager.HasComponent<WorldPosition2D>(zombieEntity))
                {
                    entityManager.SetComponentData(zombieEntity, new WorldPosition2D
                    {
                        Value = new float2(spawnPosition.x, spawnPosition.z)
                    });
                }
                else
                {
                    entityManager.AddComponentData(zombieEntity, new WorldPosition2D
                    {
                        Value = new float2(spawnPosition.x, spawnPosition.z)
                    });
                }

                // Update faction and assign unique instance ID
                if (entityManager.HasComponent<MinionData>(zombieEntity))
                {
                    var minionData = entityManager.GetComponentData<MinionData>(zombieEntity);
                    minionData.InstanceID = caveEntity.Index * 1000 + i; // Unique ID based on cave and spawn index
                    entityManager.SetComponentData(zombieEntity, minionData);
                }

                // Remove Prefab component so it becomes a runtime entity
                if (entityManager.HasComponent<Prefab>(zombieEntity))
                {
                    entityManager.RemoveComponent<Prefab>(zombieEntity);
                }

                UnityEngine.Debug.Log($"[CaveFactory] Spawned zombie {i+1}/{factoryData.count} from cave {caveEntity.Index} at {spawnPosition}");
            }

            // Dispose the array
            zombieEntities.Dispose();

            UnityEngine.Debug.Log($"[CaveFactory] Cave {caveEntity.Index} completed spawning {factoryData.count} zombies");
        }

        [BurstCompile]
        private float3 CalculateSpawnPosition(float3 caveCenter, in CaveSpawnerConfig config,
            ref Unity.Mathematics.Random random, int index, int totalCount)
        {
            // Use circular pattern with random offset
            float angle = ((float)index / totalCount) * math.PI * 2f;
            float distance = random.NextFloat(config.spawnRadius * 0.5f, config.spawnRadius);

            float3 circularOffset = new float3(
                math.cos(angle) * distance,
                0,
                math.sin(angle) * distance
            );

            // Add random offset to prevent perfect patterns
            float3 randomOffset = new float3(
                random.NextFloat(-config.randomOffset, config.randomOffset),
                0,
                random.NextFloat(-config.randomOffset, config.randomOffset)
            );

            return caveCenter + circularOffset + randomOffset;
        }
    }
}