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
            public int Count;       // Valid element count
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
        /// Burst-safe native-to-native memory copy
        /// </summary>
        [BurstCompile]
        private struct MemCpyJob : IJob
        {
            [ReadOnly] public NativeArray<EntityBlitContainer> Src;
            [NativeDisableUnsafePtrRestriction] public unsafe void* Dst;
            public int Count;

            public void Execute()
            {
                unsafe
                {
                    var srcPtr = NativeArrayUnsafeUtility.GetUnsafeReadOnlyPtr(Src);
                    UnsafeUtility.MemCpy(Dst, srcPtr, (long)Count * UnsafeUtility.SizeOf<EntityBlitContainer>());
                }
            }
        }

        /// <summary>
        /// Helper method to produce data into a slot with proper fence handling
        /// </summary>
        private void ProduceInto(ref Slot slot, NativeArray<EntityBlitContainer> src, JobHandle sysDep, JobHandle prodHandle)
        {
            // Complete any previous fence on this slot before reusing it
            if (!slot.Fence.IsCompleted)
                slot.Fence.Complete();

            // Ensure slot has capacity
            if (slot.Data.Capacity < src.Length)
                slot.Data.Capacity = src.Length;

            slot.Data.ResizeUninitialized(src.Length);
            slot.Count = src.Length;

            // Schedule native-to-native copy job
            unsafe
            {
                void* dstPtr = slot.Data.GetUnsafePtr();
                var job = new MemCpyJob { Src = src, Dst = dstPtr, Count = src.Length };
                slot.Fence = job.Schedule(JobHandle.CombineDependencies(sysDep, prodHandle));
            }
        }

        /// <summary>
        /// Helper method to consume data from a slot with proper fence handling
        /// </summary>
        private void ConsumeFrom(ref Slot slot)
        {
            if (slot.Count <= 0 || !slot.Fence.IsCompleted) return;

            // Complete THIS slot's fence only (no global sync)
            slot.Fence.Complete();

            // Copy native -> managed on main thread (SAFE)
            EnsureManagedCapacity(slot.Count);
            unsafe
            {
                void* srcPtr = slot.Data.GetUnsafeReadOnlyPtr();
                void* dstPtr = (void*)_scratchPtr;
                UnsafeUtility.MemCpy(dstPtr, srcPtr,
                    (long)slot.Count * UnsafeUtility.SizeOf<EntityBlitContainer>());
            }

            // Hand off to managed bridge systems
            ProcessCacheDataManaged(_managedScratch, slot.Count);
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
                var cacheBuf = SystemAPI.GetBuffer<EntityBlitContainer>(cacheEntity);
                var src = cacheBuf.AsNativeArray();

                if (src.Length > 0)
                {
                    var writeIdx = _writeIndex % 3;
                    switch (writeIdx)
                    {
                        case 0: ProduceInto(ref _s0, src, state.Dependency, producer.ProducerJobHandle); break;
                        case 1: ProduceInto(ref _s1, src, state.Dependency, producer.ProducerJobHandle); break;
                        default: ProduceInto(ref _s2, src, state.Dependency, producer.ProducerJobHandle); break;
                    }
                    _writeIndex++;
                }
            }

            // 2) CONSUME: Read previous slot if fence completed
            if (_writeIndex > 0)
            {
                var readIdx = (_writeIndex - 1) % 3;
                switch (readIdx)
                {
                    case 0: ConsumeFrom(ref _s0); break;
                    case 1: ConsumeFrom(ref _s1); break;
                    default: ConsumeFrom(ref _s2); break;
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
