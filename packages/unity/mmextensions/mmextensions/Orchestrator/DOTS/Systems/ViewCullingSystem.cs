using Unity.Entities;
using Unity.Mathematics;
using Unity.Collections;
using Unity.Burst;
using Unity.Transforms;
using Unity.Jobs;
using Unity.Burst.Intrinsics;
using UnityEngine;

namespace KBVE.MMExtensions.Orchestrator.DOTS.Systems
{
    /// <summary>
    /// High-performance view culling system that automatically manages entity visibility.
    /// Uses KD-Tree spatial indexing for efficient frustum and distance culling.
    /// </summary>
    [UpdateInGroup(typeof(SimulationSystemGroup))]
    [UpdateAfter(typeof(Spatial.SpatialIndexingSystem))]
    [UpdateBefore(typeof(TransformSystemGroup))]
    public partial class ViewCullingSystem : SystemBase
    {
        private Camera _mainCamera;
        private Plane[] _frustumPlanes;
        private float3 _cameraPosition;
        private float _maxViewDistance = 100f; // Default max view distance
        private int _frameCounter;
        private const int CullingInterval = 2; // Cull every 2 frames for performance

        // Performance metrics
        private int _visibleCount;
        private int _culledCount;
        private int _nearbyCount;
        private float _lastCullTime;


        // Component type handles for IJobChunk
        private EntityTypeHandle _entityTypeHandle;
        private ComponentTypeHandle<LocalTransform> _transformTypeHandle;
        private ComponentTypeHandle<ViewRadius> _viewRadiusTypeHandle;
        private ComponentTypeHandle<Visible> _visibleTypeHandle;

        // Reference to spatial indexing system for KD-Tree access
        private Spatial.SpatialIndexingSystem _spatialSystem;

        protected override void OnCreate()
        {
            _frustumPlanes = new Plane[6];
            RequireForUpdate<ViewRadius>();

            // Initialize component type handles
            _entityTypeHandle = GetEntityTypeHandle();
            _transformTypeHandle = GetComponentTypeHandle<LocalTransform>(true);
            _viewRadiusTypeHandle = GetComponentTypeHandle<ViewRadius>(true);
            _visibleTypeHandle = GetComponentTypeHandle<Visible>();

            // Get reference to spatial indexing system
            _spatialSystem = World.GetOrCreateSystemManaged<Spatial.SpatialIndexingSystem>();
        }

        protected override void OnStartRunning()
        {
            _mainCamera = Camera.main;
            if (_mainCamera == null)
            {
                Debug.LogWarning("[ViewCullingSystem] No main camera found. View culling disabled.");
                Enabled = false;
            }
        }

