using System;
using Unity.Collections;
using Unity.Collections.LowLevel.Unsafe;
using Unity.Mathematics;

namespace KBVE.MMExtensions.Orchestrator.DOTS.Utilities
{
    public enum HeapComparison : byte
    {
        Min,
        Max
    }

    /// <summary>
    /// Unity-compatible comparison enum alias
    /// </summary>
    public enum Comparison : byte
    {
        Min = HeapComparison.Min,
        Max = HeapComparison.Max
    }

    /// <summary>
    /// High-performance priority heap for spatial queries
    /// Based on Unity's official DOTS implementation
    /// Burst-compiled and job system compatible
    /// </summary>
    [NativeContainerSupportsDeallocateOnJobCompletion]
    [NativeContainer]
    public unsafe struct NativePriorityHeap<T> : IDisposable where T : unmanaged, IComparable<T>
    {
        [NativeDisableUnsafePtrRestriction]
        T* m_Buffer;
        readonly int m_Capacity;
        readonly Allocator m_AllocatorLabel;

#if ENABLE_UNITY_COLLECTIONS_CHECKS
        AtomicSafetyHandle m_Safety;
        [NativeSetClassTypeToNullOnSchedule] DisposeSentinel m_DisposeSentinel;
#endif

        int m_NumEntries;
        readonly int m_CompareMultiplier;

        public NativePriorityHeap(int capacity, Allocator allocator, HeapComparison comparison = HeapComparison.Min)
        {
            long totalSize = UnsafeUtility.SizeOf<T>() * capacity;

#if ENABLE_UNITY_COLLECTIONS_CHECKS
            if (allocator <= Allocator.None)
                throw new ArgumentException("Allocator must be Temp, TempJob or Persistent", "allocator");
            if (capacity < 0)
                throw new ArgumentOutOfRangeException("capacity", "Capacity must be >= 0");

            DisposeSentinel.Create(out m_Safety, out m_DisposeSentinel, 0, allocator);
#endif

            m_Buffer = (T*)UnsafeUtility.Malloc(totalSize, UnsafeUtility.AlignOf<T>(), allocator);

            m_Capacity = capacity;
            m_AllocatorLabel = allocator;
            m_NumEntries = 0;

            m_CompareMultiplier = comparison == HeapComparison.Min ? 1 : -1;
        }

        /// <summary>
        /// Unity-compatible constructor overload
        /// </summary>
        public NativePriorityHeap(int capacity, Allocator allocator, Comparison comparison)
            : this(capacity, allocator, (HeapComparison)comparison)
        {
        }

        public int Count
        {
            get
            {
#if ENABLE_UNITY_COLLECTIONS_CHECKS
                AtomicSafetyHandle.CheckReadAndThrow(m_Safety);
#endif
                return m_NumEntries;
            }
        }

        public int Capacity
        {
            get
            {
#if ENABLE_UNITY_COLLECTIONS_CHECKS
                AtomicSafetyHandle.CheckReadAndThrow(m_Safety);
#endif
                return m_Capacity;
            }
        }

        public bool IsEmpty => Count == 0;
        public bool IsFull => Count == m_Capacity;

        /// <summary>
        /// Check if the heap has been created/initialized
        /// </summary>
        public bool IsCreated
        {
            get
            {
#if ENABLE_UNITY_COLLECTIONS_CHECKS
                return m_Safety.IsValid() && m_Buffer != null;
#else
                return m_Buffer != null;
#endif
            }
        }

        /// <summary>
        /// Push an element onto the heap
        /// </summary>
        public void Push(T element)
        {
#if ENABLE_UNITY_COLLECTIONS_CHECKS
            AtomicSafetyHandle.CheckWriteAndThrow(m_Safety);
            if (m_NumEntries >= m_Capacity)
                throw new InvalidOperationException("Heap is full");
#endif

            m_Buffer[m_NumEntries] = element;
            HeapifyUp(m_NumEntries);
            m_NumEntries++;
        }

