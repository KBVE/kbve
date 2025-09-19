using Unity.Entities;
using Unity.Mathematics;
using Unity.Collections;
using Unity.Burst;
using Unity.Jobs;
using Unity.Transforms;
using UnityEngine;

namespace KBVE.MMExtensions.Orchestrator.DOTS
{
    /// <summary>
    /// System responsible for bulk spawning of minions
    /// Optimized for spawning hundreds to thousands of entities efficiently
    /// </summary>
    [UpdateInGroup(typeof(SimulationSystemGroup))]
    [UpdateBefore(typeof(TransformSystemGroup))]
    public partial class MinionSpawningSystem : SystemBase
    {
        private EntityCommandBufferSystem _ecbSystem;
        private EntityArchetype _minionArchetype;
        private int _currentGroupId;

        protected override void OnCreate()
        {
            _ecbSystem = World.GetOrCreateSystemManaged<BeginSimulationEntityCommandBufferSystem>();

            // Create minion archetype for efficient spawning with 2D sprite rendering
            _minionArchetype = EntityManager.CreateArchetype(
                typeof(MinionData),
                typeof(SpatialPosition),
                typeof(LocalTransform),
                typeof(LocalToWorld),
                // 2D Sprite rendering components
                typeof(Sprite2DRenderer),
                typeof(SpriteRenderTag)
            );

            _currentGroupId = 0;
        }

        protected override void OnUpdate()
        {
            var ecb = _ecbSystem.CreateCommandBuffer().AsParallelWriter();
            var archetype = _minionArchetype;
            var deltaTime = SystemAPI.Time.DeltaTime;

            // Process bulk spawn requests
            Entities
                .WithName("ProcessBulkSpawns")
                .ForEach((Entity spawnerEntity, int entityInQueryIndex,
                    ref BulkSpawnConfig config, ref DynamicBuffer<SpawnedMinionBuffer> spawnedBuffer) =>
                {
                    if (config.TotalCount <= 0) return;

                    int toSpawn = math.min(config.BatchSize, config.TotalCount);
                    toSpawn = math.min(toSpawn, config.MaxPerFrame);

                    // Calculate spawn positions based on pattern
                    var positions = new NativeArray<float3>(toSpawn, Allocator.Temp);
                    CalculateSpawnPositions(
                        in config.SpawnCenter,
                        config.SpawnRadius,
                        toSpawn,
                        config.Pattern,
                        positions
                    );

                    // Spawn minions in batch
                    for (int i = 0; i < toSpawn; i++)
                    {
                        var minion = ecb.CreateEntity(entityInQueryIndex, archetype);

                        // Set minion data
                        ecb.SetComponent(entityInQueryIndex, minion, new MinionData
                        {
                            Health = GetHealthForType(config.MinionType),
                            MaxHealth = GetHealthForType(config.MinionType),
                            Speed = GetSpeedForType(config.MinionType),
                            AttackDamage = GetDamageForType(config.MinionType),
                            AttackRange = 2f,
                            DetectionRange = 10f,
                            Faction = config.Faction,
                            Type = config.MinionType,
                            Level = 1,
                            StateFlags = MinionStateFlags.None
                        });

                        // Set position
                        ecb.SetComponent(entityInQueryIndex, minion, new LocalTransform
                        {
                            Position = positions[i],
                            Rotation = quaternion.identity,
                            Scale = 1f
                        });

                        ecb.SetComponent(entityInQueryIndex, minion,
                            SpatialPosition.Create(positions[i]));

                        // Set sprite rendering data
                        ecb.SetComponent(entityInQueryIndex, minion, new Sprite2DRenderer
                        {
                            SpriteID = GetSpriteIDForType(config.MinionType),
                            Size = new float2(1f, 1f),
                            Color = new float4(1f, 1f, 1f, 1f),
                            SortingLayer = 0,
                            SortingOrder = 0,
                            FlipX = false,
                            FlipY = false
                        });

                        // Track spawned entity
                        spawnedBuffer.Add(new SpawnedMinionBuffer
                        {
                            MinionEntity = minion,
                            SpawnTime = (float)SystemAPI.Time.ElapsedTime
                        });
                    }

                    config.TotalCount -= toSpawn;

                    // Remove spawner when done
                    if (config.TotalCount <= 0)
                    {
                        ecb.RemoveComponent<BulkSpawnConfig>(entityInQueryIndex, spawnerEntity);
                    }
                })
                .ScheduleParallel();

            // Process individual spawn requests
            Entities
                .WithName("ProcessIndividualSpawns")
                .WithAll<SpawnRequest>()
                .ForEach((Entity requestEntity, int entityInQueryIndex, in SpawnRequest request) =>
                {
                    var minion = ecb.CreateEntity(entityInQueryIndex, archetype);

                    ecb.SetComponent(entityInQueryIndex, minion, new MinionData
                    {
                        Health = GetHealthForType(request.Type) * request.HealthMultiplier,
                        MaxHealth = GetHealthForType(request.Type) * request.HealthMultiplier,
                        Speed = GetSpeedForType(request.Type) * request.SpeedMultiplier,
                        AttackDamage = GetDamageForType(request.Type) * request.DamageMultiplier,
                        AttackRange = 2f,
                        DetectionRange = 10f,
                        Faction = request.Faction,
                        Type = request.Type,
                        Level = request.Level,
                        StateFlags = MinionStateFlags.None
                    });

                    ecb.SetComponent(entityInQueryIndex, minion, new LocalTransform
                    {
                        Position = request.Position,
                        Rotation = request.Rotation,
                        Scale = 1f
                    });

                    ecb.SetComponent(entityInQueryIndex, minion,
                        SpatialPosition.Create(request.Position));

                    // Set sprite rendering data
                    ecb.SetComponent(entityInQueryIndex, minion, new Sprite2DRenderer
                    {
                        SpriteID = GetSpriteIDForType(request.Type),
                        Size = new float2(1f, 1f),
                        Color = new float4(1f, 1f, 1f, 1f),
                        SortingLayer = 0,
                        SortingOrder = 0,
                        FlipX = false,
                        FlipY = false
                    });

                    // Destroy the request
                    ecb.DestroyEntity(entityInQueryIndex, requestEntity);
                })
                .ScheduleParallel();

            _ecbSystem.AddJobHandleForProducer(Dependency);
        }

