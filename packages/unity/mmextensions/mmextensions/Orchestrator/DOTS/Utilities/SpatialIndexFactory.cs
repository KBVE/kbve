using Unity.Collections;
using Unity.Mathematics;
using VContainer;
using KBVE.MMExtensions.Orchestrator.DOTS.Spatial;

namespace KBVE.MMExtensions.Orchestrator.DOTS.Utilities
{
    public interface ISpatialIndexFactory
    {
        KDTreeAdvanced CreateKDTree(int capacity, Allocator allocator);
        void ConfigureKDTree(ref KDTreeAdvanced kdTree, SpatialIndexConfiguration config);
    }

    public interface IPriorityHeapFactory
    {
        NativePriorityHeap<T> CreateHeap<T>(int capacity, Allocator allocator, HeapComparison comparison = HeapComparison.Min)
            where T : unmanaged, System.IComparable<T>;
        NativePriorityHeap<SpatialHeapEntry> CreateSpatialHeap(int capacity, Allocator allocator);
        NativePriorityHeap<PriorityHeapEntry> CreatePriorityHeap(int capacity, Allocator allocator);
    }

    [Unity.Burst.BurstCompile]
    public class SpatialIndexFactory : ISpatialIndexFactory
    {
        private readonly SpatialIndexConfiguration _config;

        [Inject]
        public SpatialIndexFactory(SpatialIndexConfiguration config)
        {
            _config = config;
        }

        public KDTreeAdvanced CreateKDTree(int capacity, Allocator allocator)
        {
            return new KDTreeAdvanced(capacity, _config.kdTreeLeafSize, allocator);
        }

        public void ConfigureKDTree(ref KDTreeAdvanced kdTree, SpatialIndexConfiguration config)
        {
            // Apply configuration settings to the KDTree
            // This would set internal parameters based on config
        }
    }

    [Unity.Burst.BurstCompile]
    public class PriorityHeapFactory : IPriorityHeapFactory
    {
        private readonly SpatialIndexConfiguration _config;

        [Inject]
        public PriorityHeapFactory(SpatialIndexConfiguration config)
        {
            _config = config;
        }

        public NativePriorityHeap<T> CreateHeap<T>(int capacity, Allocator allocator, HeapComparison comparison = HeapComparison.Min)
            where T : unmanaged, System.IComparable<T>
        {
            return new NativePriorityHeap<T>(capacity, allocator, comparison);
        }

        public NativePriorityHeap<SpatialHeapEntry> CreateSpatialHeap(int capacity, Allocator allocator)
        {
            int heapCapacity = capacity > 0 ? capacity : _config.heapInitialCapacity;
            return new NativePriorityHeap<SpatialHeapEntry>(heapCapacity, allocator, HeapComparison.Min);
        }

        public NativePriorityHeap<PriorityHeapEntry> CreatePriorityHeap(int capacity, Allocator allocator)
        {
            int heapCapacity = capacity > 0 ? capacity : _config.heapInitialCapacity;
            var comparison = _config.defaultHeapComparison;
            return new NativePriorityHeap<PriorityHeapEntry>(heapCapacity, allocator, comparison);
        }
    }

    public static class SpatialDataStructureExtensions
    {
        public static void OptimizeForCombat(this ref KDTreeAdvanced kdTree, CombatConfiguration combatConfig)
        {
            // Apply combat-specific optimizations
        }

        public static void SetQueryParameters(this ref NativePriorityHeap<SpatialHeapEntry> heap,
            float maxRadius, int maxResults)
        {
            // Configure heap for specific query parameters
        }
    }
}