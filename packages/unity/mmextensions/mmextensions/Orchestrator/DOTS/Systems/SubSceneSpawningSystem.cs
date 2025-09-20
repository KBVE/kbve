using Unity.Entities;
using Unity.Mathematics;
using Unity.Collections;
using Unity.Burst;
using Unity.Transforms;
using UnityEngine;
using NSprites;

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
            // Query for zombie prefabs (baked entities with MinionData - no Prefab component needed)
            _zombiePrefabQuery = SystemAPI.QueryBuilder()
                .WithAll<MinionData>()
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

            // Debug: Count entities (only log once at start)
            var totalEntities = _zombiePrefabQuery.CalculateEntityCount();
            var spawnerCount = _spawnerQuery.CalculateEntityCount();

            if (elapsedTime > 2f && elapsedTime < 2.1f) // Log only once after 2 seconds
            {
                UnityEngine.Debug.Log($"[SubSceneSpawningSystem] System active - {totalEntities} MinionData entities, {spawnerCount} spawner entities");
            }

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
                UnityEngine.Debug.Log("[SubSceneSpawningSystem] Initialized spawner");
            }

            // Handle initial spawn
            if (spawner.spawnOnStart && !timer.hasSpawnedInitial && elapsedTime >= spawner.initialDelay)
            {
                SpawnWave(ref state, ref spawner, zombiePrefab, GetSpawnCenter(ref spawner));
                timer.hasSpawnedInitial = true;
                timer.lastSpawnTime = elapsedTime;
                timer.wavesSpawned++;
                UnityEngine.Debug.Log("[SubSceneSpawningSystem] Spawned initial wave");
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
                UnityEngine.Debug.Log($"[SubSceneSpawningSystem] Spawned wave {timer.wavesSpawned}");
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

                // Instantiate the baked zombie prefab
                var zombieEntity = entityManager.Instantiate(zombiePrefab);

                // Set position
                entityManager.SetComponentData(zombieEntity, new LocalTransform
                {
                    Position = spawnPosition,
                    Rotation = quaternion.identity,
                    Scale = 1f
                });

                // Update faction if needed
                if (entityManager.HasComponent<MinionData>(zombieEntity))
                {
                    var minionData = entityManager.GetComponentData<MinionData>(zombieEntity);
                    minionData.Faction = spawner.spawnFaction;
                    entityManager.SetComponentData(zombieEntity, minionData);
                }

                // Remove Prefab component so it becomes a runtime entity
                if (entityManager.HasComponent<Prefab>(zombieEntity))
                {
                    entityManager.RemoveComponent<Prefab>(zombieEntity);
                }

                // Debug what components this entity has
                var componentTypes = entityManager.GetComponentTypes(zombieEntity, Unity.Collections.Allocator.Temp);
                UnityEngine.Debug.Log($"[SubSceneSpawningSystem] Spawned zombie {zombieEntity} at {spawnPosition} with {componentTypes.Length} components");

                // List some key components
                bool hasTransform = entityManager.HasComponent<LocalTransform>(zombieEntity);
                bool hasMinionData = entityManager.HasComponent<MinionData>(zombieEntity);
                bool hasLocalToWorld = entityManager.HasComponent<LocalToWorld>(zombieEntity);

                // Check for NSprites rendering components
                bool hasSpriteRenderID = entityManager.HasComponent<NSprites.SpriteRenderID>(zombieEntity);
                bool hasUVAtlas = entityManager.HasComponent<NSprites.UVAtlas>(zombieEntity);
                bool hasScale2D = entityManager.HasComponent<NSprites.Scale2D>(zombieEntity);

                UnityEngine.Debug.Log($"[SubSceneSpawningSystem] Entity has - Transform: {hasTransform}, MinionData: {hasMinionData}, LocalToWorld: {hasLocalToWorld}");
                UnityEngine.Debug.Log($"[SubSceneSpawningSystem] NSprites components - SpriteRenderID: {hasSpriteRenderID}, UVAtlas: {hasUVAtlas}, Scale2D: {hasScale2D}");

                componentTypes.Dispose();
            }
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