        /// <summary>
        /// Pop the top element from the heap
        /// </summary>
        public T Pop()
        {
#if ENABLE_UNITY_COLLECTIONS_CHECKS
            AtomicSafetyHandle.CheckWriteAndThrow(m_Safety);
            if (m_NumEntries <= 0)
                throw new InvalidOperationException("Heap is empty");
#endif

            T result = m_Buffer[0];
            m_NumEntries--;

            if (m_NumEntries > 0)
            {
                m_Buffer[0] = m_Buffer[m_NumEntries];
                HeapifyDown(0);
            }

            return result;
        }

        /// <summary>
        /// Peek at the top element without removing it
        /// </summary>
        public T Peek()
        {
#if ENABLE_UNITY_COLLECTIONS_CHECKS
            AtomicSafetyHandle.CheckReadAndThrow(m_Safety);
            if (m_NumEntries <= 0)
                throw new InvalidOperationException("Heap is empty");
#endif
            return m_Buffer[0];
        }

        /// <summary>
        /// Clear all elements from the heap
        /// </summary>
        public void Clear()
        {
#if ENABLE_UNITY_COLLECTIONS_CHECKS
            AtomicSafetyHandle.CheckWriteAndThrow(m_Safety);
#endif
            m_NumEntries = 0;
        }

        /// <summary>
        /// Get direct access to the underlying array (advanced users only)
        /// </summary>
        public unsafe NativeArray<T> AsArray()
        {
#if ENABLE_UNITY_COLLECTIONS_CHECKS
            AtomicSafetyHandle.CheckReadAndThrow(m_Safety);
#endif
            var array = NativeArrayUnsafeUtility.ConvertExistingDataToNativeArray<T>(
                m_Buffer, m_NumEntries, m_AllocatorLabel);

#if ENABLE_UNITY_COLLECTIONS_CHECKS
            NativeArrayUnsafeUtility.SetAtomicSafetyHandle(ref array, m_Safety);
#endif
            return array;
        }

        /// <summary>
        /// Check if the heap contains a specific element (O(n) operation)
        /// </summary>
        public bool Contains(T item)
        {
#if ENABLE_UNITY_COLLECTIONS_CHECKS
            AtomicSafetyHandle.CheckReadAndThrow(m_Safety);
#endif
            for (int i = 0; i < m_NumEntries; i++)
            {
                if (m_Buffer[i].CompareTo(item) == 0)
                    return true;
            }
            return false;
        }

        /// <summary>
        /// Try to push an element. If heap is full, replace the top element if new element has higher priority
        /// </summary>
        public bool TryPushPop(T element)
        {
#if ENABLE_UNITY_COLLECTIONS_CHECKS
            AtomicSafetyHandle.CheckWriteAndThrow(m_Safety);
#endif

            if (m_NumEntries < m_Capacity)
            {
                Push(element);
                return true;
            }

            // Heap is full, check if we should replace the top element
            if (Compare(element, m_Buffer[0]) > 0)
            {
                m_Buffer[0] = element;
                HeapifyDown(0);
                return true;
            }

            return false;
        }

        private void HeapifyUp(int index)
        {
            while (index > 0)
            {
                int parent = (index - 1) / 2;
                if (Compare(m_Buffer[index], m_Buffer[parent]) >= 0)
                    break;

                // Swap with parent
                T temp = m_Buffer[index];
                m_Buffer[index] = m_Buffer[parent];
                m_Buffer[parent] = temp;

                index = parent;
            }
        }