        protected override void OnUpdate()
        {
            // Skip culling on some frames for performance
            _frameCounter++;
            if (_frameCounter % CullingInterval != 0)
                return;

            if (_mainCamera == null)
            {
                _mainCamera = Camera.main;
                if (_mainCamera == null)
                    return;
            }

            var startTime = UnityEngine.Time.realtimeSinceStartup;

            // Update frustum planes
            GeometryUtility.CalculateFrustumPlanes(_mainCamera, _frustumPlanes);
            _cameraPosition = _mainCamera.transform.position;

            // Check if KD-Tree is ready for queries
            if (!_spatialSystem.IsTreeReady)
            {
                // Skip culling if spatial index isn't ready yet
                _lastCullTime = (UnityEngine.Time.realtimeSinceStartup - startTime) * 1000f;
                return;
            }

            // Calculate camera view bounds for KD-Tree query
            var cameraExtents = CalculateCameraViewBounds();
            var kdTree = _spatialSystem.GetKDTree();

            // Query KD-Tree for entities near camera (massive performance optimization!)
            var nearbyEntries = new NativeList<Spatial.Entry>(Allocator.TempJob);

            // Use expanded bounds to include entities that might become visible
            var queryMin = cameraExtents.min - new float3(_maxViewDistance * 0.5f);
            var queryMax = cameraExtents.max + new float3(_maxViewDistance * 0.5f);
            kdTree.GetEntriesInBounds(queryMin, queryMax, nearbyEntries);

            // Create native arrays for frustum planes (for Burst)
            var nativePlanes = new NativeArray<float4>(6, Allocator.TempJob);
            for (int i = 0; i < 6; i++)
            {
                var plane = _frustumPlanes[i];
                nativePlanes[i] = new float4(plane.normal.x, plane.normal.y, plane.normal.z, plane.distance);
            }

            // Update component type handles
            _entityTypeHandle.Update(this);
            _transformTypeHandle.Update(this);
            _viewRadiusTypeHandle.Update(this);
            _visibleTypeHandle.Update(this);

            // Get entity command buffer for deferred structural changes
            var ecbSystem = World.GetOrCreateSystemManaged<EndSimulationEntityCommandBufferSystem>();
            var ecb = ecbSystem.CreateCommandBuffer().AsParallelWriter();

            // Simplified performance tracking - no frame delays
            _visibleCount = 0;
            _culledCount = 0;
            _nearbyCount = nearbyEntries.Length;

            // Process only nearby entities from KD-Tree (massive performance boost!)
            for (int i = 0; i < nearbyEntries.Length; i++)
            {
                var entry = nearbyEntries[i];
                var entity = entry.Entity;
                var position = entry.Position;

                // Get ViewRadius component for this entity
                if (!EntityManager.HasComponent<ViewRadius>(entity))
                    continue;

                var radius = EntityManager.GetComponentData<ViewRadius>(entity);

                // Distance culling first (cheaper than frustum test)
                float distanceToCamera = math.distance(_cameraPosition, position);
                bool withinDistance = (distanceToCamera - radius.Value) <= _maxViewDistance;

                bool shouldBeVisible = false;
                if (withinDistance)
                {
                    // Frustum culling
                    shouldBeVisible = IsInFrustum(position, radius.Value);
                }

                // Set visibility using EntityManager
                EntityManager.SetComponentEnabled<Visible>(entity, shouldBeVisible);

                if (shouldBeVisible)
                    _visibleCount++;
                else
                    _culledCount++;
            }

            // Build a set of entities that were processed from KD-Tree
            var processedEntities = new NativeHashSet<Entity>(nearbyEntries.Length, Allocator.Temp);
            for (int i = 0; i < nearbyEntries.Length; i++)
            {
                processedEntities.Add(nearbyEntries[i].Entity);
            }

            // Mark all other entities with ViewRadius as invisible
            Entities
                .WithName("ViewCulling_MarkDistant")
                .ForEach((Entity entity, in ViewRadius radius) =>
                {
                    if (!processedEntities.Contains(entity))
                    {
                        EntityManager.SetComponentEnabled<Visible>(entity, false);
                        _culledCount++;
                    }
                })
                .WithStructuralChanges()
                .Run();

            processedEntities.Dispose();

            // Clean up containers
            nativePlanes.Dispose();
            nearbyEntries.Dispose();

            // Set dependency to current (no async jobs)
            Dependency = default;

            // Update performance metrics (from previous frame - non-blocking)
            _lastCullTime = (UnityEngine.Time.realtimeSinceStartup - startTime) * 1000f;

            // Log performance stats periodically (using previous frame's data)
            if (_frameCounter % 60 == 0) // Every ~1 second at 60 FPS
            {
                var totalEntities = _visibleCount + _culledCount;
                var entitiesPerMs = totalEntities > 0 && _lastCullTime > 0 ? totalEntities / _lastCullTime : 0;
                Debug.Log($"[ViewCulling] Nearby: {_nearbyCount}, Visible: {_visibleCount}, Culled: {_culledCount}, " +
                         $"Time: {_lastCullTime:F2}ms, Rate: {entitiesPerMs:F0} entities/ms");
            }
        }

        /// <summary>
        /// Calculate camera view bounds for KD-Tree spatial queries
        /// </summary>
        private (float3 min, float3 max) CalculateCameraViewBounds()
        {
            if (_mainCamera == null)
                return (new float3(-_maxViewDistance), new float3(_maxViewDistance));

            var camPos = _cameraPosition;
            var viewDistance = math.min(_maxViewDistance, _mainCamera.farClipPlane);

            // Create a conservative bounding box around camera view
            // This is a simplified approach - could be optimized with proper frustum bounds
            var halfDistance = viewDistance * 0.5f;

            return (
                min: camPos - new float3(halfDistance),
                max: camPos + new float3(halfDistance)
            );
        }

        /// <summary>
        /// Check if a bounding sphere is within the camera frustum
        /// </summary>
        private bool IsInFrustum(float3 position, float radius)
        {
            for (int i = 0; i < 6; i++)
            {
                var plane = _frustumPlanes[i];
                float distance = Vector3.Dot(plane.normal, position) + plane.distance;

                // If sphere is completely behind any plane, it's outside frustum
                if (distance < -radius)
                    return false;
            }

            return true;
        }


        /// <summary>
        /// Configure the maximum view distance for culling
        /// </summary>
        public void SetMaxViewDistance(float distance)
        {
            _maxViewDistance = math.max(1f, distance);
            Debug.Log($"[ViewCullingSystem] Max view distance set to {_maxViewDistance}");
        }

        /// <summary>
        /// Get current culling statistics
        /// </summary>
        public (int visible, int culled, float cullTimeMs) GetStats()
        {
            return (_visibleCount, _culledCount, _lastCullTime);
        }

        protected override void OnDestroy()
        {
            // Cleanup if needed - simplified version has no persistent containers
        }
    }

    /// <summary>
    /// Singleton component for configuring view culling settings
    /// </summary>
    public struct ViewCullingSettings : IComponentData
    {
        public float MaxViewDistance;
        public float LodDistance1; // Distance for first LOD level
        public float LodDistance2; // Distance for second LOD level
        public float LodDistance3; // Distance for third LOD level
        public bool EnableFrustumCulling;
        public bool EnableDistanceCulling;
        public bool EnableLod;

        public static ViewCullingSettings Default => new ViewCullingSettings
        {
            MaxViewDistance = 100f,
            LodDistance1 = 30f,
            LodDistance2 = 60f,
            LodDistance3 = 90f,
            EnableFrustumCulling = true,
            EnableDistanceCulling = true,
            EnableLod = false
        };
    }
}