        private static void CalculateSpawnPositions(
            in float3 center, float radius, int count, SpawnPattern pattern, NativeArray<float3> positions)
        {
            switch (pattern)
            {
                case SpawnPattern.Circle:
                    for (int i = 0; i < count; i++)
                    {
                        float angle = (i / (float)count) * math.PI * 2f;
                        positions[i] = center + new float3(
                            math.cos(angle) * radius,
                            0,
                            math.sin(angle) * radius
                        );
                    }
                    break;

                case SpawnPattern.Grid:
                    int gridSize = (int)math.ceil(math.sqrt(count));
                    float spacing = (radius * 2) / gridSize;
                    for (int i = 0; i < count; i++)
                    {
                        int x = i % gridSize;
                        int z = i / gridSize;
                        positions[i] = center + new float3(
                            (x - gridSize / 2f) * spacing,
                            0,
                            (z - gridSize / 2f) * spacing
                        );
                    }
                    break;

                case SpawnPattern.Spiral:
                    for (int i = 0; i < count; i++)
                    {
                        float angle = i * 0.5f;
                        float distance = (i / (float)count) * radius;
                        positions[i] = center + new float3(
                            math.cos(angle) * distance,
                            0,
                            math.sin(angle) * distance
                        );
                    }
                    break;

                default: // Random
                    var random = new Unity.Mathematics.Random((uint)count + 1);
                    for (int i = 0; i < count; i++)
                    {
                        float2 randomPoint = random.NextFloat2Direction() * random.NextFloat(0, radius);
                        positions[i] = center + new float3(randomPoint.x, 0, randomPoint.y);
                    }
                    break;
            }
        }

