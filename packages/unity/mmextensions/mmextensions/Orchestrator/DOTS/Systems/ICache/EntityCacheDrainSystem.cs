using System;
using System.Runtime.InteropServices;
using Unity.Burst;
using Unity.Collections;
using Unity.Collections.LowLevel.Unsafe;
using Unity.Entities;
using KBVE.MMExtensions.Orchestrator.DOTS.Common;
using KBVE.MMExtensions.Orchestrator.DOTS.Bridge;

namespace KBVE.MMExtensions.Orchestrator.DOTS
{
    /// <summary>
    /// Drain system that handles main-thread handoff from DOTS to managed bridge
    /// Uses double-buffered pinned arrays for zero-copy data transfer
    /// Runs in presentation group after all producers have completed
    /// Uses EntityBlitContainer directly for maximum performance
    ///
    /// Note: PresentationSystemGroup runs after SimulationSystemGroup by default,
    /// so this system will always run after EntityBlitProduceSystem.
    /// We complete the specific producer job handle to ensure proper synchronization.
    /// </summary>
    [UpdateInGroup(typeof(PresentationSystemGroup))]
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
            // Cache should always exist due to bootstrap - early exit if not
            if (!SystemAPI.HasSingleton<EntityFrameCacheTag>())
                return;

            // Get cache singleton entity
            var cacheEntity = SystemAPI.GetSingletonEntity<EntityFrameCacheTag>();

            // Get and complete the specific producer job handle
            var jobHandleComponent = EntityManager.GetComponentData<EntityCacheJobHandle>(cacheEntity);
            jobHandleComponent.ProducerJobHandle.Complete();

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

                // Use UnsafeUtility.MemCpy - cleaner in DOTS and pairs better with Unity's safety tooling
                UnsafeUtility.MemCpy(destinationPtr, sourcePtr, byteCount);
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
            // 1. EntityViewModel - update currently selected entity from cache (✅ INTEGRATED)
            // 2. Spatial systems - feed cache data to QuadTree/SpatialHash (✅ INTEGRATED - Phase 1)
            // 3. DOTSBridge - handle UI updates (TODO)
            // 4. OneJS/TS bridge - handle web UI updates (TODO)

            // Update the currently selected entity if it appears in cache
            EntityViewModel.UpdateFromCache(data, count);

            // Update spatial systems from cache (Phase 1: validation logging only)
            SpatialSystemUtilities.UpdateFromCache(data, count);

            // Future integrations:
            // DOTSBridge.ProcessEntityUpdates(data, count);

        }

    }
}