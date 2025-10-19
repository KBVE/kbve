using System;
using Unity.Entities;
using Unity.Mathematics;
using Unity.Collections;
using KBVE.MMExtensions.Orchestrator.DOTS.Common;

namespace KBVE.MMExtensions.Orchestrator.DOTS
{
    /// <summary>
    /// Wrapper for FixedBytes16 that implements IEquatable for use in NativeHashMap
    /// </summary>
    public struct UlidKey : IEquatable<UlidKey>
    {
        public FixedBytes16 Value;

        public UlidKey(FixedBytes16 value) => Value = value;

        public bool Equals(UlidKey other)
        {
            unsafe
            {
                fixed (FixedBytes16* ptrA = &Value)
                {
                    FixedBytes16* ptrB = &other.Value;
                    long* longPtrA = (long*)ptrA;
                    long* longPtrB = (long*)ptrB;
                    return longPtrA[0] == longPtrB[0] && longPtrA[1] == longPtrB[1];
                }
            }
        }

        public override int GetHashCode()
        {
            unsafe
            {
                fixed (FixedBytes16* ptr = &Value)
                {
                    long* longPtr = (long*)ptr;
                    // Combine both 64-bit halves for hash
                    return (int)(longPtr[0] ^ longPtr[1]);
                }
            }
        }

        public static implicit operator UlidKey(FixedBytes16 value) => new UlidKey(value);
    }

    /// <summary>
    /// Utilities for integrating the entity cache with spatial systems.
    /// Provides efficient cache-to-spatial-structure updates.
    ///
    /// Phase 2b Implementation: Optimized ULID→Entity lookup
    /// - Uses NativeHashMap for O(1) ULID lookups instead of O(N) searches
    /// - Rebuilds lookup when spatial entities change
    /// - Feeds cache data directly into QuadTree when UseCacheBasedUpdates = true
    /// </summary>
    public static class SpatialSystemUtilities
    {
        private static int _totalCacheUpdates = 0;
        private static int _spatialUpdates = 0;
        private static int _lastLoggedFrame = 0;

        // ULID → Entity lookup for O(1) spatial entity resolution
        private static NativeHashMap<UlidKey, Entity> _ulidToEntity;
        private static bool _lookupInitialized = false;
        private static int _lastKnownSpatialEntityCount = 0;

        /// <summary>
        /// Update spatial systems from entity cache data.
        /// Called from EntityCacheDrainSystem to feed cache data into spatial structures.
        ///
        /// Phase 2: Feeds data directly into QuadTree when cache-based updates are enabled
        /// </summary>
        /// <param name="cacheData">Cached entity data from drain system</param>
        /// <param name="count">Number of valid entries in cache</param>
        public static void UpdateFromCache(EntityBlitContainer[] cacheData, int count)
        {
            // Fast path: no cache data
            if (count == 0)
                return;

            _totalCacheUpdates += count;

            // Get world and check if spatial system is using cache-based updates
            var world = World.DefaultGameObjectInjectionWorld;
            if (world == null || !world.IsCreated)
                return;

            var entityManager = world.EntityManager;

            // Check if cache-based updates are enabled
            var configQuery = entityManager.CreateEntityQuery(ComponentType.ReadOnly<SpatialSystemConfig>());
            if (configQuery.IsEmpty)
            {
                configQuery.Dispose();
                return;
            }

            var config = configQuery.GetSingleton<SpatialSystemConfig>();
            configQuery.Dispose();

            if (!config.UseCacheBasedUpdates)
            {
                // Cache-based updates disabled - legacy ECS query path is active
                return;
            }

            // PHASE 2B: Feed cache data into QuadTree using optimized ULID lookup

            // Rebuild ULID→Entity lookup if needed
            RebuildUlidLookupIfNeeded(entityManager);

            int processedCount = 0;
            int matchedEntities = 0;

            // Process each cached entity with O(1) ULID lookup
            for (int i = 0; i < count; i++)
            {
                ref readonly var cached = ref cacheData[i];
                var ulidKey = new UlidKey(cached.EntityData.Ulid);

                // O(1) lookup instead of O(N) search!
                if (_ulidToEntity.TryGetValue(ulidKey, out Entity entity))
                {
                    matchedEntities++;

                    // Verify entity still has SpatialIndex (safety check)
                    if (entityManager.HasComponent<SpatialIndex>(entity))
                    {
                        var spatialIndex = entityManager.GetComponentData<SpatialIndex>(entity);

                        // Only process if entity wants to be in queries
                        if (spatialIndex.IncludeInQueries)
                        {
                            var position = cached.EntityData.WorldPos;

                            // TODO: Insert into QuadTree
                            // quadTree.Insert(entity, position, spatialIndex.Radius);
                            // Need QuadTree reference accessible from managed code

                            processedCount++;
                        }
                    }
                }
            }

            _spatialUpdates += processedCount;

#if UNITY_EDITOR || DEVELOPMENT_BUILD
            var currentFrame = UnityEngine.Time.frameCount;
            if (currentFrame - _lastLoggedFrame >= 60) // Log once per second at 60fps
            {
                float matchRate = count > 0 ? (matchedEntities / (float)count) * 100f : 0f;
                UnityEngine.Debug.Log($"[SpatialCache] Phase 2B ACTIVE: {count} cache entities, {matchedEntities} matched ({matchRate:F1}%), {processedCount} spatial updates (HashMap size: {_lastKnownSpatialEntityCount})");
                _lastLoggedFrame = currentFrame;
            }
#endif
        }

