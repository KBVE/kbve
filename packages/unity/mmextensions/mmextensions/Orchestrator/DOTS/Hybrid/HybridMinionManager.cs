using Unity.Entities;
using Unity.Mathematics;
using UnityEngine;
using VContainer;
using VContainer.Unity;
using System.Collections.Generic;
using Cysharp.Threading.Tasks;
using System.Threading;
using System;
using KBVE.MMExtensions.Orchestrator.Core;

namespace KBVE.MMExtensions.Orchestrator.DOTS.Hybrid
{
    /// <summary>
    /// High-level manager that coordinates between GameObject NPCs and ECS minions
    /// Provides unified interface for both systems
    /// </summary>
    public class HybridMinionManager : MonoBehaviour, IInitializable
    {
        [Header("Configuration")]
        [SerializeField] private bool enableDOTSMinions = true;
        [SerializeField] private bool enableGameObjectNPCs = true;
        [SerializeField] private int maxDOTSMinions = 1000;
        [SerializeField] private int gameObjectThreshold = 10;

        [Header("Performance")]
        [SerializeField] private bool enableAutoOptimization = true;
        [SerializeField] private float optimizationInterval = 5f;

        [Header("Debug")]
        [SerializeField] private bool enableDebugLogs = false;
        [SerializeField] private bool showPerformanceStats = false;

        // Injected dependencies
        private NPCSystemManager _npcSystemManager;
        private DOTSNPCBridge _dotsBridge;

        // Performance tracking
        private float _lastOptimizationTime;
        private int _frameCount;
        private float _deltaTimeAccumulator;

        // Minion tracking
        private readonly Dictionary<int, List<Entity>> _minionGroups = new();
        private readonly Dictionary<int, MinionGroupConfig> _groupConfigs = new();
        private int _nextGroupId = 1;

        [Inject]
        public void Construct(NPCSystemManager npcManager, DOTSNPCBridge dotsbridge)
        {
            _npcSystemManager = npcManager;
            _dotsBridge = dotsbridge;
        }

        public void Initialize()
        {
            _lastOptimizationTime = Time.time;

            if (enableDebugLogs)
            {
                Debug.Log("[HybridMinionManager] Initialized hybrid minion management system");
            }

            // Initialize NPCSystemManager with DOTS capabilities
            _npcSystemManager.InitializeDOTS(_dotsBridge);

            // Start optimization loop if enabled
            if (enableAutoOptimization)
            {
                StartOptimizationLoop().Forget();
            }
        }

        #region Public API

        /// <summary>
        /// Spawn minions intelligently choosing between DOTS and GameObject based on count
        /// </summary>
        public async UniTask<int> SpawnMinionsIntelligent(
            Vector3 center,
            int count,
            MinionType type = MinionType.Basic,
            float radius = 10f,
            CancellationToken cancellationToken = default)
        {
            if (count <= 0) return 0;

            int groupId = _nextGroupId++;
            _minionGroups[groupId] = new List<Entity>();
            _groupConfigs[groupId] = new MinionGroupConfig
            {
                GroupId = groupId,
                SpawnPosition = center,
                Count = count,
                Type = type,
                SpawnTime = Time.time
            };

            if (enableDebugLogs)
            {
                Debug.Log($"[HybridMinionManager] Spawning {count} minions of type {type}");
            }

            // Decide spawning strategy based on count and configuration
            if (ShouldUseDOTS(count, type))
            {
                return await SpawnMinionsDOTS(groupId, center, count, type, radius, cancellationToken);
            }
            else
            {
                return await SpawnMinionsGameObject(groupId, center, count, type, radius, cancellationToken);
            }
        }

        /// <summary>
        /// Query all nearby minions (both DOTS and GameObject)
        /// </summary>
        public List<IMinionReference> GetNearbyMinions(Vector3 position, float radius)
        {
            var results = new List<IMinionReference>();

            // Get DOTS minions
            if (enableDOTSMinions)
            {
                var dotsMinions = _dotsBridge.QueryMobsInRadius(position, radius);
                foreach (var entity in dotsMinions)
                {
                    results.Add(new DOTSMinionReference(entity, _dotsBridge));
                }
            }

            // Get GameObject NPCs
            if (enableGameObjectNPCs)
            {
                var gameObjectNPCs = _npcSystemManager.GetManagedNPCs();
                foreach (var npc in gameObjectNPCs)
                {
                    if (Vector3.Distance(npc.transform.position, position) <= radius)
                    {
                        results.Add(new GameObjectMinionReference(npc));
                    }
                }
            }

            return results;
        }

