using System;
using Unity.Burst;
using Unity.Collections;
using Unity.Collections.LowLevel.Unsafe;
using Unity.Entities;
using Unity.Jobs;
using KBVE.MMExtensions.Orchestrator.DOTS.Common;
using KBVE.MMExtensions.Orchestrator.DOTS.Bridge;

namespace KBVE.MMExtensions.Orchestrator.DOTS
{
    /// <summary>
    /// Lock-free triple-buffered cache drain system.
    /// Producers write to native slots via Burst jobs.
    /// Consumer reads completed slots on main thread with per-slot fences.
    /// NO GC pinning, NO managed memory access from Burst.
    /// </summary>
    [UpdateInGroup(typeof(SimulationSystemGroup), OrderLast = true)]
    public partial struct EntityCacheDrainSystem : ISystem
    {
        private struct Slot
        {
            public NativeList<EntityBlitContainer> Data;
            public JobHandle Fence; // Copy job for this slot
            // Note: Count is now implicit via Data.Length
        }


        /// <summary>
        /// Slots are safe for now, gc wont move the pinned array
        /// Pointer stays valid across frames, this is important!
        /// The array should be re-pinned and the memory copy job should be burst compiled.
        /// </summary>


        private Slot _s0, _s1, _s2;
        private int _writeIndex;
        private double _nextTick;       // 30Hz throttle
        private const double Hz = 30.0;

        // Static managed scratch buffer (reused, no GC churn)
        private static EntityBlitContainer[] _managedScratch = new EntityBlitContainer[1024];

        // Pinned handle + address (valid across frames)
        private static System.Runtime.InteropServices.GCHandle _scratchHandle;
        private static System.IntPtr _scratchPtr;

        // NOTE: Cannot use [BurstCompile] here because we need to pin managed memory with GCHandle
        public void OnCreate(ref SystemState state)
        {
            _s0 = new Slot { Data = new NativeList<EntityBlitContainer>(1024, Allocator.Persistent) };
            _s1 = new Slot { Data = new NativeList<EntityBlitContainer>(1024, Allocator.Persistent) };
            _s2 = new Slot { Data = new NativeList<EntityBlitContainer>(1024, Allocator.Persistent) };
            _writeIndex = 0;
            _nextTick = 0;

            // Pin the scratch buffer once for the lifetime of the system
            if (_scratchHandle.IsAllocated) _scratchHandle.Free();
            _scratchHandle = System.Runtime.InteropServices.GCHandle.Alloc(_managedScratch, System.Runtime.InteropServices.GCHandleType.Pinned);
            _scratchPtr = _scratchHandle.AddrOfPinnedObject();
        }

        public void OnDestroy(ref SystemState state)
        {
            // Complete any pending fences before disposal
            if (!_s0.Fence.IsCompleted) _s0.Fence.Complete();
            if (!_s1.Fence.IsCompleted) _s1.Fence.Complete();
            if (!_s2.Fence.IsCompleted) _s2.Fence.Complete();

            _s0.Data.Dispose();
            _s1.Data.Dispose();
            _s2.Data.Dispose();

            // Unpin the managed scratch buffer
            if (_scratchHandle.IsAllocated) _scratchHandle.Free();
        }

        /// <summary>
        /// Burst-safe job that reads DynamicBuffer inside the job and writes into slot's NativeList.
        /// This avoids main-thread buffer access which would force a sync.
        /// </summary>
        [BurstCompile]
        private struct CopyFromBufferToListJob : IJob
        {
            [ReadOnly] public BufferLookup<EntityBlitContainer> Lookup;
            public Entity CacheEntity;

            // We'll write directly into the destination NativeList
            // It's single-writer, single job, so it's safe to resize.
            [NativeDisableContainerSafetyRestriction]
            public NativeList<EntityBlitContainer> Dst;

            public void Execute()
            {
                var src = Lookup[CacheEntity].AsNativeArray();
                Dst.Clear();
                Dst.ResizeUninitialized(src.Length);

                unsafe
                {
                    void* srcPtr = NativeArrayUnsafeUtility.GetUnsafeReadOnlyPtr(src);
                    void* dstPtr = Dst.GetUnsafePtr();
                    UnsafeUtility.MemCpy(dstPtr, srcPtr, (long)src.Length * UnsafeUtility.SizeOf<EntityBlitContainer>());
                }
            }
        }