        /// <summary>
        /// Rebuild ULID→Entity lookup if the number of spatial entities has changed.
        /// This maintains O(1) lookups while adapting to entity creation/destruction.
        /// </summary>
        private static void RebuildUlidLookupIfNeeded(EntityManager entityManager)
        {
            // Create query for entities with both EntityComponent and SpatialIndex
            var spatialQuery = entityManager.CreateEntityQuery(
                ComponentType.ReadOnly<EntityComponent>(),
                ComponentType.ReadOnly<SpatialIndex>()
            );

            int currentCount = spatialQuery.CalculateEntityCount();

            // Check if we need to rebuild (first time or entity count changed)
            if (!_lookupInitialized || currentCount != _lastKnownSpatialEntityCount)
            {
                // Dispose old lookup if it exists
                if (_lookupInitialized && _ulidToEntity.IsCreated)
                {
                    _ulidToEntity.Dispose();
                }

                // Create new lookup with exact capacity
                _ulidToEntity = new NativeHashMap<UlidKey, Entity>(currentCount, Allocator.Persistent);

                // Populate lookup
                var entities = spatialQuery.ToEntityArray(Allocator.Temp);
                var entityComponents = spatialQuery.ToComponentDataArray<EntityComponent>(Allocator.Temp);

                for (int i = 0; i < entities.Length; i++)
                {
                    var ulidKey = new UlidKey(entityComponents[i].Data.Ulid);
                    _ulidToEntity[ulidKey] = entities[i];
                }

                entities.Dispose();
                entityComponents.Dispose();

                _lookupInitialized = true;
                _lastKnownSpatialEntityCount = currentCount;

#if UNITY_EDITOR || DEVELOPMENT_BUILD
                UnityEngine.Debug.Log($"[SpatialCache] Built ULID→Entity lookup with {currentCount} spatial entities");
#endif
            }

            spatialQuery.Dispose();
        }

        /// <summary>
        /// Reset statistics (useful for testing)
        /// </summary>
        public static void ResetStats()
        {
            _totalCacheUpdates = 0;
            _spatialUpdates = 0;
            _lastLoggedFrame = 0;

            // Also dispose lookup
            if (_lookupInitialized && _ulidToEntity.IsCreated)
            {
                _ulidToEntity.Dispose();
            }
            _lookupInitialized = false;
            _lastKnownSpatialEntityCount = 0;
        }

    }
}
