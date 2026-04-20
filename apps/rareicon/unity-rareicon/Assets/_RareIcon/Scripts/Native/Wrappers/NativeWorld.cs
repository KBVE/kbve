using System;

namespace RareIcon.Native
{
    /// <summary>
    /// Safe wrapper around the Rust persistent-world FFI (uniti_world_*).
    ///
    /// Owns the native handle and frees it on dispose. The Rust side
    /// spawns its own background tick thread on construction; Unity never
    /// pays per-frame cost — only at chunk load/unload boundaries.
    ///
    /// All methods are thread-safe — the Rust store is internally
    /// `Arc&lt;Mutex&lt;_&gt;&gt;` so DOTS workers can call concurrently.
    /// </summary>
    public unsafe class NativeWorld : IDisposable
    {
        void* _handle;
        bool  _disposed;

        public bool IsValid => _handle != null && !_disposed;

        public NativeWorld()
        {
            _handle = Uniti.uniti_world_new();
        }

        // -- Hex queries --

        /// <summary>
        /// True if the world store has any saved state for this chunk.
        /// Cheap fast-path for chunk load — skip per-hex queries if false.
        /// </summary>
        public bool HasChunk(int cx, int cy)
        {
            return IsValid && Uniti.uniti_world_has_chunk(_handle, cx, cy) != 0;
        }

        /// <summary>
        /// Read the saved override for a hex. Returns false if no override
        /// exists (caller falls back to deterministic gen).
        /// </summary>
        public bool TryGetHex(int q, int r, out FfiHexResources res)
        {
            if (!IsValid) { res = default; return false; }
            var lookup = Uniti.uniti_world_get_hex(_handle, q, r);
            if (lookup.valid == 0) { res = default; return false; }
            res = lookup.res;
            return true;
        }

        /// <summary>
        /// Save a hex's resource state. Caller must only push hexes that
        /// actually diverged from the gen-time roll — pristine hexes
        /// should be skipped to keep the store sparse.
        /// </summary>
        public void SaveHex(int q, int r, FfiHexResources res)
        {
            if (IsValid) Uniti.uniti_world_save_hex(_handle, q, r, res);
        }

        // -- Unit queries --

        /// <summary>
        /// Push a ghost unit into the store. Chunk is derived from the
        /// unit's q/r position by the Rust side.
        /// </summary>
        public void SaveUnit(FfiGhostUnit unit)
        {
            if (IsValid) Uniti.uniti_world_save_unit(_handle, unit);
        }

        /// <summary>How many ghost units the store holds for a chunk.</summary>
        public uint UnitCountInChunk(int cx, int cy)
        {
            return IsValid ? Uniti.uniti_world_unit_count_in_chunk(_handle, cx, cy) : 0u;
        }

        /// <summary>
        /// Drain ghost units from a chunk into the caller-allocated array.
        /// Returns count actually written (≤ buffer length). Drained units
        /// are removed from the store; if the buffer is too small the
        /// remainder stays and a follow-up call drains the rest.
        /// </summary>
        public uint TakeUnitsInChunk(int cx, int cy, FfiGhostUnit[] buffer)
        {
            if (!IsValid || buffer == null || buffer.Length == 0) return 0u;
            fixed (FfiGhostUnit* ptr = buffer)
            {
                return Uniti.uniti_world_take_units_in_chunk(
                    _handle, cx, cy, ptr, (uint)buffer.Length);
            }
        }

        // -- Lifecycle --

        public void Dispose()
        {
            if (!_disposed && _handle != null)
            {
                Uniti.uniti_world_free(_handle);
                _handle   = null;
                _disposed = true;
            }
        }

        ~NativeWorld()
        {
            Dispose();
        }
    }
}