        /// <summary>
        /// Non-blocking produce: tries to write to slot if fence is ready.
        /// Uses BufferLookup job to avoid main-thread buffer access (which would force sync).
        /// Returns false if slot is still busy (skip this frame instead of blocking).
        /// Returns the new job handle that must be combined with state.Dependency.
        /// </summary>
        private bool TryProduceInto(ref Slot slot, Entity cacheEntity, BufferLookup<EntityBlitContainer> lookup, JobHandle prodHandle, out JobHandle newFence)
        {
            // Non-blocking backpressure: skip if slot still busy
            if (!slot.Fence.IsCompleted)
            {
                newFence = default;
                return false;
            }

            // Schedule copy entirely in Burst, no main-thread buffer access
            var job = new CopyFromBufferToListJob
            {
                Lookup = lookup,
                CacheEntity = cacheEntity,
                Dst = slot.Data
            };

            // Schedule job depending on producer
            slot.Fence = job.Schedule(prodHandle);
            newFence = slot.Fence;
            return true;
        }

        /// <summary>
        /// Non-blocking consume: reads from slot opportunistically if fence is ready.
        /// No Complete() call - purely wait-free.
        /// </summary>
        private void TryConsumeFrom(ref Slot slot)
        {
            if (!slot.Fence.IsCompleted) return; // Not ready yet - skip this frame

            var len = slot.Data.Length;
            if (len <= 0) return;

            // No Complete() needed; fence is already done
            EnsureManagedCapacity(len);
            unsafe
            {
                void* srcPtr = slot.Data.GetUnsafeReadOnlyPtr();
                void* dstPtr = (void*)_scratchPtr;
                UnsafeUtility.MemCpy(dstPtr, srcPtr,
                    (long)len * UnsafeUtility.SizeOf<EntityBlitContainer>());
            }

            // Hand off to managed bridge systems
            ProcessCacheDataManaged(_managedScratch, len);

            // Optional: mark slot as consumed (can leave data for last-frame visibility)
            // slot.Data.Clear();
        }

        public void OnUpdate(ref SystemState state)
        {
            // 1) PRODUCE: Copy current frame's cache to write-slot (throttled to 30Hz)
            var now = SystemAPI.Time.ElapsedTime;
            var shouldProduce = now >= _nextTick;

            if (shouldProduce && SystemAPI.HasSingleton<EntityFrameCacheTag>())
            {
                _nextTick = now + 1.0 / Hz;

                var cacheEntity = SystemAPI.GetSingletonEntity<EntityFrameCacheTag>();
                var producer = SystemAPI.GetComponent<EntityCacheJobHandle>(cacheEntity);

                // Only a lookup (safe to capture in Burst jobs); no main-thread AsNativeArray()
                // This avoids the sync that would happen from accessing the DynamicBuffer on main thread
                var lookup = SystemAPI.GetBufferLookup<EntityBlitContainer>(true);

                var writeIdx = _writeIndex % 3;
                bool produced;
                JobHandle newFence;

                switch (writeIdx)
                {
                    case 0:
                        produced = TryProduceInto(ref _s0, cacheEntity, lookup, producer.ProducerJobHandle, out newFence);
                        break;
                    case 1:
                        produced = TryProduceInto(ref _s1, cacheEntity, lookup, producer.ProducerJobHandle, out newFence);
                        break;
                    default:
                        produced = TryProduceInto(ref _s2, cacheEntity, lookup, producer.ProducerJobHandle, out newFence);
                        break;
                }

                if (produced)
                {
                    _writeIndex++;  // Advance only when we actually wrote
                    // CRITICAL: Register the job with Unity's dependency system
                    // This prevents structural changes while the job is running
                    state.Dependency = JobHandle.CombineDependencies(state.Dependency, newFence);
                }
                // else: slot busy → skip this tick (no stall)
            }

            // 2) CONSUME: Read previous slot if fence completed (opportunistic, non-blocking)
            if (_writeIndex > 0)
            {
                var readIdx = (_writeIndex - 1) % 3;
                switch (readIdx)
                {
                    case 0: TryConsumeFrom(ref _s0); break;
                    case 1: TryConsumeFrom(ref _s1); break;
                    default: TryConsumeFrom(ref _s2); break;
                }
            }
        }

        private static void EnsureManagedCapacity(int n)
        {
            if (_managedScratch.Length >= n) return;

            // Grow to next power of two
            int cap = _managedScratch.Length;
            while (cap < n) cap <<= 1;
            _managedScratch = new EntityBlitContainer[cap];

            // Re-pin the new array and update pointer
            if (_scratchHandle.IsAllocated) _scratchHandle.Free();
            _scratchHandle = System.Runtime.InteropServices.GCHandle.Alloc(_managedScratch, System.Runtime.InteropServices.GCHandleType.Pinned);
            _scratchPtr = _scratchHandle.AddrOfPinnedObject();
        }

        private static void ProcessCacheDataManaged(EntityBlitContainer[] data, int count)
        {
            // Integration with managed bridge systems
            EntityViewModel.UpdateFromCache(data, count);
            SpatialSystemUtilities.UpdateFromCache(data, count);
            // Future: DOTSBridge.ProcessEntityUpdates(data, count);
        }
    }
}