        /// <summary>
        /// Get comprehensive statistics about all minions
        /// </summary>
        public HybridMinionStats GetStatistics()
        {
            var stats = new HybridMinionStats();

            // DOTS statistics
            if (enableDOTSMinions)
            {
                var dotsStats = _dotsBridge.GetStatistics();
                stats.DOTSMinionCount = dotsStats.TotalCount;
                stats.DOTSEnemyCount = dotsStats.EnemyCount;
                stats.DOTSAllyCount = dotsStats.AllyCount;
            }

            // GameObject statistics
            if (enableGameObjectNPCs)
            {
                var npcInfo = _npcSystemManager.GetSystemInfo();
                stats.GameObjectNPCCount = npcInfo.ChildCount;
            }

            stats.TotalGroups = _minionGroups.Count;
            stats.AverageFrameTime = _deltaTimeAccumulator / _frameCount;

            return stats;
        }

        /// <summary>
        /// Clear all minions of specified type
        /// </summary>
        public void ClearMinions(MinionClearType clearType = MinionClearType.All)
        {
            switch (clearType)
            {
                case MinionClearType.DOTS:
                    _dotsBridge.ClearAllMinions();
                    break;

                case MinionClearType.GameObjects:
                    ClearGameObjectMinions();
                    break;

                case MinionClearType.All:
                    _dotsBridge.ClearAllMinions();
                    ClearGameObjectMinions();
                    break;
            }

            _minionGroups.Clear();
            _groupConfigs.Clear();

            if (enableDebugLogs)
            {
                Debug.Log($"[HybridMinionManager] Cleared minions: {clearType}");
            }
        }

        #endregion

        #region Private Implementation

        private bool ShouldUseDOTS(int count, MinionType type)
        {
            if (!enableDOTSMinions) return false;
            if (!enableGameObjectNPCs) return true;

            // Use DOTS for large counts
            if (count > gameObjectThreshold) return true;

            // Use DOTS for simple minion types
            if (type == MinionType.Basic || type == MinionType.Fast) return true;

            // Use GameObjects for complex types
            if (type == MinionType.Boss) return false;

            // Check current DOTS load
            var currentDOTSCount = _dotsBridge.GetMinionCount();
            return currentDOTSCount + count <= maxDOTSMinions;
        }

        private async UniTask<int> SpawnMinionsDOTS(
            int groupId,
            Vector3 center,
            int count,
            MinionType type,
            float radius,
            CancellationToken cancellationToken)
        {
            var spawnerEntity = _dotsBridge.SpawnMinionWave(center, count, radius, type);

            if (spawnerEntity != Entity.Null)
            {
                _minionGroups[groupId].Add(spawnerEntity);
                return count; // DOTS spawns asynchronously
            }

            return 0;
        }

        private async UniTask<int> SpawnMinionsGameObject(
            int groupId,
            Vector3 center,
            int count,
            MinionType type,
            float radius,
            CancellationToken cancellationToken)
        {
            int spawnedCount = 0;

            for (int i = 0; i < count && !cancellationToken.IsCancellationRequested; i++)
            {
                // Calculate spawn position
                Vector2 randomOffset = UnityEngine.Random.insideUnitCircle * radius;
                Vector3 spawnPos = center + new Vector3(randomOffset.x, 0, randomOffset.y);

                // Spawn using NPC system
                var npc = await _npcSystemManager.SpawnNPCAsync(
                    GetNPCIdForMinionType(type),
                    spawnPos,
                    cancellationToken
                );

                if (npc != null)
                {
                    spawnedCount++;

                    // Small delay to prevent frame spikes
                    if (i % 10 == 9)
                    {
                        await UniTask.Yield(PlayerLoopTiming.Update, cancellationToken);
                    }
                }
            }

            return spawnedCount;
        }

