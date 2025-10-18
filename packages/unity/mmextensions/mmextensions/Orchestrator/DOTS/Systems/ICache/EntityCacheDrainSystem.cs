using System;
using System.Runtime.InteropServices;
using Unity.Burst;
using Unity.Collections;
using Unity.Collections.LowLevel.Unsafe;
using Unity.Entities;
using KBVE.MMExtensions.Orchestrator.DOTS.Common;

namespace KBVE.MMExtensions.Orchestrator.DOTS
{
    /// <summary>
    /// Drain system that handles main-thread handoff from DOTS to managed bridge
    /// Uses double-buffered pinned arrays for zero-copy data transfer
    /// Runs in presentation group after all producers have completed
    /// Uses EntityBlitContainer directly for maximum performance
    /// </summary>
    [UpdateInGroup(typeof(PresentationSystemGroup))]
    [UpdateAfter(typeof(EntityBlitProduceSystem))]
    public partial class EntityCacheDrainSystem : SystemBase
    {
        // Double-buffered arrays for efficient data handoff
        private EntityBlitContainer[] _bufferA;
        private EntityBlitContainer[] _bufferB;

        // GC handles for pinned memory to enable unsafe operations
        private GCHandle _handleA;
        private GCHandle _handleB;

        // Buffer selection flag for double buffering
        private bool _useBufferA;

        protected override void OnCreate()
        {
            // Initialize double buffers with reasonable capacity
            AllocateBuffers(1024);
        }

        protected override void OnDestroy()
        {
            // Clean up pinned memory handles
            if (_handleA.IsAllocated)
                _handleA.Free();
            if (_handleB.IsAllocated)
                _handleB.Free();
        }

        protected override void OnUpdate()
        {
            // Ensure all producer jobs have completed
            CompleteDependency();

            // Check if cache singleton exists
            if (!SystemAPI.HasSingleton<EntityFrameCacheTag>())
            {
                // Cache not initialized yet - initialize it
                InitializeCache();
                return;
            }

            // Get cache singleton and its buffer
            var cacheEntity = SystemAPI.GetSingletonEntity<EntityFrameCacheTag>();
            var cacheBuffer = EntityManager.GetBuffer<EntityBlitContainer>(cacheEntity);
            var bufferArray = cacheBuffer.AsNativeArray();

            // Early exit if no data to process
            if (bufferArray.Length == 0)
                return;

            // Ensure capacity for current data
            EnsureBufferCapacity(bufferArray.Length);

            // Select current destination buffer
            var destinationArray = _useBufferA ? _bufferA : _bufferB;

            // High-speed memory copy from DOTS buffer to managed array
            unsafe
            {
                // Get pointers to pinned managed array and native buffer
                void* destinationPtr = Marshal.UnsafeAddrOfPinnedArrayElement(destinationArray, 0).ToPointer();
                void* sourcePtr = NativeArrayUnsafeUtility.GetUnsafeReadOnlyPtr(bufferArray);

                // Calculate byte count for copy operation
                long byteCount = (long)bufferArray.Length * sizeof(EntityBlitContainer);
                long maxByteCount = destinationArray.Length * sizeof(EntityBlitContainer);

                // Perform memory copy with bounds checking
                Buffer.MemoryCopy(sourcePtr, destinationPtr, maxByteCount, byteCount);
            }

            // Hand off to managed bridge system
            // Integration point for your existing bridge infrastructure
            ProcessCacheData(destinationArray, bufferArray.Length);

            // Swap buffers for next frame
            _useBufferA = !_useBufferA;

            // Optional: Clear buffer for delta-only semantics
            // Uncomment if you want incremental updates instead of full frames
            // state.EntityManager.GetBuffer<EntityFrameCache>(cacheEntity).Clear();
        }

        /// <summary>
        /// Allocate double buffers with specified capacity
        /// </summary>
        private void AllocateBuffers(int capacity)
        {
            _bufferA = new EntityBlitContainer[capacity];
            _bufferB = new EntityBlitContainer[capacity];

            // Pin arrays in memory for unsafe operations
            _handleA = GCHandle.Alloc(_bufferA, GCHandleType.Pinned);
            _handleB = GCHandle.Alloc(_bufferB, GCHandleType.Pinned);

            _useBufferA = true;
        }

        /// <summary>
        /// Ensure buffer capacity meets current requirements
        /// Reallocates with exponential growth if needed
        /// </summary>
        private void EnsureBufferCapacity(int requiredCapacity)
        {
            if (requiredCapacity <= _bufferA.Length)
                return;

            // Calculate new capacity with exponential growth
            var newCapacity = _bufferA.Length;
            while (newCapacity < requiredCapacity)
                newCapacity <<= 1; // Double capacity

            // Free existing handles
            if (_handleA.IsAllocated)
                _handleA.Free();
            if (_handleB.IsAllocated)
                _handleB.Free();

            // Reallocate with new capacity
            AllocateBuffers(newCapacity);
        }

        /// <summary>
        /// Process cached entity data - integration point for bridge systems
        /// This is where you would integrate with your existing bridge infrastructure
        /// </summary>
        private static void ProcessCacheData(EntityBlitContainer[] data, int count)
        {
            // Integration points for your existing systems:
            // 1. EntityToVmDrainSystem - update view models
            // 2. DOTSBridge - handle UI updates
            // 3. Spatial systems - update spatial indices
            // 4. OneJS/TS bridge - handle web UI updates

            // Example integration calls (uncomment when ready):
            // EntityViewModel.UpdateFromCache(data, count);
            // DOTSBridge.ProcessEntityUpdates(data, count);

            #if UNITY_EDITOR || DEVELOPMENT_BUILD
            // Debug logging for development builds
            if (count > 0)
            {
                UnityEngine.Debug.Log($"[EntityCacheDrainSystem] Processed {count} entity cache entries");
            }
            #endif
        }

        /// <summary>
        /// Initialize the cache singleton if it doesn't exist
        /// This ensures the cache system works even if bootstrap wasn't explicitly enabled
        /// </summary>
        private void InitializeCache()
        {
            // Create singleton entity for entity frame cache
            var cacheEntity = EntityManager.CreateEntity();
            EntityManager.AddComponent<EntityFrameCacheTag>(cacheEntity);

            // Add buffer component and pre-allocate capacity for performance
            var buffer = EntityManager.AddBuffer<EntityBlitContainer>(cacheEntity);
            buffer.EnsureCapacity(4096); // Pre-allocate for large scenes

            #if UNITY_EDITOR || DEVELOPMENT_BUILD
            UnityEngine.Debug.Log("[EntityCacheDrainSystem] Auto-initialized cache singleton");
            #endif
        }
    }
}