        private void HeapifyDown(int index)
        {
            while (true)
            {
                int leftChild = 2 * index + 1;
                int rightChild = 2 * index + 2;
                int smallest = index;

                if (leftChild < m_NumEntries && Compare(m_Buffer[leftChild], m_Buffer[smallest]) < 0)
                    smallest = leftChild;

                if (rightChild < m_NumEntries && Compare(m_Buffer[rightChild], m_Buffer[smallest]) < 0)
                    smallest = rightChild;

                if (smallest == index)
                    break;

                // Swap with smallest child
                T temp = m_Buffer[index];
                m_Buffer[index] = m_Buffer[smallest];
                m_Buffer[smallest] = temp;

                index = smallest;
            }
        }

        private int Compare(T a, T b)
        {
            return a.CompareTo(b) * m_CompareMultiplier;
        }

        /// <summary>
        /// Validate heap property (for debugging/testing)
        /// </summary>
        public bool IsValidHeap()
        {
#if ENABLE_UNITY_COLLECTIONS_CHECKS
            AtomicSafetyHandle.CheckReadAndThrow(m_Safety);
#endif
            for (int i = 0; i < m_NumEntries; i++)
            {
                int leftChild = 2 * i + 1;
                int rightChild = 2 * i + 2;

                if (leftChild < m_NumEntries && Compare(m_Buffer[i], m_Buffer[leftChild]) > 0)
                    return false;

                if (rightChild < m_NumEntries && Compare(m_Buffer[i], m_Buffer[rightChild]) > 0)
                    return false;
            }
            return true;
        }

        /// <summary>
        /// Get all elements as a sorted array (creates a copy)
        /// </summary>
        public NativeArray<T> ToSortedArray(Allocator allocator)
        {
#if ENABLE_UNITY_COLLECTIONS_CHECKS
            AtomicSafetyHandle.CheckReadAndThrow(m_Safety);
#endif
            var result = new NativeArray<T>(m_NumEntries, allocator);

            // Create a temporary heap to avoid modifying original
            var tempHeap = new NativePriorityHeap<T>(m_Capacity, Allocator.Temp,
                m_CompareMultiplier == 1 ? HeapComparison.Min : HeapComparison.Max);

            // Copy all elements
            for (int i = 0; i < m_NumEntries; i++)
            {
                tempHeap.Push(m_Buffer[i]);
            }

            // Pop elements in sorted order
            for (int i = 0; i < m_NumEntries; i++)
            {
                result[i] = tempHeap.Pop();
            }

            tempHeap.Dispose();
            return result;
        }

        public void Dispose()
        {
#if ENABLE_UNITY_COLLECTIONS_CHECKS
            DisposeSentinel.Dispose(ref m_Safety, ref m_DisposeSentinel);
#endif

            if (m_Buffer != null)
            {
                UnsafeUtility.Free(m_Buffer, m_AllocatorLabel);
                m_Buffer = null;
                m_Capacity = 0;
                m_NumEntries = 0;
            }
        }
    }

    /// <summary>
    /// Helper struct for distance-based spatial queries
    /// </summary>
    public struct SpatialHeapEntry : IComparable<SpatialHeapEntry>
    {
        public float DistanceSquared;
        public Unity.Entities.Entity Entity;
        public float3 Position;

        public SpatialHeapEntry(float distanceSquared, Unity.Entities.Entity entity, float3 position)
        {
            DistanceSquared = distanceSquared;
            Entity = entity;
            Position = position;
        }

        public int CompareTo(SpatialHeapEntry other)
        {
            return DistanceSquared.CompareTo(other.DistanceSquared);
        }
    }

    /// <summary>
    /// Helper struct for priority-based queries (higher priority = lower value for min heap)
    /// </summary>
    public struct PriorityHeapEntry : IComparable<PriorityHeapEntry>
    {
        public float Priority;
        public Unity.Entities.Entity Entity;
        public int Index;

        public PriorityHeapEntry(float priority, Unity.Entities.Entity entity, int index = -1)
        {
            Priority = priority;
            Entity = entity;
            Index = index;
        }

        public int CompareTo(PriorityHeapEntry other)
        {
            return Priority.CompareTo(other.Priority);
        }
    }
}