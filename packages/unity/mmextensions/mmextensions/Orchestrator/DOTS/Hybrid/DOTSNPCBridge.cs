using Unity.Entities;
using Unity.Mathematics;
using UnityEngine;
using VContainer;
using VContainer.Unity;
using System.Collections.Generic;
using Cysharp.Threading.Tasks;
using KBVE.MMExtensions.Orchestrator.Core;

namespace KBVE.MMExtensions.Orchestrator.DOTS.Hybrid
{
    /// <summary>
    /// Bridge between traditional NPCSystemManager and DOTS minion systems
    /// Allows NPCSystemManager to leverage ECS for bulk spawning
    /// </summary>
    public class DOTSNPCBridge : IInitializable
    {
        private World _minionWorld;
        private EntityManager _entityManager;
        private MinionSpawnRequestSystem _spawnRequestSystem;
        private NPCSystemManager _npcSystemManager;

        [Inject]
        public void Construct(NPCSystemManager npcSystemManager)
        {
            _npcSystemManager = npcSystemManager;
        }

        public void Initialize()
        {
            // Get or create the minion world
            _minionWorld = World.DefaultGameObjectInjectionWorld;
            if (_minionWorld == null)
            {
                Debug.LogError("[DOTSNPCBridge] Failed to get default world");
                return;
            }

            _entityManager = _minionWorld.EntityManager;

            // Get spawn request system
            _spawnRequestSystem = _minionWorld.GetExistingSystemManaged<MinionSpawnRequestSystem>();
            if (_spawnRequestSystem == null)
            {
                Debug.LogWarning("[DOTSNPCBridge] MinionSpawnRequestSystem not found, creating it");
                _spawnRequestSystem = _minionWorld.CreateSystemManaged<MinionSpawnRequestSystem>();
            }

            Debug.Log("[DOTSNPCBridge] Successfully initialized DOTS bridge");
        }

        /// <summary>
        /// Spawn a large wave of minions using ECS
        /// </summary>
        public Entity SpawnMinionWave(Vector3 center, int count, float radius, MinionType type = MinionType.Basic)
        {
            var faction = FactionType.Enemy; // Default to enemy
            return _spawnRequestSystem.RequestBulkSpawn(
                new float3(center.x, center.y, center.z),
                count,
                type,
                faction
            );
        }

        /// <summary>
        /// Spawn a single minion using ECS
        /// </summary>
        public void SpawnMinion(Vector3 position, MinionType type = MinionType.Basic)
        {
            _spawnRequestSystem.RequestSingleSpawn(
                new float3(position.x, position.y, position.z),
                type,
                FactionType.Enemy
            );
        }

        /// <summary>
        /// Query minions within a radius
        /// </summary>
        public List<Entity> QueryMobsInRadius(Vector3 center, float radius)
        {
            var results = new List<Entity>();
            var query = _entityManager.CreateEntityQuery(
                ComponentType.ReadOnly<MinionData>(),
                ComponentType.ReadOnly<SpatialPosition>()
            );

            var entities = query.ToEntityArray(Unity.Collections.Allocator.Temp);
            var positions = query.ToComponentDataArray<SpatialPosition>(Unity.Collections.Allocator.Temp);

            float radiusSq = radius * radius;
            float3 centerPos = new float3(center.x, center.y, center.z);

            for (int i = 0; i < entities.Length; i++)
            {
                float distSq = math.distancesq(positions[i].Position, centerPos);
                if (distSq <= radiusSq)
                {
                    results.Add(entities[i]);
                }
            }

            entities.Dispose();
            positions.Dispose();

            return results;
        }

        /// <summary>
        /// Get nearest K mobs to a position
        /// </summary>
        public List<(Entity entity, float distance)> GetNearestMobs(Vector3 position, int count)
        {
            var results = new List<(Entity, float)>();
            var query = _entityManager.CreateEntityQuery(
                ComponentType.ReadOnly<MinionData>(),
                ComponentType.ReadOnly<SpatialPosition>()
            );

            var entities = query.ToEntityArray(Unity.Collections.Allocator.Temp);
            var positions = query.ToComponentDataArray<SpatialPosition>(Unity.Collections.Allocator.Temp);

            float3 queryPos = new float3(position.x, position.y, position.z);

            // Simple implementation - for production, use KDTree
            var distances = new List<(Entity entity, float dist)>();
            for (int i = 0; i < entities.Length; i++)
            {
                float dist = math.distance(positions[i].Position, queryPos);
                distances.Add((entities[i], dist));
            }

            distances.Sort((a, b) => a.dist.CompareTo(b.dist));

            for (int i = 0; i < math.min(count, distances.Count); i++)
            {
                results.Add(distances[i]);
            }

            entities.Dispose();
            positions.Dispose();

            return results;
        }

        /// <summary>
        /// Get total minion count
        /// </summary>
        public int GetMinionCount()
        {
            var query = _entityManager.CreateEntityQuery(
                ComponentType.ReadOnly<MinionData>()
            );
            return query.CalculateEntityCount();
        }

        /// <summary>
        /// Clear all minions
        /// </summary>
        public void ClearAllMinions()
        {
            var query = _entityManager.CreateEntityQuery(
                ComponentType.ReadOnly<MinionData>()
            );
            _entityManager.DestroyEntity(query);
        }

        /// <summary>
        /// Get minion statistics
        /// </summary>
        public MinionStatistics GetStatistics()
        {
            var stats = new MinionStatistics();
            var query = _entityManager.CreateEntityQuery(
                ComponentType.ReadOnly<MinionData>()
            );

            var minionData = query.ToComponentDataArray<MinionData>(Unity.Collections.Allocator.Temp);

            stats.TotalCount = minionData.Length;

            foreach (var minion in minionData)
            {
                // Count by faction
                switch (minion.Faction)
                {
                    case FactionType.Enemy:
                        stats.EnemyCount++;
                        break;
                    case FactionType.Ally:
                        stats.AllyCount++;
                        break;
                    case FactionType.Player:
                        stats.PlayerCount++;
                        break;
                    case FactionType.Neutral:
                        stats.NeutralCount++;
                        break;
                }

                // Count by type
                stats.TypeCounts[(int)minion.Type]++;

                // Calculate average health
                stats.TotalHealth += minion.Health;
            }

            if (stats.TotalCount > 0)
            {
                stats.AverageHealth = stats.TotalHealth / stats.TotalCount;
            }

            minionData.Dispose();

            return stats;
        }
    }

    /// <summary>
    /// Statistics about current minion population
    /// </summary>
    public struct MinionStatistics
    {
        public int TotalCount;
        public int EnemyCount;
        public int AllyCount;
        public int PlayerCount;
        public int NeutralCount;
        public float TotalHealth;
        public float AverageHealth;
        public int[] TypeCounts;

        public MinionStatistics(bool init)
        {
            TotalCount = 0;
            EnemyCount = 0;
            AllyCount = 0;
            PlayerCount = 0;
            NeutralCount = 0;
            TotalHealth = 0;
            AverageHealth = 0;
            TypeCounts = new int[6]; // Number of MinionTypes
        }
    }
}