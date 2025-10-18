using System;
using System.Runtime.CompilerServices;
using Unity.Collections;
using Unity.Collections.LowLevel.Unsafe;

namespace KBVE.MMExtensions.Orchestrator.DOTS
{
    /// <summary>
    /// Burst-compatible priority heap for 2D spatial queries.
    /// Adapted from Unity DOTS samples for 2D game optimization.
    /// </summary>
    public unsafe struct NativePriorityHeap<T> : IDisposable where T : unmanaged, IComparable<T>
    {
        [NativeDisableUnsafePtrRestriction]
        private void* _buffer;
        private int _count;
        private int _capacity;
        private Allocator _allocator;

#if ENABLE_UNITY_COLLECTIONS_CHECKS
        private AtomicSafetyHandle _safety;
        [NativeSetClassTypeToNullOnSchedule]
        private DisposeSentinel _disposeSentinel;
#endif

        public NativePriorityHeap(int capacity, Allocator allocator)
        {
            _capacity = capacity;
            _allocator = allocator;
            _count = 0;

            var sizeInBytes = capacity * sizeof(T);
            _buffer = UnsafeUtility.Malloc(sizeInBytes, UnsafeUtility.AlignOf<T>(), allocator);
            UnsafeUtility.MemClear(_buffer, sizeInBytes);

#if ENABLE_UNITY_COLLECTIONS_CHECKS
            DisposeSentinel.Create(out _safety, out _disposeSentinel, 1, allocator);
#endif
        }

        public int Count
        {
            [MethodImpl(MethodImplOptions.AggressiveInlining)]
            get
            {
#if ENABLE_UNITY_COLLECTIONS_CHECKS
                AtomicSafetyHandle.CheckReadAndThrow(_safety);
#endif
                return _count;
            }
        }

        public bool IsEmpty
        {
            [MethodImpl(MethodImplOptions.AggressiveInlining)]
            get => Count == 0;
        }

        public bool IsFull
        {
            [MethodImpl(MethodImplOptions.AggressiveInlining)]
            get => Count >= _capacity;
        }

        [MethodImpl(MethodImplOptions.AggressiveInlining)]
        public void Push(T item)
        {
#if ENABLE_UNITY_COLLECTIONS_CHECKS
            AtomicSafetyHandle.CheckWriteAndThrow(_safety);
            if (_count >= _capacity)
                throw new InvalidOperationException("Priority heap is full");
#endif

            var array = (T*)_buffer;
            array[_count] = item;
            BubbleUp(_count);
            _count++;
        }

        [MethodImpl(MethodImplOptions.AggressiveInlining)]
        public T Pop()
        {
#if ENABLE_UNITY_COLLECTIONS_CHECKS
            AtomicSafetyHandle.CheckWriteAndThrow(_safety);
            if (_count <= 0)
                throw new InvalidOperationException("Priority heap is empty");
#endif

            var array = (T*)_buffer;
            var result = array[0];
            _count--;

            if (_count > 0)
            {
                array[0] = array[_count];
                BubbleDown(0);
            }

            return result;
        }

        [MethodImpl(MethodImplOptions.AggressiveInlining)]
        public T Peek()
        {
#if ENABLE_UNITY_COLLECTIONS_CHECKS
            AtomicSafetyHandle.CheckReadAndThrow(_safety);
            if (_count <= 0)
                throw new InvalidOperationException("Priority heap is empty");
#endif

            var array = (T*)_buffer;
            return array[0];
        }

        [MethodImpl(MethodImplOptions.AggressiveInlining)]
        public void Clear()
        {
#if ENABLE_UNITY_COLLECTIONS_CHECKS
            AtomicSafetyHandle.CheckWriteAndThrow(_safety);
#endif
            _count = 0;
        }

        [MethodImpl(MethodImplOptions.AggressiveInlining)]
        private void BubbleUp(int index)
        {
            var array = (T*)_buffer;

            while (index > 0)
            {
                var parentIndex = (index - 1) / 2;
                if (array[index].CompareTo(array[parentIndex]) >= 0)
                    break;

                var temp = array[index];
                array[index] = array[parentIndex];
                array[parentIndex] = temp;
                index = parentIndex;
            }
        }

        [MethodImpl(MethodImplOptions.AggressiveInlining)]
        private void BubbleDown(int index)
        {
            var array = (T*)_buffer;

            while (true)
            {
                var smallest = index;
                var leftChild = 2 * index + 1;
                var rightChild = 2 * index + 2;

                if (leftChild < _count && array[leftChild].CompareTo(array[smallest]) < 0)
                    smallest = leftChild;

                if (rightChild < _count && array[rightChild].CompareTo(array[smallest]) < 0)
                    smallest = rightChild;

                if (smallest == index)
                    break;

                var temp = array[index];
                array[index] = array[smallest];
                array[smallest] = temp;
                index = smallest;
            }
        }

        public void Dispose()
        {
#if ENABLE_UNITY_COLLECTIONS_CHECKS
            DisposeSentinel.Dispose(ref _safety, ref _disposeSentinel);
#endif
            if (_buffer != null)
            {
                UnsafeUtility.Free(_buffer, _allocator);
                _buffer = null;
            }
        }

        public bool IsCreated => _buffer != null;
    }
}