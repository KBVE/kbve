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
    /// Uses DOTSSingleton for reliable DOTS world access
    /// </summary>
    public class DOTSNPCBridge : IInitializable
    {
        private NPCSystemManager _npcSystemManager;

        [Inject]
        public void Construct(NPCSystemManager npcSystemManager)
        {
            _npcSystemManager = npcSystemManager;
        }

        public void Initialize()
        {
            if (!DOTSSingleton.IsInitialized)
            {
                Debug.LogError("[DOTSNPCBridge] DOTS world not ready. Ensure DOTSSingleton is initialized first.");
                return;
            }

            // Verify systems are available
            var spawnSystem = DOTSSingleton.GetSystem<MinionSpawnRequestSystem>();
            if (spawnSystem == null)
            {
                Debug.LogError("[DOTSNPCBridge] MinionSpawnRequestSystem not found in DOTS world");
                return;
            }

            Debug.Log("[DOTSNPCBridge] Successfully initialized DOTS bridge with static access");
        }

        /// <summary>
        /// Spawn a large wave of minions using ECS
        /// </summary>
        public Entity SpawnMinionWave(Vector3 center, int count, float radius, MinionType type = MinionType.Basic)
        {
            if (!DOTSSingleton.IsInitialized)
            {
                Debug.LogError("[DOTSNPCBridge] Cannot spawn minions - DOTS world not ready");
                return Entity.Null;
            }

            var position = new float3(center.x, center.y, center.z);
            return DOTSSingleton.RequestBulkSpawn(in position, count, type, FactionType.Enemy);
        }

        /// <summary>
        /// Spawn a single minion using ECS
        /// </summary>
        public void SpawnMinion(Vector3 position, MinionType type = MinionType.Basic)
        {
            if (!DOTSSingleton.IsInitialized)
            {
                Debug.LogError("[DOTSNPCBridge] Cannot spawn minion - DOTS world not ready");
                return;
            }

            var pos = new float3(position.x, position.y, position.z);
            DOTSSingleton.RequestSingleSpawn(in pos, type, FactionType.Enemy);
        }

        /// <summary>
        /// Query minions within a radius
        /// </summary>
        public List<Entity> QueryMobsInRadius(Vector3 center, float radius)
        {
            var results = new List<Entity>();

            if (!DOTSSingleton.IsInitialized)
            {
                Debug.LogWarning("[DOTSNPCBridge] Cannot query - DOTS world not ready");
                return results;
            }

            var entityManager = DOTSSingleton.GetEntityManager();
            var query = entityManager.CreateEntityQuery(
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

            if (!DOTSSingleton.IsInitialized)
            {
                Debug.LogWarning("[DOTSNPCBridge] Cannot query - DOTS world not ready");
                return results;
            }

            var entityManager = DOTSSingleton.GetEntityManager();
            var query = entityManager.CreateEntityQuery(
                ComponentType.ReadOnly<MinionData>(),
                ComponentType.ReadOnly<SpatialPosition>()
            );

            var entities = query.ToEntityArray(Unity.Collections.Allocator.Temp);
            var positions = query.ToComponentDataArray<SpatialPosition>(Unity.Collections.Allocator.Temp);

            float3 queryPos = new float3(position.x, position.y, position.z);

            // Simple implementation - for production, use KDTree via spatial systems
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
            if (!DOTSSingleton.IsInitialized)
                return 0;

            var entityManager = DOTSSingleton.GetEntityManager();
            var query = entityManager.CreateEntityQuery(
                ComponentType.ReadOnly<MinionData>()
            );
            return query.CalculateEntityCount();
        }

        /// <summary>
        /// Clear all minions
        /// </summary>
        public void ClearAllMinions()
        {
            if (!DOTSSingleton.IsInitialized)
            {
                Debug.LogWarning("[DOTSNPCBridge] Cannot clear minions - DOTS world not ready");
                return;
            }

            var entityManager = DOTSSingleton.GetEntityManager();
            var query = entityManager.CreateEntityQuery(
                ComponentType.ReadOnly<MinionData>()
            );
            entityManager.DestroyEntity(query);
        }

        /// <summary>
        /// Get minion statistics
        /// </summary>
        public MinionStatistics GetStatistics()
        {
            var stats = new MinionStatistics(true);

            if (!DOTSSingleton.IsInitialized)
            {
                Debug.LogWarning("[DOTSNPCBridge] Cannot get statistics - DOTS world not ready");
                return stats;
            }

            var entityManager = DOTSSingleton.GetEntityManager();
            var query = entityManager.CreateEntityQuery(
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