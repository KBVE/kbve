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
        /// <summary>FFI struct schema version. Must match <c>UNITI_FFI_SCHEMA_VERSION</c> in <c>packages/rust/bevy/uniti/src/ffi_world.rs</c>. Bumped together when any blittable struct layout changes.</summary>
        public const uint ExpectedSchemaVersion = 3;

        void* _handle;
        bool  _disposed;

        public bool IsValid => _handle != null && !_disposed;

        /// <summary>Asks the dylib for its FFI struct schema version. Caller compares against <see cref="ExpectedSchemaVersion"/> on bootstrap; mismatch means the Rust + C# struct layouts have drifted (rebuild the dylib + regen bindings).</summary>
        public static uint NativeSchemaVersion()
        {
            try { return Uniti.uniti_world_schema_version(); }
            catch { return 0; }
        }

        /// <summary>In-memory store only. State lives for the process lifetime; no disk persistence. Use <see cref="OpenAtPath"/> for the disk-backed path.</summary>
        public NativeWorld()
        {
            _handle = Uniti.uniti_world_new();
        }

        /// <summary>Disk-backed store. Opens (or creates) a SQLite database at <paramref name="path"/>, hydrates the in-memory cache from existing rows, and starts the background flush ticker. Flushes every 30 s automatically; call <see cref="Flush"/> for synchronous saves.</summary>
        public static NativeWorld OpenAtPath(string path)
        {
            if (string.IsNullOrEmpty(path)) return null;
            var bytes = System.Text.Encoding.UTF8.GetBytes(path);
            fixed (byte* ptr = bytes)
            {
                var handle = Uniti.uniti_world_open(ptr, (uint)bytes.Length);
                if (handle == null) return null;
                return new NativeWorld(handle);
            }
        }

        NativeWorld(void* handle)
        {
            _handle = handle;
        }

        /// <summary>Synchronously flush every dirty chunk to the SQLite database. No-op on in-memory stores. Safe to call from any thread; the Rust side locks the DB briefly.</summary>
        public void Flush()
        {
            if (IsValid) Uniti.uniti_world_flush(_handle);
        }

        /// <summary>Read-only aggregate counts for UI / save-selection screens. Returns default (all zeros) if the handle is invalid.</summary>
        public FfiWorldStats GetStats()
        {
            if (!IsValid) return default;
            return Uniti.uniti_world_stats(_handle);
        }

        /// <summary>Flush + write a zstd-compressed backup to <paramref name="dstPath"/>. Use for save-slot archives + cloud sync. Returns true on success.</summary>
        public bool Archive(string dstPath)
        {
            if (!IsValid || string.IsNullOrEmpty(dstPath)) return false;
            var bytes = System.Text.Encoding.UTF8.GetBytes(dstPath);
            fixed (byte* ptr = bytes)
            {
                return Uniti.uniti_world_archive(_handle, ptr, (uint)bytes.Length) != 0;
            }
        }

        /// <summary>Decompress a zstd archive at <paramref name="srcPath"/> into a plain SQLite DB at <paramref name="dstDbPath"/>. Static helper — call BEFORE <see cref="OpenAtPath"/> on the destination so the restored DB hydrates into the new store. Returns true on success.</summary>
        public static bool Restore(string srcPath, string dstDbPath)
        {
            if (string.IsNullOrEmpty(srcPath) || string.IsNullOrEmpty(dstDbPath)) return false;
            var srcBytes = System.Text.Encoding.UTF8.GetBytes(srcPath);
            var dstBytes = System.Text.Encoding.UTF8.GetBytes(dstDbPath);
            fixed (byte* s = srcBytes)
            fixed (byte* d = dstBytes)
            {
                return Uniti.uniti_world_restore(s, (uint)srcBytes.Length, d, (uint)dstBytes.Length) != 0;
            }
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
        /// <summary>Total ghost units across all chunks. Use to size the buffer for <see cref="TakeAllUnits"/> at session startup.</summary>
        public uint TotalUnitCount()
        {
            return IsValid ? Uniti.uniti_world_total_unit_count(_handle) : 0u;
        }

        /// <summary>Replace every ghost unit in (cx, cy) with the caller's buffer. Drops the existing unit set for that chunk first. Pass length=0 to wipe the chunk's unit set entirely.</summary>
        public void ReplaceChunkUnits(int cx, int cy, FfiGhostUnit[] buffer, int length)
        {
            if (!IsValid) return;
            if (length < 0) length = 0;
            if (buffer != null && length > 0)
            {
                fixed (FfiGhostUnit* ptr = buffer)
                {
                    Uniti.uniti_world_replace_chunk_units(_handle, cx, cy, ptr, (uint)length);
                }
            }
            else
            {
                Uniti.uniti_world_replace_chunk_units(_handle, cx, cy, null, 0u);
            }
        }

        /// <summary>Drain every ghost unit from every chunk into the caller-allocated buffer. Returns count actually written. Use once at session startup to seed the in-memory Unloaded unit list from the persistent SQLite store.</summary>
        public uint TakeAllUnits(FfiGhostUnit[] buffer)
        {
            if (!IsValid || buffer == null || buffer.Length == 0) return 0u;
            fixed (FfiGhostUnit* ptr = buffer)
            {
                return Uniti.uniti_world_take_all_units(
                    _handle, ptr, (uint)buffer.Length);
            }
        }

        public uint TakeUnitsInChunk(int cx, int cy, FfiGhostUnit[] buffer)
        {
            if (!IsValid || buffer == null || buffer.Length == 0) return 0u;
            fixed (FfiGhostUnit* ptr = buffer)
            {
                return Uniti.uniti_world_take_units_in_chunk(
                    _handle, cx, cy, ptr, (uint)buffer.Length);
            }
        }

        // -- Building ghost persistence --

        /// <summary>Push an unloaded building into the store. Chunk is derived from the building's root hex by the Rust side via the same floor-div math as units + hexes.</summary>
        public void SaveBuilding(FfiUnloadedBuilding building)
        {
            if (IsValid) Uniti.uniti_world_save_building(_handle, building);
        }

        /// <summary>Bulk push N buildings in a single FFI call. Each upserts by root hex. Use during periodic flush to drop N FFI hops to 1.</summary>
        public void SaveBuildingsBatch(FfiUnloadedBuilding[] buffer, int length)
        {
            if (!IsValid || buffer == null || length <= 0) return;
            fixed (FfiUnloadedBuilding* ptr = buffer)
            {
                Uniti.uniti_world_save_buildings_batch(_handle, ptr, (uint)length);
            }
        }

        /// <summary>Bulk replace units across many chunks in one FFI call. <paramref name="ranges"/> indexes into <paramref name="units"/> via offset+count per chunk.</summary>
        public void ReplaceChunksUnitsBulk(FfiGhostUnit[] units, int unitsCount, FfiChunkRange[] ranges, int rangesCount)
        {
            if (!IsValid || ranges == null || rangesCount <= 0) return;
            fixed (FfiChunkRange* rangesPtr = ranges)
            {
                if (units != null && unitsCount > 0)
                {
                    fixed (FfiGhostUnit* unitsPtr = units)
                    {
                        Uniti.uniti_world_replace_chunks_units_bulk(
                            _handle, unitsPtr, (uint)unitsCount, rangesPtr, (uint)rangesCount);
                    }
                }
                else
                {
                    Uniti.uniti_world_replace_chunks_units_bulk(
                        _handle, null, 0u, rangesPtr, (uint)rangesCount);
                }
            }
        }

        /// <summary>Bulk save divergent hexes in one FFI call. Each upserts by (q, r).</summary>
        public void SaveHexesBatch(FfiHexSave[] buffer, int length)
        {
            if (!IsValid || buffer == null || length <= 0) return;
            fixed (FfiHexSave* ptr = buffer)
            {
                Uniti.uniti_world_save_hexes_batch(_handle, ptr, (uint)length);
            }
        }

        /// <summary>How many unloaded buildings the store holds for a chunk.</summary>
        public uint BuildingCountInChunk(int cx, int cy)
        {
            return IsValid ? Uniti.uniti_world_building_count_in_chunk(_handle, cx, cy) : 0u;
        }

        /// <summary>Drain unloaded buildings from a chunk into the caller-allocated array. Returns count actually written (≤ buffer length). Drained records are removed from the store; if the buffer is too small the remainder stays and a follow-up call drains the rest.</summary>
        public uint TakeBuildingsInChunk(int cx, int cy, FfiUnloadedBuilding[] buffer)
        {
            if (!IsValid || buffer == null || buffer.Length == 0) return 0u;
            fixed (FfiUnloadedBuilding* ptr = buffer)
            {
                return Uniti.uniti_world_take_buildings_in_chunk(
                    _handle, cx, cy, ptr, (uint)buffer.Length);
            }
        }

        /// <summary>Total buildings across all chunks in the store. Use to size the buffer for <see cref="TakeAllBuildings"/> at session startup.</summary>
        public uint TotalBuildingCount()
        {
            return IsValid ? Uniti.uniti_world_total_building_count(_handle) : 0u;
        }

        /// <summary>Drain every unloaded building from every chunk into the caller-allocated buffer. Returns count actually written. Use once at session startup to seed the in-memory Unloaded list from the persistent SQLite store. Buildings that fit are removed; oversize remainders stay until the next call.</summary>
        public uint TakeAllBuildings(FfiUnloadedBuilding[] buffer)
        {
            if (!IsValid || buffer == null || buffer.Length == 0) return 0u;
            fixed (FfiUnloadedBuilding* ptr = buffer)
            {
                return Uniti.uniti_world_take_all_buildings(
                    _handle, ptr, (uint)buffer.Length);
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
