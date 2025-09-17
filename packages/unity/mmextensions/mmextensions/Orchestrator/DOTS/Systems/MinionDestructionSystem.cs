using Unity.Entities;
using Unity.Mathematics;
using Unity.Collections;
using Unity.Burst;
using Unity.Transforms;
using UnityEngine;
using System;

namespace KBVE.MMExtensions.Orchestrator.DOTS
{
    /// <summary>
    /// Handles destruction and cleanup of minions
    /// Includes death animation triggers and pooling
    /// </summary>
    [UpdateInGroup(typeof(SimulationSystemGroup))]
    [UpdateAfter(typeof(MinionBehaviorSystem))]
    public partial class MinionDestructionSystem : SystemBase
    {
        private EntityCommandBufferSystem _ecbSystem;
        private EntityQuery _deadMinionsQuery;
        private EntityQuery _expiredMinionsQuery;

        protected override void OnCreate()
        {
            _ecbSystem = World.GetOrCreateSystemManaged<EndSimulationEntityCommandBufferSystem>();

            // Query for dead minions
            _deadMinionsQuery = GetEntityQuery(
                ComponentType.ReadWrite<MinionData>(),
                ComponentType.ReadOnly<SpatialPosition>()
            );

            // Query for minions with lifetime component
            _expiredMinionsQuery = GetEntityQuery(
                ComponentType.ReadOnly<MinionLifetime>(),
                ComponentType.ReadOnly<MinionData>()
            );
        }

        protected override void OnUpdate()
        {
            var ecb = _ecbSystem.CreateCommandBuffer().AsParallelWriter();
            float deltaTime = SystemAPI.Time.DeltaTime;
            float currentTime = (float)SystemAPI.Time.ElapsedTime;

            // Process dead minions
            Entities
                .WithName("ProcessDeadMinions")
                .ForEach((Entity entity, int entityInQueryIndex, ref MinionData minion) =>
                {
                    if (minion.Health <= 0 && (minion.StateFlags & MinionStateFlags.Dead) == 0)
                    {
                        // Mark as dead
                        minion.StateFlags |= MinionStateFlags.Dead;

                        // Add death timer component for delayed destruction
                        ecb.AddComponent(entityInQueryIndex, entity, new DeathTimer
                        {
                            DeathTime = currentTime,
                            Duration = 2f // 2 seconds for death animation
                        });

                        // Optional: Spawn death particles or loot
                        if (ShouldDropLoot(minion.Type, minion.Level))
                        {
                            ecb.AddComponent(entityInQueryIndex, entity, new LootDropRequest
                            {
                                DropChance = GetLootDropChance(minion.Type),
                                LootTier = minion.Level
                            });
                        }
                    }
                })
                .ScheduleParallel();

            // Process minions with lifetime limits
            Entities
                .WithName("ProcessExpiredMinions")
                .ForEach((Entity entity, int entityInQueryIndex,
                    in MinionLifetime lifetime) =>
                {
                    if (currentTime >= lifetime.SpawnTime + lifetime.MaxLifetime)
                    {
                        ecb.DestroyEntity(entityInQueryIndex, entity);
                    }
                })
                .ScheduleParallel();

            // Clean up dead minions after death animation
            Entities
                .WithName("CleanupDeadMinions")
                .WithAll<DeathTimer>()
                .ForEach((Entity entity, int entityInQueryIndex,
                    in DeathTimer deathTimer) =>
                {
                    if (currentTime >= deathTimer.DeathTime + deathTimer.Duration)
                    {
                        ecb.DestroyEntity(entityInQueryIndex, entity);
                    }
                })
                .ScheduleParallel();

            // Process minions that fell out of world
            Entities
                .WithName("ProcessOutOfBoundsMinions")
                .ForEach((Entity entity, int entityInQueryIndex,
                    in LocalTransform transform,
                    in MinionData minion) =>
                {
                    // Destroy if fallen below kill plane
                    if (transform.Position.y < -100f)
                    {
                        ecb.DestroyEntity(entityInQueryIndex, entity);
                    }

                    // Destroy if too far from origin (cleanup stragglers)
                    float distanceSq = math.lengthsq(transform.Position);
                    if (distanceSq > 500f * 500f) // 500 unit radius
                    {
                        ecb.DestroyEntity(entityInQueryIndex, entity);
                    }
                })
                .ScheduleParallel();

            _ecbSystem.AddJobHandleForProducer(Dependency);
        }

        private static bool ShouldDropLoot(MinionType type, int level)
        {
            // Boss always drops loot
            if (type == MinionType.Boss) return true;

            // Higher level minions have better drop chance
            float dropChance = 0.1f + (level * 0.05f);
            return UnityEngine.Random.value < dropChance;
        }

        private static float GetLootDropChance(MinionType type) => type switch
        {
            MinionType.Boss => 1.0f,
            MinionType.Tank => 0.3f,
            MinionType.Ranged => 0.2f,
            _ => 0.1f
        };
    }

    /// <summary>
    /// Component for minions with limited lifetime
    /// </summary>
    public struct MinionLifetime : IComponentData
    {
        public float SpawnTime;
        public float MaxLifetime;
    }

    /// <summary>
    /// Timer for death animation before destruction
    /// </summary>
    public struct DeathTimer : IComponentData
    {
        public float DeathTime;
        public float Duration;
    }

    /// <summary>
    /// Request to drop loot on death
    /// </summary>
    public struct LootDropRequest : IComponentData
    {
        public float DropChance;
        public int LootTier;
    }

    /// <summary>
    /// System for batch destruction operations
    /// </summary>
    public partial class MinionBatchDestructionSystem : SystemBase
    {
        private EntityCommandBufferSystem _ecbSystem;

        protected override void OnCreate()
        {
            _ecbSystem = World.GetOrCreateSystemManaged<BeginSimulationEntityCommandBufferSystem>();
        }

        /// <summary>
        /// Destroy all minions of a specific faction
        /// </summary>
        public void DestroyFaction(FactionType faction)
        {
            var ecb = _ecbSystem.CreateCommandBuffer();

            Entities
                .WithAll<MinionData>()
                .ForEach((Entity entity, in MinionData minion) =>
                {
                    if (minion.Faction == faction)
                    {
                        ecb.DestroyEntity(entity);
                    }
                })
                .Run();
        }

        /// <summary>
        /// Destroy all minions within a radius
        /// </summary>
        public void DestroyInRadius(float3 center, float radius)
        {
            var ecb = _ecbSystem.CreateCommandBuffer();
            float radiusSq = radius * radius;

            Entities
                .WithAll<MinionData>()
                .ForEach((Entity entity, in LocalTransform transform) =>
                {
                    float distSq = math.distancesq(transform.Position, center);
                    if (distSq <= radiusSq)
                    {
                        ecb.DestroyEntity(entity);
                    }
                })
                .Run();
        }

        /// <summary>
        /// Apply damage to all minions (for testing/debug)
        /// </summary>
        public void DamageAllMinions(float damage)
        {
            Entities
                .ForEach((ref MinionData minion) =>
                {
                    minion.Health = math.max(0, minion.Health - damage);
                })
                .Schedule();
        }

        protected override void OnUpdate()
        {
            // This system is primarily API-driven
        }
    }
}