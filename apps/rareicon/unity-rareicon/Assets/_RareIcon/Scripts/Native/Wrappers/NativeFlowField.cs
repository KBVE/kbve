using System;
using Unity.Collections;
using Unity.Collections.LowLevel.Unsafe;
using Unity.Mathematics;

namespace RareIcon.Native
{
    /// <summary>Managed wrapper around the Rust uniti_flow_* FFI. Owns a flow-field handle computed via multi-source BFS over a <see cref="NativeGrid"/>; immutable after construction (Rust side does not mutate the field, only frees it). Read methods (<see cref="Distance"/>, <see cref="Direction"/>) are safe to call from worker threads concurrently. Use <see cref="Compute"/> for goal-seeking flows ("nearest healer") and <see cref="ComputeFlee"/> for source-avoiding flows (run from raid bandits).</summary>
    public unsafe class NativeFlowField : IDisposable
    {
        public const uint Unreachable = uint.MaxValue;

        void* _handle;
        bool  _disposed;

        public bool IsValid => _handle != null && !_disposed;

        internal void* Handle => _handle;

        NativeFlowField(void* handle) { _handle = handle; }

        /// <summary>Multi-source BFS toward each <paramref name="goals"/> cell. Returns null if the grid is invalid or the goal list is empty. Each goal is an axial/grid <c>(x, z)</c> pair flattened to <c>int*</c> for the FFI call.</summary>
        public static NativeFlowField Compute(NativeGrid grid, NativeArray<int2> goals)
        {
            if (grid == null || !grid.IsValid) return null;
            if (!goals.IsCreated || goals.Length == 0) return null;
            return ComputeInternal(grid.Handle, goals, flowingTo: true);
        }

        /// <summary>Reverse flow — distance/direction guides AWAY from each source. Used for unit "flee from raid bandit" pathing.</summary>
        public static NativeFlowField ComputeFlee(NativeGrid grid, NativeArray<int2> sources)
        {
            if (grid == null || !grid.IsValid) return null;
            if (!sources.IsCreated || sources.Length == 0) return null;
            return ComputeInternal(grid.Handle, sources, flowingTo: false);
        }

        static NativeFlowField ComputeInternal(void* gridHandle, NativeArray<int2> points, bool flowingTo)
        {
            int n = points.Length;
            int* ptr = (int*)points.GetUnsafeReadOnlyPtr();
            void* handle = flowingTo
                ? Uniti.uniti_flow_compute(gridHandle, ptr, (uint)n)
                : Uniti.uniti_flow_compute_flee(gridHandle, ptr, (uint)n);
            if (handle == null) return null;
            return new NativeFlowField(handle);
        }

        /// <summary>Cell distance to nearest goal (or source for flee fields). <see cref="Unreachable"/> if the cell is out of bounds, blocked, or the grid was empty.</summary>
        public uint Distance(int x, int z)
        {
            if (!IsValid) return Unreachable;
            return Uniti.uniti_flow_distance(_handle, x, z);
        }

        public uint Distance(int2 hex) => Distance(hex.x, hex.y);

        public bool TryDirection(int x, int z, out int2 step)
        {
            step = default;
            if (!IsValid) return false;
            var dir = Uniti.uniti_flow_direction(_handle, x, z);
            if (dir.valid == 0) return false;
            step = new int2(dir.dx, dir.dz);
            return true;
        }

        public bool TryDirection(int2 hex, out int2 step) => TryDirection(hex.x, hex.y, out step);

        public void Dispose()
        {
            if (!_disposed && _handle != null)
            {
                Uniti.uniti_flow_free(_handle);
                _handle   = null;
                _disposed = true;
            }
        }

        ~NativeFlowField()
        {
            Dispose();
        }
    }
}
