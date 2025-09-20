using Unity.Entities;
using Unity.Mathematics;
using Unity.Collections;
using Unity.Burst;
using Unity.Transforms;
using UnityEngine;
using KBVE.MMExtensions.Orchestrator.DOTS;

namespace KBVE.MMExtensions.Orchestrator.DOTS.Systems
{
    /// <summary>
    /// SubScene-based spawning system that instantiates baked entity prefabs
    /// Runs entirely in SubScene context to avoid main scene conflicts
    /// </summary>
    [UpdateInGroup(typeof(SimulationSystemGroup))]
    [BurstCompile]
    public partial struct SubSceneSpawningSystem : ISystem
    {
        private EntityQuery _zombiePrefabQuery;
        private EntityQuery _spawnerQuery;

        [BurstCompile]
        public void OnCreate(ref SystemState state)
        {
            // Query for zombie prefabs - entities with MinionData that are prefabs
            // Foundation's SpriteRendererAuthoring will add its own components automatically
            _zombiePrefabQuery = SystemAPI.QueryBuilder()
                .WithAll<MinionData, EntityPrefabComponent>()
                .Build();

            // Query for spawner entities
            _spawnerQuery = SystemAPI.QueryBuilder()
                .WithAll<ZombieWaveSpawner, SpawnTimer>()
                .Build();

            // Don't update if no spawners exist
            state.RequireForUpdate(_spawnerQuery);
        }

        public void OnUpdate(ref SystemState state)
        {
            var deltaTime = SystemAPI.Time.DeltaTime;
            var elapsedTime = (float)SystemAPI.Time.ElapsedTime;


            // Find zombie prefab entity once
            var zombiePrefab = FindZombiePrefab(ref state);
            if (zombiePrefab == Entity.Null)
            {
                return;
            }

            // Process all spawners
            foreach (var (spawner, timer, entity) in
                SystemAPI.Query<RefRW<ZombieWaveSpawner>, RefRW<SpawnTimer>>().WithEntityAccess())
            {
                ProcessSpawner(ref state, entity, ref spawner.ValueRW, ref timer.ValueRW, zombiePrefab, elapsedTime);
            }
        }

        private Entity FindZombiePrefab(ref SystemState state)
        {
            var zombieEntities = _zombiePrefabQuery.ToEntityArray(Allocator.Temp);


            foreach (var entity in zombieEntities)
            {
                if (SystemAPI.HasComponent<MinionData>(entity))
                {
                    var minionData = SystemAPI.GetComponent<MinionData>(entity);
                    if (minionData.Type == MinionType.Tank) // Tank = Zombie
                    {
                        zombieEntities.Dispose();
                        return entity;
                    }
                }
            }

            UnityEngine.Debug.LogWarning("[SubSceneSpawningSystem] No zombie prefab found with Type = Tank!");
            zombieEntities.Dispose();
            return Entity.Null;
        }

        private void ProcessSpawner(ref SystemState state, Entity spawnerEntity,
            ref ZombieWaveSpawner spawner, ref SpawnTimer timer, Entity zombiePrefab, float elapsedTime)
        {
            if (!timer.isInitialized)
            {
                timer.isInitialized = true;
                timer.lastSpawnTime = elapsedTime;
            }

            // Handle initial spawn
            if (spawner.spawnOnStart && !timer.hasSpawnedInitial && elapsedTime >= spawner.initialDelay)
            {
                SpawnWave(ref state, ref spawner, zombiePrefab, GetSpawnCenter(ref spawner));
                timer.hasSpawnedInitial = true;
                timer.lastSpawnTime = elapsedTime;
                timer.wavesSpawned++;
                return;
            }

            // Check if we've reached max waves
            if (spawner.maxWaves > 0 && timer.wavesSpawned >= spawner.maxWaves)
                return;

            // Check if it's time for next wave
            if (elapsedTime - timer.lastSpawnTime >= spawner.spawnInterval)
            {
                SpawnWave(ref state, ref spawner, zombiePrefab, GetSpawnCenter(ref spawner));
                timer.lastSpawnTime = elapsedTime;
                timer.wavesSpawned++;
            }
        }

        [BurstCompile]
        private float3 GetSpawnCenter(ref ZombieWaveSpawner spawner)
        {
            if (spawner.spawnWithinGrid)
            {
                // Use center of grid
                float centerX = (spawner.gridTopLeft.x + spawner.gridBottomRight.x) * 0.5f;
                float centerZ = (spawner.gridTopLeft.y + spawner.gridBottomRight.y) * 0.5f;
                return new float3(centerX, 0, centerZ);
            }
            else
            {
                // Use origin as fallback
                return float3.zero;
            }
        }