        private void ClearGameObjectMinions()
        {
            var npcs = _npcSystemManager.GetManagedNPCs();
            foreach (var npc in npcs)
            {
                if (npc != null)
                {
                    GameObject.Destroy(npc);
                }
            }
        }

        private string GetNPCIdForMinionType(MinionType type) => type switch
        {
            MinionType.Tank => "enemy_tank",
            MinionType.Fast => "enemy_fast",
            MinionType.Ranged => "enemy_ranged",
            MinionType.Flying => "enemy_flying",
            MinionType.Boss => "boss_basic",
            _ => "enemy_basic"
        };

        private async UniTaskVoid StartOptimizationLoop()
        {
            var cancellationToken = this.GetCancellationTokenOnDestroy();

            while (!cancellationToken.IsCancellationRequested)
            {
                await UniTask.Delay(
                    TimeSpan.FromSeconds(optimizationInterval),
                    cancellationToken: cancellationToken
                );

                if (enableAutoOptimization)
                {
                    PerformOptimization();
                }
            }
        }

        private void PerformOptimization()
        {
            // Clean up expired groups
            var expiredGroups = new List<int>();
            float currentTime = Time.time;

            foreach (var kvp in _groupConfigs)
            {
                if (currentTime - kvp.Value.SpawnTime > 300f) // 5 minutes
                {
                    expiredGroups.Add(kvp.Key);
                }
            }

            foreach (var groupId in expiredGroups)
            {
                _minionGroups.Remove(groupId);
                _groupConfigs.Remove(groupId);
            }

            if (enableDebugLogs && expiredGroups.Count > 0)
            {
                Debug.Log($"[HybridMinionManager] Cleaned up {expiredGroups.Count} expired groups");
            }
        }

        #endregion

        private void Update()
        {
            _frameCount++;
            _deltaTimeAccumulator += Time.deltaTime;

            if (showPerformanceStats && _frameCount % 60 == 0)
            {
                var stats = GetStatistics();
                Debug.Log($"[HybridMinionManager] Stats - DOTS: {stats.DOTSMinionCount}, " +
                         $"GameObject: {stats.GameObjectNPCCount}, Groups: {stats.TotalGroups}");
            }
        }
    }

    #region Helper Classes and Structures

    public struct MinionGroupConfig
    {
        public int GroupId;
        public Vector3 SpawnPosition;
        public int Count;
        public MinionType Type;
        public float SpawnTime;
    }

    public struct HybridMinionStats
    {
        public int DOTSMinionCount;
        public int DOTSEnemyCount;
        public int DOTSAllyCount;
        public int GameObjectNPCCount;
        public int TotalGroups;
        public float AverageFrameTime;

        public int TotalMinionCount => DOTSMinionCount + GameObjectNPCCount;
    }

    public enum MinionClearType
    {
        All,
        DOTS,
        GameObjects
    }

    public interface IMinionReference
    {
        Vector3 Position { get; }
        bool IsValid { get; }
        FactionType Faction { get; }
        void Destroy();
    }

    public class DOTSMinionReference : IMinionReference
    {
        private readonly Entity _entity;
        private readonly DOTSNPCBridge _bridge;

        public DOTSMinionReference(Entity entity, DOTSNPCBridge bridge)
        {
            _entity = entity;
            _bridge = bridge;
        }

        public Vector3 Position => Vector3.zero; // Would need access to EntityManager
        public bool IsValid => _entity != Entity.Null;
        public FactionType Faction => FactionType.Enemy; // Would need access to component data
        public void Destroy() { /* Implementation needed */ }
    }

    public class GameObjectMinionReference : IMinionReference
    {
        private readonly GameObject _gameObject;

        public GameObjectMinionReference(GameObject gameObject)
        {
            _gameObject = gameObject;
        }

        public Vector3 Position => _gameObject != null ? _gameObject.transform.position : Vector3.zero;
        public bool IsValid => _gameObject != null;
        public FactionType Faction => FactionType.Enemy; // Would need to get from NPC component
        public void Destroy() => GameObject.Destroy(_gameObject);
    }

    #endregion
}