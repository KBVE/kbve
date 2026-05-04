using System;

namespace RareIcon.Native
{
    /// <summary>Managed wrapper around the Rust uniti_grid_* FFI. Owns a native grid handle covering a fixed rectangular region; cells default to <see cref="SurfaceKind.Blocked"/> and the caller paints walkability via <see cref="SetCell"/>. Used as the input topology for <see cref="NativeFlowField"/> BFS computes — typically rebuilt on world layout changes (building placement, demolition) and reused across many flow computes.</summary>
    public unsafe class NativeGrid : IDisposable
    {
        public enum SurfaceKind : byte
        {
            Blocked = 0,
            Solid   = 1,
            Slow    = 2,
            Hazard  = 3,
        }

        void* _handle;
        bool  _disposed;

        public bool IsValid => _handle != null && !_disposed;
        public int  OriginX { get; }
        public int  OriginZ { get; }
        public int  Width   { get; }
        public int  Depth   { get; }

        internal void* Handle => _handle;

        NativeGrid(void* handle, int originX, int originZ, int width, int depth)
        {
            _handle = handle;
            OriginX = originX;
            OriginZ = originZ;
            Width   = width;
            Depth   = depth;
        }

        /// <summary>Allocate a grid covering <c>(originX, originZ)..=(originX+width-1, originZ+depth-1)</c>. All cells start <see cref="SurfaceKind.Blocked"/>.</summary>
        public static NativeGrid Create(int originX, int originZ, int width, int depth)
        {
            if (width <= 0 || depth <= 0) return null;
            var handle = Uniti.uniti_grid_new(originX, originZ, (uint)width, (uint)depth);
            if (handle == null) return null;
            return new NativeGrid(handle, originX, originZ, width, depth);
        }

        public void SetCell(int x, int z, int height, SurfaceKind kind)
        {
            if (!IsValid) return;
            Uniti.uniti_grid_set(_handle, x, z, height, (byte)kind);
        }

        public bool IsWalkable(int x, int z)
        {
            if (!IsValid) return false;
            return Uniti.uniti_grid_is_walkable(_handle, x, z) != 0;
        }

        public void Dispose()
        {
            if (!_disposed && _handle != null)
            {
                Uniti.uniti_grid_free(_handle);
                _handle   = null;
                _disposed = true;
            }
        }

        ~NativeGrid()
        {
            Dispose();
        }
    }
}