        // Helper method to get sprite ID for minion type
        [BurstCompile]
        private static int GetSpriteIDForType(MinionType type)
        {
            // Map minion types to sprite IDs
            // These would correspond to sprite indices in your sprite atlas
            switch (type)
            {
                case MinionType.Tank: // Zombie
                    return 0;
                case MinionType.Fast:
                    return 1;
                case MinionType.Ranged:
                    return 2;
                case MinionType.Flying:
                    return 3;
                case MinionType.Boss:
                    return 4;
                default:
                    return 0; // Default sprite
            }
        }

        private static float GetHealthForType(MinionType type)
        {
            // Replace switch expression with traditional switch statement for Burst compatibility
            switch (type)
            {
                case MinionType.Tank:
                    return 200f;
                case MinionType.Boss:
                    return 500f;
                case MinionType.Fast:
                    return 50f;
                default:
                    return 100f;
            }
        }

        private static float GetSpeedForType(MinionType type)
        {
            // Replace switch expression with traditional switch statement for Burst compatibility
            switch (type)
            {
                case MinionType.Fast:
                    return 8f;
                case MinionType.Flying:
                    return 6f;
                case MinionType.Tank:
                    return 2f;
                default:
                    return 4f;
            }
        }

        private static float GetDamageForType(MinionType type)
        {
            // Replace switch expression with traditional switch statement for Burst compatibility
            switch (type)
            {
                case MinionType.Boss:
                    return 50f;
                case MinionType.Tank:
                    return 20f;
                case MinionType.Ranged:
                    return 15f;
                default:
                    return 10f;
            }
        }
    }

    /// <summary>
    /// Helper system to create bulk spawn requests
    /// </summary>
    public partial class MinionSpawnRequestSystem : SystemBase
    {
        private EntityCommandBufferSystem _ecbSystem;
        private MinionPrefabManager _prefabManager;

        protected override void OnCreate()
        {
            _ecbSystem = World.GetOrCreateSystemManaged<EndSimulationEntityCommandBufferSystem>();
        }

        protected override void OnStartRunning()
        {
            // Get reference to the prefab manager
            _prefabManager = MinionPrefabManager.Instance;
        }

        public Entity RequestBulkSpawn(in float3 position, int count, MinionType type, FactionType faction)
        {
            var ecb = _ecbSystem.CreateCommandBuffer();
            var spawner = ecb.CreateEntity();

            ecb.AddComponent(spawner, BulkSpawnConfig.CreateDefault(position, count));
            ecb.AddBuffer<SpawnedMinionBuffer>(spawner);

            return spawner;
        }

        public void RequestSingleSpawn(in float3 position, MinionType type, FactionType faction)
        {
            var ecb = _ecbSystem.CreateCommandBuffer();
            var request = ecb.CreateEntity();

            ecb.AddComponent(request, new SpawnRequest
            {
                Position = position,
                Rotation = quaternion.identity,
                Type = type,
                Faction = faction,
                Level = 1,
                HealthMultiplier = 1f,
                SpeedMultiplier = 1f,
                DamageMultiplier = 1f,
                SpawnerEntity = Entity.Null
            });
        }

        /// <summary>
        /// Request spawn with entity prefab support
        /// </summary>
        public async void RequestPrefabSpawn(float3 position, MinionType type, FactionType faction)
        {
            if (_prefabManager != null && _prefabManager.IsPrefabLoaded(type))
            {
                // Use prefab manager for spawning
                await _prefabManager.SpawnMinionAsync(type, position, faction);
            }
            else
            {
                // Fallback to archetype spawning
                RequestSingleSpawn(position, type, faction);
            }
        }

        protected override void OnUpdate()
        {
            // Process spawn requests with loaded prefabs if available
            var ecb = _ecbSystem.CreateCommandBuffer().AsParallelWriter();

            Entities
                .WithName("ProcessSpawnRequestsWithPrefabs")
                .ForEach((Entity entity, int entityInQueryIndex, in SpawnRequest request) =>
                {
                    // Check if we should use prefab spawning
                    // For now, we'll use the archetype system and let the prefab manager handle visual instantiation

                    // Remove the request entity after processing
                    ecb.DestroyEntity(entityInQueryIndex, entity);
                })
                .ScheduleParallel();

            _ecbSystem.AddJobHandleForProducer(Dependency);
        }
    }
}