        [BurstCompile]
        private void SpawnWave(ref SystemState state, ref ZombieWaveSpawner spawner, Entity zombiePrefab, float3 center)
        {
            var entityManager = state.EntityManager;
            var random = new Unity.Mathematics.Random((uint)(SystemAPI.Time.ElapsedTime * 1000) + 1);

            UnityEngine.Debug.Log($"[SubSceneSpawningSystem] Starting wave spawn - Count: {spawner.zombiesPerWave}, Center: {center}");

            // Batch instantiation following Age-of-Sprites pattern
            var zombieEntities = new NativeArray<Entity>(spawner.zombiesPerWave, Allocator.Temp);
            entityManager.Instantiate(zombiePrefab, zombieEntities);

            for (int i = 0; i < spawner.zombiesPerWave; i++)
            {
                float3 spawnPosition;

                if (spawner.spawnWithinGrid)
                {
                    spawnPosition = GetRandomGridPosition(ref spawner, ref random);
                }
                else
                {
                    // Use circular pattern around center
                    float angle = (float)i / spawner.zombiesPerWave * math.PI * 2f;
                    float3 offset = new float3(
                        math.cos(angle) * spawner.waveRadius,
                        0,
                        math.sin(angle) * spawner.waveRadius
                    );
                    spawnPosition = center + offset;
                }

                // Get the entity from batch
                var zombieEntity = zombieEntities[i];

                // Add random offset to prevent stacking
                float3 randomOffset = new float3(
                    random.NextFloat(-2f, 2f),
                    0f,
                    random.NextFloat(-2f, 2f)
                );
                float3 finalPosition = spawnPosition + randomOffset;

                // Set position with random offset
                entityManager.SetComponentData(zombieEntity, new LocalTransform
                {
                    Position = finalPosition,
                    Rotation = quaternion.identity,
                    Scale = 1f
                });

                // Force LocalToWorld update for NSprites rendering
                if (!entityManager.HasComponent<LocalToWorld>(zombieEntity))
                {
                    UnityEngine.Debug.LogWarning($"[SubSceneSpawningSystem] Entity {zombieEntity.Index} missing LocalToWorld! Adding it.");
                    entityManager.AddComponent<LocalToWorld>(zombieEntity);
                }

                // Update LocalToWorld directly to ensure sprite position
                entityManager.SetComponentData(zombieEntity, new LocalToWorld
                {
                    Value = float4x4.TRS(finalPosition, quaternion.identity, new float3(1f))
                });

                // Add WorldPosition2D for NSprites rendering
                if (!entityManager.HasComponent<WorldPosition2D>(zombieEntity))
                {
                    entityManager.AddComponentData(zombieEntity, new WorldPosition2D
                    {
                        Value = new float2(finalPosition.x, finalPosition.z)
                    });
                }
                else
                {
                    entityManager.SetComponentData(zombieEntity, new WorldPosition2D
                    {
                        Value = new float2(finalPosition.x, finalPosition.z)
                    });
                }

                // Update faction and assign unique instance ID
                if (entityManager.HasComponent<MinionData>(zombieEntity))
                {
                    var minionData = entityManager.GetComponentData<MinionData>(zombieEntity);
                    minionData.Faction = spawner.spawnFaction;
                    minionData.InstanceID = i; // Assign unique ID based on spawn index
                    entityManager.SetComponentData(zombieEntity, minionData);
                }

                // Remove Prefab component so it becomes a runtime entity
                if (entityManager.HasComponent<Prefab>(zombieEntity))
                {
                    entityManager.RemoveComponent<Prefab>(zombieEntity);
                }

                UnityEngine.Debug.Log($"[SubSceneSpawningSystem] Spawned zombie {i+1}/{spawner.zombiesPerWave} at position {finalPosition}, Entity: {zombieEntity.Index}");
            }

            UnityEngine.Debug.Log($"[SubSceneSpawningSystem] Wave spawn complete - Spawned {spawner.zombiesPerWave} zombies");

            // Dispose the NativeArray
            zombieEntities.Dispose();
        }

        [BurstCompile]
        private float3 GetRandomGridPosition(ref ZombieWaveSpawner spawner, ref Unity.Mathematics.Random random)
        {
            var gridMin = new float2(spawner.gridTopLeft.x, spawner.gridBottomRight.y);
            var gridMax = new float2(spawner.gridBottomRight.x, spawner.gridTopLeft.y);

            // Check if we should spawn at edges
            if (spawner.allowEdgeSpawning && random.NextFloat() < spawner.edgeSpawnProbability)
            {
                return GetEdgeSpawnPosition(gridMin, gridMax, ref random);
            }

            // Random position within grid
            float x = random.NextFloat(gridMin.x, gridMax.x);
            float z = random.NextFloat(gridMin.y, gridMax.y);

            return new float3(x, 0, z);
        }

        [BurstCompile]
        private float3 GetEdgeSpawnPosition(float2 gridMin, float2 gridMax, ref Unity.Mathematics.Random random)
        {
            // Choose random edge: 0=top, 1=right, 2=bottom, 3=left
            int edge = random.NextInt(0, 4);

            return edge switch
            {
                0 => new float3(random.NextFloat(gridMin.x, gridMax.x), 0, gridMax.y), // Top edge
                1 => new float3(gridMax.x, 0, random.NextFloat(gridMin.y, gridMax.y)), // Right edge
                2 => new float3(random.NextFloat(gridMin.x, gridMax.x), 0, gridMin.y), // Bottom edge
                3 => new float3(gridMin.x, 0, random.NextFloat(gridMin.y, gridMax.y)), // Left edge
                _ => new float3(gridMin.x + (gridMax.x - gridMin.x) * 0.5f, 0, gridMin.y + (gridMax.y - gridMin.y) * 0.5f) // Center fallback
            };
        }
    }
}