
#pragma warning disable CS8500
#pragma warning disable CS8981
using System;
using System.Runtime.InteropServices;

namespace RareIcon.Native
{
    public static unsafe partial class Uniti
    {
#if UNITY_IOS && !UNITY_EDITOR
        const string __DllName = "__Internal";
#else
        const string __DllName = "uniti";
#endif

        [UnmanagedFunctionPointer(CallingConvention.Cdecl)]
        public delegate void uniti_world_set_log_callback_cb_delegate(byte level, byte* msg);

        /// <summary>
        ///  Stores a snapshot published by Unity. `bytes` must point to a
        ///  proto-encoded `EmpireSnapshot` of length `len`. The function copies
        ///  the bytes into Rust-owned memory, so the caller is free to release
        ///  or reuse the source buffer immediately after the call returns.
        ///
        ///  Returns `1` on success, `0` if the input is null or empty.
        ///
        ///  # Safety
        ///  `bytes` must be a valid pointer to at least `len` initialised bytes
        ///  when `len &gt; 0`.
        /// </summary>
        [DllImport(__DllName, EntryPoint = "uniti_empire_publish", CallingConvention = CallingConvention.Cdecl, ExactSpelling = true)]
        public static extern int uniti_empire_publish(byte* bytes, nuint len);

        /// <summary>
        ///  Returns the currently-stored snapshot length (in bytes) without
        ///  copying. Unity calls this first to size its receive buffer.
        /// </summary>
        [DllImport(__DllName, EntryPoint = "uniti_empire_snapshot_len", CallingConvention = CallingConvention.Cdecl, ExactSpelling = true)]
        public static extern nuint uniti_empire_snapshot_len();

        /// <summary>
        ///  Copies the latest snapshot bytes into the caller-provided buffer.
        ///  `out` must point to at least `out_cap` writable bytes; on success
        ///  the actual byte count is returned. If the buffer is too small or
        ///  no snapshot is available the function returns `0` and writes
        ///  nothing.
        ///
        ///  # Safety
        ///  `out` must be a valid pointer to at least `out_cap` writable bytes
        ///  when `out_cap &gt; 0`.
        /// </summary>
        [DllImport(__DllName, EntryPoint = "uniti_empire_take", CallingConvention = CallingConvention.Cdecl, ExactSpelling = true)]
        public static extern nuint uniti_empire_take(byte* @out, nuint out_cap);

        /// <summary>
        ///  Strategic tick. Decodes the cached snapshot, drifts each non-terminal
        ///  city's `mood` one step toward the Neutral target, recomputes
        ///  `status` against the band cutoffs, bumps `generation`, and
        ///  re-encodes. Vassal / Annexed / Razed are sticky and skipped.
        ///
        ///  Returns `1` on success, `0` when no snapshot is held or decode /
        ///  encode fails (the cache is left untouched in that case).
        /// </summary>
        [DllImport(__DllName, EntryPoint = "uniti_empire_tick", CallingConvention = CallingConvention.Cdecl, ExactSpelling = true)]
        public static extern int uniti_empire_tick();

        /// <summary>
        ///  Drops the cached snapshot — useful when a new world load wants to
        ///  start with a clean slate.
        /// </summary>
        [DllImport(__DllName, EntryPoint = "uniti_empire_reset", CallingConvention = CallingConvention.Cdecl, ExactSpelling = true)]
        public static extern void uniti_empire_reset();

        /// <summary>
        ///  Starts the tokio-driven empire ticker. Idempotent — calling twice
        ///  is a no-op. Returns `1` on success / already-running, `0` if the
        ///  platform doesn't support a real runtime (WebGL).
        /// </summary>
        [DllImport(__DllName, EntryPoint = "uniti_empire_async_start", CallingConvention = CallingConvention.Cdecl, ExactSpelling = true)]
        public static extern int uniti_empire_async_start();

        /// <summary>
        ///  Stops the tokio ticker without tearing down the runtime — leaves
        ///  the runtime warm so a subsequent start has zero spin-up cost.
        /// </summary>
        [DllImport(__DllName, EntryPoint = "uniti_empire_async_stop", CallingConvention = CallingConvention.Cdecl, ExactSpelling = true)]
        public static extern void uniti_empire_async_stop();

        /// <summary>
        ///  Create an inventory with the given slot capacity.
        ///
        ///  # Arguments
        ///
        ///  * `max_slots` — slot capacity.
        ///
        ///  # Returns
        ///
        ///  Opaque handle the caller must eventually pass to
        ///  [`uniti_inventory_free`].
        /// </summary>
        [DllImport(__DllName, EntryPoint = "uniti_inventory_new", CallingConvention = CallingConvention.Cdecl, ExactSpelling = true)]
        public static extern void* uniti_inventory_new(uint max_slots);

        /// <summary>
        ///  Free an inventory. Null-safe.
        ///
        ///  # Safety
        ///
        ///  `inv` (when non-null) must be a live handle from
        ///  [`uniti_inventory_new`] that has not yet been freed.
        /// </summary>
        [DllImport(__DllName, EntryPoint = "uniti_inventory_free", CallingConvention = CallingConvention.Cdecl, ExactSpelling = true)]
        public static extern void uniti_inventory_free(void* inv);

        /// <summary>
        ///  Add `quantity` of `item_id` to the inventory.
        ///
        ///  # Returns
        ///
        ///  Overflow count — items that did not fit (`0` = all fit). When `inv`
        ///  is null or `item_id` is unknown, returns `quantity` (nothing added).
        ///
        ///  # Safety
        ///
        ///  `inv` (when non-null) must point to a live inventory handle.
        /// </summary>
        [DllImport(__DllName, EntryPoint = "uniti_inventory_add", CallingConvention = CallingConvention.Cdecl, ExactSpelling = true)]
        public static extern uint uniti_inventory_add(void* inv, ushort item_id, uint quantity);

        /// <summary>
        ///  Remove up to `quantity` of `item_id` from the inventory.
        ///
        ///  # Returns
        ///
        ///  The amount actually removed. Returns `0` for null `inv` or unknown
        ///  `item_id`.
        ///
        ///  # Safety
        ///
        ///  `inv` (when non-null) must point to a live inventory handle.
        /// </summary>
        [DllImport(__DllName, EntryPoint = "uniti_inventory_remove", CallingConvention = CallingConvention.Cdecl, ExactSpelling = true)]
        public static extern uint uniti_inventory_remove(void* inv, ushort item_id, uint quantity);

        /// <summary>
        ///  Total quantity of `item_id` summed across all slots.
        ///
        ///  # Returns
        ///
        ///  `0` for null `inv` or unknown `item_id`.
        ///
        ///  # Safety
        ///
        ///  `inv` (when non-null) must point to a live inventory handle.
        /// </summary>
        [DllImport(__DllName, EntryPoint = "uniti_inventory_count", CallingConvention = CallingConvention.Cdecl, ExactSpelling = true)]
        public static extern uint uniti_inventory_count(void* inv, ushort item_id);

        /// <summary>
        ///  Number of occupied slots.
        ///
        ///  # Returns
        ///
        ///  Slot count, or `0` if `inv` is null.
        ///
        ///  # Safety
        ///
        ///  `inv` (when non-null) must point to a live inventory handle.
        /// </summary>
        [DllImport(__DllName, EntryPoint = "uniti_inventory_slot_count", CallingConvention = CallingConvention.Cdecl, ExactSpelling = true)]
        public static extern uint uniti_inventory_slot_count(void* inv);

        /// <summary>
        ///  Read the slot at `index`.
        ///
        ///  # Returns
        ///
        ///  [`FfiSlot`] with `valid = 1` and the stack contents on hit;
        ///  `valid = 0` (and zeroed `item_id`/`quantity`) when `inv` is null or
        ///  `index` is out of range.
        ///
        ///  # Safety
        ///
        ///  `inv` (when non-null) must point to a live inventory handle.
        /// </summary>
        [DllImport(__DllName, EntryPoint = "uniti_inventory_get_slot", CallingConvention = CallingConvention.Cdecl, ExactSpelling = true)]
        public static extern FfiSlot uniti_inventory_get_slot(void* inv, uint index);

        /// <summary>
        ///  Returns `1` if the inventory has room for `quantity` of `item_id`,
        ///  `0` otherwise (also `0` for null `inv` or unknown `item_id`).
        ///
        ///  # Safety
        ///
        ///  `inv` (when non-null) must point to a live inventory handle.
        /// </summary>
        [DllImport(__DllName, EntryPoint = "uniti_inventory_has_room", CallingConvention = CallingConvention.Cdecl, ExactSpelling = true)]
        public static extern byte uniti_inventory_has_room(void* inv, ushort item_id, uint quantity);

        /// <summary>
        ///  Swap two slots by index.
        ///
        ///  # Returns
        ///
        ///  `1` on success, `0` if `inv` is null or either index is out of range.
        ///
        ///  # Safety
        ///
        ///  `inv` (when non-null) must point to a live inventory handle.
        /// </summary>
        [DllImport(__DllName, EntryPoint = "uniti_inventory_swap", CallingConvention = CallingConvention.Cdecl, ExactSpelling = true)]
        public static extern byte uniti_inventory_swap(void* inv, uint a, uint b);

        /// <summary>
        ///  Split `quantity` items off the stack at `slot` into a new stack.
        ///
        ///  # Returns
        ///
        ///  `1` on success, `0` if `inv` is null, `slot` is out of range, or the
        ///  inventory has no free slot to receive the split.
        ///
        ///  # Safety
        ///
        ///  `inv` (when non-null) must point to a live inventory handle.
        /// </summary>
        [DllImport(__DllName, EntryPoint = "uniti_inventory_split", CallingConvention = CallingConvention.Cdecl, ExactSpelling = true)]
        public static extern byte uniti_inventory_split(void* inv, uint slot, uint quantity);

        /// <summary>
        ///  Merge slot `from` into slot `to`.
        ///
        ///  # Returns
        ///
        ///  Number of items moved. `0` for null `inv` or invalid slot indices.
        ///
        ///  # Safety
        ///
        ///  `inv` (when non-null) must point to a live inventory handle.
        /// </summary>
        [DllImport(__DllName, EntryPoint = "uniti_inventory_merge", CallingConvention = CallingConvention.Cdecl, ExactSpelling = true)]
        public static extern uint uniti_inventory_merge(void* inv, uint from, uint to);

        /// <summary>
        ///  Compact fragmented stacks (merges partial stacks of the same kind).
        ///  No-op if `inv` is null.
        ///
        ///  # Safety
        ///
        ///  `inv` (when non-null) must point to a live inventory handle.
        /// </summary>
        [DllImport(__DllName, EntryPoint = "uniti_inventory_compact", CallingConvention = CallingConvention.Cdecl, ExactSpelling = true)]
        public static extern void uniti_inventory_compact(void* inv);

        /// <summary>
        ///  Clear all items. No-op if `inv` is null.
        ///
        ///  # Safety
        ///
        ///  `inv` (when non-null) must point to a live inventory handle.
        /// </summary>
        [DllImport(__DllName, EntryPoint = "uniti_inventory_clear", CallingConvention = CallingConvention.Cdecl, ExactSpelling = true)]
        public static extern void uniti_inventory_clear(void* inv);

        /// <summary>
        ///  Create an empty grid (all cells [`SurfaceKind::Blocked`]) covering
        ///  the rectangle `(origin_x, origin_z) ..= (origin_x + width - 1,
        ///  origin_z + depth - 1)`.
        ///
        ///  # Arguments
        ///
        ///  * `origin_x` / `origin_z` — minimum block coords (inclusive).
        ///  * `width` / `depth` — region dimensions in cells.
        ///
        ///  # Returns
        ///
        ///  Opaque handle the caller must eventually pass to [`uniti_grid_free`].
        /// </summary>
        [DllImport(__DllName, EntryPoint = "uniti_grid_new", CallingConvention = CallingConvention.Cdecl, ExactSpelling = true)]
        public static extern void* uniti_grid_new(int origin_x, int origin_z, uint width, uint depth);

        /// <summary>
        ///  Set a cell in the grid. No-op if `grid` is null or `(x, z)` is out
        ///  of bounds.
        ///
        ///  # Arguments
        ///
        ///  * `grid` — handle from [`uniti_grid_new`].
        ///  * `x` / `z` — absolute block coords.
        ///  * `height` — Y coordinate of the walkable surface.
        ///  * `surface_kind` — `0 = Blocked, 1 = Solid, 2 = Slow, 3 = Hazard`.
        ///    Any other value is treated as `Blocked`.
        ///
        ///  # Safety
        ///
        ///  `grid` (when non-null) must point to a live grid handle returned by
        ///  [`uniti_grid_new`].
        /// </summary>
        [DllImport(__DllName, EntryPoint = "uniti_grid_set", CallingConvention = CallingConvention.Cdecl, ExactSpelling = true)]
        public static extern void uniti_grid_set(void* grid, int x, int z, int height, byte surface_kind);

        /// <summary>
        ///  Returns `1` if the cell at `(x, z)` is walkable, `0` otherwise.
        ///  Out-of-bounds coords and a null `grid` return `0`.
        ///
        ///  # Safety
        ///
        ///  `grid` (when non-null) must point to a live grid handle returned by
        ///  [`uniti_grid_new`].
        /// </summary>
        [DllImport(__DllName, EntryPoint = "uniti_grid_is_walkable", CallingConvention = CallingConvention.Cdecl, ExactSpelling = true)]
        public static extern byte uniti_grid_is_walkable(void* grid, int x, int z);

        /// <summary>
        ///  Free a grid allocated by [`uniti_grid_new`]. Null-safe.
        ///
        ///  # Safety
        ///
        ///  `grid` (when non-null) must be a live handle returned by
        ///  [`uniti_grid_new`] that has not yet been freed.
        /// </summary>
        [DllImport(__DllName, EntryPoint = "uniti_grid_free", CallingConvention = CallingConvention.Cdecl, ExactSpelling = true)]
        public static extern void uniti_grid_free(void* grid);

        /// <summary>
        ///  Compute a flow field toward the given goals.
        ///
        ///  # Arguments
        ///
        ///  * `grid` — handle from [`uniti_grid_new`].
        ///  * `goals_ptr` — flat array of `[x0, z0, x1, z1, ...]` block coords.
        ///  * `goal_count` — number of `(x, z)` pairs (so `2 * goal_count` i32s
        ///    total).
        ///
        ///  # Returns
        ///
        ///  Opaque flow-field handle, or null if `grid` / `goals_ptr` is null or
        ///  `goal_count == 0`. Caller must free with [`uniti_flow_free`].
        ///
        ///  # Safety
        ///
        ///  `grid` (when non-null) must point to a live grid handle. `goals_ptr`
        ///  (when non-null) must point to at least `2 * goal_count` valid `i32`
        ///  elements.
        /// </summary>
        [DllImport(__DllName, EntryPoint = "uniti_flow_compute", CallingConvention = CallingConvention.Cdecl, ExactSpelling = true)]
        public static extern void* uniti_flow_compute(void* grid, int* goals_ptr, uint goal_count);

        /// <summary>
        ///  Compute a flee field that guides AWAY from the given sources.
        ///
        ///  # Arguments
        ///
        ///  * `grid` — handle from [`uniti_grid_new`].
        ///  * `sources_ptr` — flat array of `[x0, z0, x1, z1, ...]` block coords.
        ///  * `source_count` — number of `(x, z)` pairs.
        ///
        ///  # Returns
        ///
        ///  Opaque flow-field handle, or null on invalid input. Caller must free
        ///  with [`uniti_flow_free`].
        ///
        ///  # Safety
        ///
        ///  `grid` (when non-null) must point to a live grid handle. `sources_ptr`
        ///  (when non-null) must point to at least `2 * source_count` valid `i32`
        ///  elements.
        /// </summary>
        [DllImport(__DllName, EntryPoint = "uniti_flow_compute_flee", CallingConvention = CallingConvention.Cdecl, ExactSpelling = true)]
        public static extern void* uniti_flow_compute_flee(void* grid, int* sources_ptr, uint source_count);

        /// <summary>
        ///  Query the direction at a cell.
        ///
        ///  # Returns
        ///
        ///  [`FfiDirection`] with `valid = 1` and the next-step delta when the
        ///  cell is reachable; `valid = 0` (and `dx = dz = 0`) when `field` is
        ///  null, the cell is out of bounds, or the cell is unreachable.
        ///
        ///  # Safety
        ///
        ///  `field` (when non-null) must point to a live flow-field handle
        ///  returned by [`uniti_flow_compute`] or [`uniti_flow_compute_flee`].
        /// </summary>
        [DllImport(__DllName, EntryPoint = "uniti_flow_direction", CallingConvention = CallingConvention.Cdecl, ExactSpelling = true)]
        public static extern FfiDirection uniti_flow_direction(void* field, int x, int z);

        /// <summary>
        ///  BFS distance to the nearest goal.
        ///
        ///  # Returns
        ///
        ///  The cell distance, or `u32::MAX` for out-of-bounds, unreachable, or
        ///  when `field` is null.
        ///
        ///  # Safety
        ///
        ///  `field` (when non-null) must point to a live flow-field handle.
        /// </summary>
        [DllImport(__DllName, EntryPoint = "uniti_flow_distance", CallingConvention = CallingConvention.Cdecl, ExactSpelling = true)]
        public static extern uint uniti_flow_distance(void* field, int x, int z);

        /// <summary>
        ///  Free a flow field allocated by [`uniti_flow_compute`] or
        ///  [`uniti_flow_compute_flee`]. Null-safe.
        ///
        ///  # Safety
        ///
        ///  `field` (when non-null) must be a live handle that has not yet been
        ///  freed.
        /// </summary>
        [DllImport(__DllName, EntryPoint = "uniti_flow_free", CallingConvention = CallingConvention.Cdecl, ExactSpelling = true)]
        public static extern void uniti_flow_free(void* field);

        /// <summary>
        ///  Create a new in-memory world store. Spawns the background tick
        ///  thread immediately. Use [`uniti_world_open`] instead when on-disk
        ///  persistence is needed.
        ///
        ///  # Returns
        ///
        ///  Opaque handle the caller must eventually pass to [`uniti_world_free`].
        ///
        ///  # Panics
        ///
        ///  Panics if the background `uniti-world-tick` thread fails to spawn.
        ///
        ///  # Safety
        ///
        ///  Always safe to call. Marked `unsafe` for FFI consistency with the
        ///  rest of the module.
        /// </summary>
        [DllImport(__DllName, EntryPoint = "uniti_world_new", CallingConvention = CallingConvention.Cdecl, ExactSpelling = true)]
        public static extern void* uniti_world_new();

        /// <summary>
        ///  Open a disk-backed world store. The file is created if missing;
        ///  existing rows hydrate into the in-memory cache before the function
        ///  returns so the first read after open is hot.
        ///
        ///  The background tick thread flushes dirty chunks every 30 s and on
        ///  shutdown. Call [`uniti_world_flush`] for a synchronous save (e.g.
        ///  before a risky operation or an explicit "Save Game" UI button).
        ///
        ///  # Arguments
        ///
        ///  * `path_ptr` — pointer to a UTF-8 byte string. Not required to be
        ///    null-terminated.
        ///  * `path_len` — number of bytes pointed at by `path_ptr`.
        ///
        ///  # Returns
        ///
        ///  Opaque handle the caller must eventually pass to [`uniti_world_free`].
        ///  Returns null when `path_ptr` is null, `path_len == 0`, or the bytes
        ///  are not valid UTF-8.
        ///
        ///  # Panics
        ///
        ///  Panics if the background `uniti-world-tick` thread fails to spawn.
        ///
        ///  # Safety
        ///
        ///  `path_ptr` (when non-null) must point to at least `path_len` valid
        ///  bytes. The pointer is read but not retained beyond the call.
        /// </summary>
        [DllImport(__DllName, EntryPoint = "uniti_world_open", CallingConvention = CallingConvention.Cdecl, ExactSpelling = true)]
        public static extern void* uniti_world_open(byte* path_ptr, uint path_len);

        /// <summary>
        ///  Synchronously flush every dirty chunk to the DB. No-op for
        ///  in-memory stores or a null `world`. Locks the DB briefly; safe to
        ///  call from any thread.
        ///
        ///  # Safety
        ///
        ///  `world` (when non-null) must point to a live store handle.
        /// </summary>
        [DllImport(__DllName, EntryPoint = "uniti_world_flush", CallingConvention = CallingConvention.Cdecl, ExactSpelling = true)]
        public static extern void uniti_world_flush(void* world);

        /// <summary>
        ///  Drop the store. Stops the background thread (which does a final
        ///  flush before exiting) and frees all chunk state. Null-safe.
        ///
        ///  # Safety
        ///
        ///  `world` (when non-null) must be a live handle returned by
        ///  [`uniti_world_new`] or [`uniti_world_open`] that has not yet been
        ///  freed. Calling this twice on the same handle is undefined behavior.
        /// </summary>
        [DllImport(__DllName, EntryPoint = "uniti_world_free", CallingConvention = CallingConvention.Cdecl, ExactSpelling = true)]
        public static extern void uniti_world_free(void* world);

        /// <summary>
        ///  Returns the current FFI schema version. Unity calls this once on
        ///  `WorldStoreSystem` boot and aborts if the returned value doesn't
        ///  match `UnitiSchema.Version` in the C# bindings.
        ///
        ///  # Safety
        ///
        ///  Always safe to call. Marked `unsafe` for FFI consistency.
        /// </summary>
        [DllImport(__DllName, EntryPoint = "uniti_world_schema_version", CallingConvention = CallingConvention.Cdecl, ExactSpelling = true)]
        public static extern uint uniti_world_schema_version();

        /// <summary>
        ///  Aggregate read-only counts.
        ///
        ///  # Returns
        ///
        ///  [`FfiWorldStats`] populated from the in-memory cache, or
        ///  [`FfiWorldStats::default`] (all zeros) if `world` is null or its
        ///  state lock is poisoned. Walks the in-memory `HashMap` only — no
        ///  SQLite read.
        ///
        ///  # Safety
        ///
        ///  `world` (when non-null) must point to a live store handle.
        /// </summary>
        [DllImport(__DllName, EntryPoint = "uniti_world_stats", CallingConvention = CallingConvention.Cdecl, ExactSpelling = true)]
        public static extern FfiWorldStats uniti_world_stats(void* world);

        /// <summary>
        ///  Create a zstd-compressed backup of the live SQLite DB. Flushes
        ///  pending dirty state first so the archive is a coherent snapshot.
        ///  Works only on disk-backed stores.
        ///
        ///  # Arguments
        ///
        ///  * `world` — live disk-backed store handle.
        ///  * `dst_ptr` — pointer to a UTF-8 destination path.
        ///  * `dst_len` — number of bytes pointed at by `dst_ptr`.
        ///
        ///  # Returns
        ///
        ///  `1` on success, `0` on any failure (null input, in-memory store,
        ///  invalid UTF-8, IO error, compression error).
        ///
        ///  # Safety
        ///
        ///  `world` (when non-null) must point to a live store handle. `dst_ptr`
        ///  (when non-null) must point to at least `dst_len` valid bytes.
        /// </summary>
        [DllImport(__DllName, EntryPoint = "uniti_world_archive", CallingConvention = CallingConvention.Cdecl, ExactSpelling = true)]
        public static extern byte uniti_world_archive(void* world, byte* dst_ptr, uint dst_len);

        /// <summary>
        ///  Decompress a zstd archive produced by [`uniti_world_archive`] into
        ///  the destination path. Call before [`uniti_world_open`] on the
        ///  destination to restore a save slot.
        ///
        ///  # Arguments
        ///
        ///  * `src_ptr` / `src_len` — source archive path (UTF-8 bytes).
        ///  * `dst_ptr` / `dst_len` — destination DB path (UTF-8 bytes).
        ///
        ///  # Returns
        ///
        ///  `1` on success, `0` on any failure (null input, invalid UTF-8, IO
        ///  error, decompression error).
        ///
        ///  # Safety
        ///
        ///  `src_ptr` and `dst_ptr` (when non-null) must point to at least their
        ///  respective `*_len` bytes of valid UTF-8 data.
        /// </summary>
        [DllImport(__DllName, EntryPoint = "uniti_world_restore", CallingConvention = CallingConvention.Cdecl, ExactSpelling = true)]
        public static extern byte uniti_world_restore(byte* src_ptr, uint src_len, byte* dst_ptr, uint dst_len);

        /// <summary>
        ///  Returns `1` if any state is stored for the chunk `(cx, cy)`, `0`
        ///  otherwise. Cheap fast-path for chunk-load: skip per-hex queries
        ///  entirely if `0`.
        ///
        ///  # Safety
        ///
        ///  `world` (when non-null) must point to a live store handle.
        /// </summary>
        [DllImport(__DllName, EntryPoint = "uniti_world_has_chunk", CallingConvention = CallingConvention.Cdecl, ExactSpelling = true)]
        public static extern byte uniti_world_has_chunk(void* world, int cx, int cy);

        /// <summary>
        ///  Read the saved override for a hex.
        ///
        ///  # Returns
        ///
        ///  [`FfiHexLookup`] with `valid = 1` and the stored resources on hit;
        ///  `valid = 0` (and zeroed `res`) means no override exists — the caller
        ///  falls back to deterministic gen.
        ///
        ///  # Safety
        ///
        ///  `world` (when non-null) must point to a live store handle.
        /// </summary>
        [DllImport(__DllName, EntryPoint = "uniti_world_get_hex", CallingConvention = CallingConvention.Cdecl, ExactSpelling = true)]
        public static extern FfiHexLookup uniti_world_get_hex(void* world, int q, int r);

        /// <summary>
        ///  Bulk variant of [`uniti_world_save_hex`]. Each entry upserts by
        ///  `(q, r)` like the single-record path.
        ///
        ///  # Arguments
        ///
        ///  * `world` — live store handle.
        ///  * `hexes_buf` — pointer to an array of [`FfiHexSave`] of length `count`.
        ///  * `count` — number of records.
        ///
        ///  # Safety
        ///
        ///  `world` (when non-null) must point to a live store handle.
        ///  `hexes_buf` (when non-null and `count &gt; 0`) must point to at least
        ///  `count` valid [`FfiHexSave`] values.
        /// </summary>
        [DllImport(__DllName, EntryPoint = "uniti_world_save_hexes_batch", CallingConvention = CallingConvention.Cdecl, ExactSpelling = true)]
        public static extern void uniti_world_save_hexes_batch(void* world, FfiHexSave* hexes_buf, uint count);

        /// <summary>
        ///  Save a hex's resource state.
        ///
        ///  # Arguments
        ///
        ///  * `world` — live store handle.
        ///  * `q`, `r` — hex axial coords.
        ///  * `res` — divergent resource counts to persist.
        ///
        ///  Caller is responsible for only calling this on hexes that actually
        ///  diverged from the gen-time roll — pristine hexes should stay implicit.
        ///
        ///  # Safety
        ///
        ///  `world` (when non-null) must point to a live store handle.
        /// </summary>
        [DllImport(__DllName, EntryPoint = "uniti_world_save_hex", CallingConvention = CallingConvention.Cdecl, ExactSpelling = true)]
        public static extern void uniti_world_save_hex(void* world, int q, int r, FfiHexResources res);

        /// <summary>
        ///  Push a ghost unit into the store. Chunk is derived from unit position.
        ///
        ///  # Safety
        ///
        ///  `world` (when non-null) must point to a live store handle.
        /// </summary>
        [DllImport(__DllName, EntryPoint = "uniti_world_save_unit", CallingConvention = CallingConvention.Cdecl, ExactSpelling = true)]
        public static extern void uniti_world_save_unit(void* world, FfiGhostUnit unit);

        /// <summary>
        ///  Drain ghost units in a chunk into the caller's buffer. Units that
        ///  fit are removed from the store; unwritten remainders stay until the
        ///  next call.
        ///
        ///  # Arguments
        ///
        ///  * `world` — live store handle.
        ///  * `cx`, `cy` — chunk coords.
        ///  * `out_buf` — pointer to an array of at least `cap` [`FfiGhostUnit`].
        ///  * `cap` — buffer capacity in elements.
        ///
        ///  # Returns
        ///
        ///  Number of units written.
        ///
        ///  # Safety
        ///
        ///  `world` (when non-null) must point to a live store handle. `out_buf`
        ///  (when non-null and `cap &gt; 0`) must point to at least `cap` writable
        ///  [`FfiGhostUnit`] slots.
        /// </summary>
        [DllImport(__DllName, EntryPoint = "uniti_world_take_units_in_chunk", CallingConvention = CallingConvention.Cdecl, ExactSpelling = true)]
        public static extern uint uniti_world_take_units_in_chunk(void* world, int cx, int cy, FfiGhostUnit* out_buf, uint cap);

        /// <summary>
        ///  Bulk variant of [`uniti_world_replace_chunk_units`]. Replaces every
        ///  chunk listed in `ranges_buf` in one FFI call.
        ///
        ///  # Arguments
        ///
        ///  * `world` — live store handle.
        ///  * `units_buf` — flat array of [`FfiGhostUnit`] of length `units_count`.
        ///    May be null when every range has `count = 0`.
        ///  * `units_count` — total elements in `units_buf`.
        ///  * `ranges_buf` — array of [`FfiChunkRange`] of length `ranges_count`.
        ///    Each `offset` indexes into `units_buf`; `count` is the slice length.
        ///  * `ranges_count` — number of ranges. Must be `&gt; 0` for any work to
        ///    happen.
        ///
        ///  # Safety
        ///
        ///  `world` (when non-null) must point to a live store handle.
        ///  `ranges_buf` (when `ranges_count &gt; 0`) must point to at least
        ///  `ranges_count` valid [`FfiChunkRange`] values. `units_buf` (when
        ///  non-null and `units_count &gt; 0`) must point to at least `units_count`
        ///  valid [`FfiGhostUnit`] values, and every range's
        ///  `[offset, offset + count)` slice must lie within those bounds.
        /// </summary>
        [DllImport(__DllName, EntryPoint = "uniti_world_replace_chunks_units_bulk", CallingConvention = CallingConvention.Cdecl, ExactSpelling = true)]
        public static extern void uniti_world_replace_chunks_units_bulk(void* world, FfiGhostUnit* units_buf, uint units_count, FfiChunkRange* ranges_buf, uint ranges_count);

        /// <summary>
        ///  Replace the entire unit set for a chunk. Drops every existing unit
        ///  in the chunk and writes the caller's buffer in its place.
        ///
        ///  Used during the periodic flush to push ghost-sim-advanced state back
        ///  to disk without growing duplicates — units have no stable per-record
        ///  uid in the FFI struct, so replacement is at chunk granularity.
        ///
        ///  # Arguments
        ///
        ///  * `world` — live store handle.
        ///  * `cx`, `cy` — chunk coords.
        ///  * `units_buf` — array of [`FfiGhostUnit`] of length `count`. May be
        ///    null only if `count == 0` (chunk-wipe).
        ///  * `count` — element count.
        ///
        ///  # Safety
        ///
        ///  `world` (when non-null) must point to a live store handle.
        ///  `units_buf` (when non-null and `count &gt; 0`) must point to at least
        ///  `count` valid [`FfiGhostUnit`] values.
        /// </summary>
        [DllImport(__DllName, EntryPoint = "uniti_world_replace_chunk_units", CallingConvention = CallingConvention.Cdecl, ExactSpelling = true)]
        public static extern void uniti_world_replace_chunk_units(void* world, int cx, int cy, FfiGhostUnit* units_buf, uint count);

        /// <summary>
        ///  Number of ghost units stored for a chunk. Useful for sizing the
        ///  buffer before [`uniti_world_take_units_in_chunk`].
        ///
        ///  # Returns
        ///
        ///  Unit count, or `0` if the chunk has no entry or `world` is null.
        ///
        ///  # Safety
        ///
        ///  `world` (when non-null) must point to a live store handle.
        /// </summary>
        [DllImport(__DllName, EntryPoint = "uniti_world_unit_count_in_chunk", CallingConvention = CallingConvention.Cdecl, ExactSpelling = true)]
        public static extern uint uniti_world_unit_count_in_chunk(void* world, int cx, int cy);

        /// <summary>
        ///  Total ghost units across all chunks. Use to size the buffer for
        ///  [`uniti_world_take_all_units`] at session startup.
        ///
        ///  # Safety
        ///
        ///  `world` (when non-null) must point to a live store handle.
        /// </summary>
        [DllImport(__DllName, EntryPoint = "uniti_world_total_unit_count", CallingConvention = CallingConvention.Cdecl, ExactSpelling = true)]
        public static extern uint uniti_world_total_unit_count(void* world);

        /// <summary>
        ///  Drain every ghost unit across every chunk into the caller's flat
        ///  buffer. Used at session startup to rebuild the in-memory Unloaded
        ///  unit list from on-disk state.
        ///
        ///  # Arguments
        ///
        ///  * `world` — live store handle.
        ///  * `out_buf` — pointer to an array of at least `cap` [`FfiGhostUnit`].
        ///  * `cap` — buffer capacity in elements.
        ///
        ///  # Returns
        ///
        ///  Number of units written. If the total exceeds `cap`, the leftover
        ///  units stay in the store for the next call.
        ///
        ///  # Safety
        ///
        ///  `world` (when non-null) must point to a live store handle. `out_buf`
        ///  (when non-null and `cap &gt; 0`) must point to at least `cap` writable
        ///  [`FfiGhostUnit`] slots.
        /// </summary>
        [DllImport(__DllName, EntryPoint = "uniti_world_take_all_units", CallingConvention = CallingConvention.Cdecl, ExactSpelling = true)]
        public static extern uint uniti_world_take_all_units(void* world, FfiGhostUnit* out_buf, uint cap);

        /// <summary>
        ///  Push an unloaded building into the store. Chunk is derived from the
        ///  building's root hex. Upserts by `(root_q, root_r)` so the periodic
        ///  flush re-saving every record back to disk doesn't grow duplicates.
        ///
        ///  # Safety
        ///
        ///  `world` (when non-null) must point to a live store handle.
        /// </summary>
        [DllImport(__DllName, EntryPoint = "uniti_world_save_building", CallingConvention = CallingConvention.Cdecl, ExactSpelling = true)]
        public static extern void uniti_world_save_building(void* world, FfiUnloadedBuilding building);

        /// <summary>
        ///  Number of unloaded buildings stored for a chunk. Useful for sizing
        ///  the buffer before [`uniti_world_take_buildings_in_chunk`].
        ///
        ///  # Returns
        ///
        ///  Building count, or `0` if the chunk has no entry or `world` is null.
        ///
        ///  # Safety
        ///
        ///  `world` (when non-null) must point to a live store handle.
        /// </summary>
        [DllImport(__DllName, EntryPoint = "uniti_world_building_count_in_chunk", CallingConvention = CallingConvention.Cdecl, ExactSpelling = true)]
        public static extern uint uniti_world_building_count_in_chunk(void* world, int cx, int cy);

        /// <summary>
        ///  Drain unloaded buildings in a chunk into the caller's buffer.
        ///  Buildings that fit are removed; unwritten remainders stay until the
        ///  next call.
        ///
        ///  # Arguments
        ///
        ///  * `world` — live store handle.
        ///  * `cx`, `cy` — chunk coords.
        ///  * `out_buf` — pointer to an array of at least `cap`
        ///    [`FfiUnloadedBuilding`].
        ///  * `cap` — buffer capacity in elements.
        ///
        ///  # Returns
        ///
        ///  Number of buildings written.
        ///
        ///  # Safety
        ///
        ///  `world` (when non-null) must point to a live store handle. `out_buf`
        ///  (when non-null and `cap &gt; 0`) must point to at least `cap` writable
        ///  [`FfiUnloadedBuilding`] slots.
        /// </summary>
        [DllImport(__DllName, EntryPoint = "uniti_world_take_buildings_in_chunk", CallingConvention = CallingConvention.Cdecl, ExactSpelling = true)]
        public static extern uint uniti_world_take_buildings_in_chunk(void* world, int cx, int cy, FfiUnloadedBuilding* out_buf, uint cap);

        /// <summary>
        ///  Bulk variant of [`uniti_world_save_building`]. Each entry upserts by
        ///  `(root_q, root_r)` like the single-record path.
        ///
        ///  # Arguments
        ///
        ///  * `world` — live store handle.
        ///  * `buildings_buf` — array of [`FfiUnloadedBuilding`] of length
        ///    `count`. May be null only when `count == 0`.
        ///  * `count` — element count.
        ///
        ///  # Safety
        ///
        ///  `world` (when non-null) must point to a live store handle.
        ///  `buildings_buf` (when non-null and `count &gt; 0`) must point to at
        ///  least `count` valid [`FfiUnloadedBuilding`] values.
        /// </summary>
        [DllImport(__DllName, EntryPoint = "uniti_world_save_buildings_batch", CallingConvention = CallingConvention.Cdecl, ExactSpelling = true)]
        public static extern void uniti_world_save_buildings_batch(void* world, FfiUnloadedBuilding* buildings_buf, uint count);

        /// <summary>
        ///  Total unloaded buildings across all chunks. Use to size the buffer
        ///  for [`uniti_world_take_all_buildings`].
        ///
        ///  # Safety
        ///
        ///  `world` (when non-null) must point to a live store handle.
        /// </summary>
        [DllImport(__DllName, EntryPoint = "uniti_world_total_building_count", CallingConvention = CallingConvention.Cdecl, ExactSpelling = true)]
        public static extern uint uniti_world_total_building_count(void* world);

        /// <summary>
        ///  Drain every unloaded building across every chunk into the caller's
        ///  flat buffer. Used at session startup to rebuild the in-memory
        ///  Unloaded list from on-disk state — Rust is the canonical persistence
        ///  layer; the in-memory list is a session cache. Unwritten remainders
        ///  stay until the next call.
        ///
        ///  # Arguments
        ///
        ///  * `world` — live store handle.
        ///  * `out_buf` — pointer to an array of at least `cap`
        ///    [`FfiUnloadedBuilding`].
        ///  * `cap` — buffer capacity in elements.
        ///
        ///  # Returns
        ///
        ///  Number of buildings written.
        ///
        ///  # Safety
        ///
        ///  `world` (when non-null) must point to a live store handle. `out_buf`
        ///  (when non-null and `cap &gt; 0`) must point to at least `cap` writable
        ///  [`FfiUnloadedBuilding`] slots.
        /// </summary>
        [DllImport(__DllName, EntryPoint = "uniti_world_take_all_buildings", CallingConvention = CallingConvention.Cdecl, ExactSpelling = true)]
        public static extern uint uniti_world_take_all_buildings(void* world, FfiUnloadedBuilding* out_buf, uint cap);

        [DllImport(__DllName, EntryPoint = "uniti_world_chunk_touch", CallingConvention = CallingConvention.Cdecl, ExactSpelling = true)]
        public static extern byte uniti_world_chunk_touch(void* world, int cx, int cy, ulong last_seen_ms, uint flags, uint threat_level);

        [DllImport(__DllName, EntryPoint = "uniti_world_chunk_summary", CallingConvention = CallingConvention.Cdecl, ExactSpelling = true)]
        public static extern FfiChunkSummary uniti_world_chunk_summary(void* world, int cx, int cy);

        [DllImport(__DllName, EntryPoint = "uniti_world_prefetch_neighbors", CallingConvention = CallingConvention.Cdecl, ExactSpelling = true)]
        public static extern uint uniti_world_prefetch_neighbors(void* world, int cx, int cy, FfiChunkSummary* @out, uint cap);

        [DllImport(__DllName, EntryPoint = "uniti_world_take_chunks_in_range", CallingConvention = CallingConvention.Cdecl, ExactSpelling = true)]
        public static extern uint uniti_world_take_chunks_in_range(void* world, int cx_min, int cy_min, int cx_max, int cy_max, FfiChunkSummary* @out, uint cap);

        [DllImport(__DllName, EntryPoint = "uniti_world_save_unit_aggregate", CallingConvention = CallingConvention.Cdecl, ExactSpelling = true)]
        public static extern byte uniti_world_save_unit_aggregate(void* world, FfiUnitAggregate agg);

        [DllImport(__DllName, EntryPoint = "uniti_world_take_unit_aggregates_in_chunk", CallingConvention = CallingConvention.Cdecl, ExactSpelling = true)]
        public static extern uint uniti_world_take_unit_aggregates_in_chunk(void* world, int cx, int cy, FfiUnitAggregate* @out, uint cap);

        [DllImport(__DllName, EntryPoint = "uniti_world_due_count", CallingConvention = CallingConvention.Cdecl, ExactSpelling = true)]
        public static extern uint uniti_world_due_count(void* world, ulong due_before_ms);

        [DllImport(__DllName, EntryPoint = "uniti_world_chunks_purge_stale", CallingConvention = CallingConvention.Cdecl, ExactSpelling = true)]
        public static extern uint uniti_world_chunks_purge_stale(void* world, ulong older_than_ms);

        [DllImport(__DllName, EntryPoint = "uniti_world_last_error", CallingConvention = CallingConvention.Cdecl, ExactSpelling = true)]
        public static extern byte* uniti_world_last_error();

        [DllImport(__DllName, EntryPoint = "uniti_world_clear_error", CallingConvention = CallingConvention.Cdecl, ExactSpelling = true)]
        public static extern void uniti_world_clear_error();

        [DllImport(__DllName, EntryPoint = "uniti_world_call_counts", CallingConvention = CallingConvention.Cdecl, ExactSpelling = true)]
        public static extern FfiCallCounts uniti_world_call_counts();

        [DllImport(__DllName, EntryPoint = "uniti_world_call_counts_reset", CallingConvention = CallingConvention.Cdecl, ExactSpelling = true)]
        public static extern void uniti_world_call_counts_reset();

        [DllImport(__DllName, EntryPoint = "uniti_world_chunk_touch_batch", CallingConvention = CallingConvention.Cdecl, ExactSpelling = true)]
        public static extern uint uniti_world_chunk_touch_batch(void* world, FfiChunkTouch* items, uint count);

        [DllImport(__DllName, EntryPoint = "uniti_world_save_unit_aggregate_batch", CallingConvention = CallingConvention.Cdecl, ExactSpelling = true)]
        public static extern uint uniti_world_save_unit_aggregate_batch(void* world, FfiUnitAggregate* items, uint count);

        [DllImport(__DllName, EntryPoint = "uniti_world_pause_ticker", CallingConvention = CallingConvention.Cdecl, ExactSpelling = true)]
        public static extern byte uniti_world_pause_ticker(void* world);

        [DllImport(__DllName, EntryPoint = "uniti_world_resume_ticker", CallingConvention = CallingConvention.Cdecl, ExactSpelling = true)]
        public static extern byte uniti_world_resume_ticker(void* world);

        [DllImport(__DllName, EntryPoint = "uniti_world_is_ticker_paused", CallingConvention = CallingConvention.Cdecl, ExactSpelling = true)]
        public static extern byte uniti_world_is_ticker_paused(void* world);

        [DllImport(__DllName, EntryPoint = "uniti_world_compact", CallingConvention = CallingConvention.Cdecl, ExactSpelling = true)]
        public static extern byte uniti_world_compact(void* world);

        [DllImport(__DllName, EntryPoint = "uniti_world_disk_stats", CallingConvention = CallingConvention.Cdecl, ExactSpelling = true)]
        public static extern FfiDiskStats uniti_world_disk_stats(void* world);

        [DllImport(__DllName, EntryPoint = "uniti_world_chunks_iter_open", CallingConvention = CallingConvention.Cdecl, ExactSpelling = true)]
        public static extern void* uniti_world_chunks_iter_open(void* world);

        [DllImport(__DllName, EntryPoint = "uniti_world_chunks_iter_next", CallingConvention = CallingConvention.Cdecl, ExactSpelling = true)]
        public static extern byte uniti_world_chunks_iter_next(void* iter, FfiChunkSummary* @out);

        [DllImport(__DllName, EntryPoint = "uniti_world_chunks_iter_remaining", CallingConvention = CallingConvention.Cdecl, ExactSpelling = true)]
        public static extern uint uniti_world_chunks_iter_remaining(void* iter);

        [DllImport(__DllName, EntryPoint = "uniti_world_chunks_iter_close", CallingConvention = CallingConvention.Cdecl, ExactSpelling = true)]
        public static extern void uniti_world_chunks_iter_close(void* iter);

        [DllImport(__DllName, EntryPoint = "uniti_world_abi_version", CallingConvention = CallingConvention.Cdecl, ExactSpelling = true)]
        public static extern ulong uniti_world_abi_version();

        [DllImport(__DllName, EntryPoint = "uniti_world_integrity_check", CallingConvention = CallingConvention.Cdecl, ExactSpelling = true)]
        public static extern byte uniti_world_integrity_check(void* world);

        [DllImport(__DllName, EntryPoint = "uniti_world_open_readonly", CallingConvention = CallingConvention.Cdecl, ExactSpelling = true)]
        public static extern void* uniti_world_open_readonly(byte* path_ptr, uint path_len);

        [DllImport(__DllName, EntryPoint = "uniti_world_schema_counts", CallingConvention = CallingConvention.Cdecl, ExactSpelling = true)]
        public static extern FfiSchemaCounts uniti_world_schema_counts(void* world);

        [DllImport(__DllName, EntryPoint = "uniti_world_export_chunk_json", CallingConvention = CallingConvention.Cdecl, ExactSpelling = true)]
        public static extern uint uniti_world_export_chunk_json(void* world, int cx, int cy, byte* out_buf, uint cap);

        [DllImport(__DllName, EntryPoint = "uniti_world_set_log_callback", CallingConvention = CallingConvention.Cdecl, ExactSpelling = true)]
        public static extern void uniti_world_set_log_callback(uniti_world_set_log_callback_cb_delegate cb);

    }

    /// <summary>
    ///  Slot data returned to C#. `valid = 0` indicates an empty or
    ///  out-of-range slot.
    /// </summary>
    [StructLayout(LayoutKind.Sequential)]
    public unsafe partial struct FfiSlot
    {
        public ushort item_id;
        public uint quantity;
        public byte valid;
    }

    /// <summary>
    ///  Direction sample returned by [`uniti_flow_direction`].
    ///
    ///  `valid = 0` means the cell has no resolved direction (out of bounds,
    ///  blocked, or equidistant from all goals). `valid = 1` means `(dx, dz)`
    ///  is the next-step delta with each component in `-1..=1`.
    /// </summary>
    [StructLayout(LayoutKind.Sequential)]
    public unsafe partial struct FfiDirection
    {
        public int dx;
        public int dz;
        public byte valid;
    }

    /// <summary>
    ///  Per-hex resource amounts. Mirrors the C# `HexResources` struct exactly.
    /// </summary>
    [StructLayout(LayoutKind.Sequential)]
    public unsafe partial struct FfiHexResources
    {
        public byte wood;
        public byte stone;
        public byte berries;
        public byte mushrooms;
        public byte herbs;
        public byte cactus;
        public byte cactus_variant;
    }

    /// <summary>
    ///  Result of [`uniti_world_get_hex`]. `valid = 0` means no override is
    ///  stored — the caller falls back to deterministic world-gen.
    /// </summary>
    [StructLayout(LayoutKind.Sequential)]
    public unsafe partial struct FfiHexLookup
    {
        public byte valid;
        public FfiHexResources res;
    }

    /// <summary>
    ///  Abstract state of a unit that lived in an unloaded chunk. Position is
    ///  in hex-axial coords; the owning chunk is derived as
    ///  `(q.div_euclid(CHUNK_SIZE), r.div_euclid(CHUNK_SIZE))`.
    ///
    ///  Inventory carries the first 4 slots only — matches the HUD snapshot
    ///  shape and keeps the FFI struct flat (~50 bytes per unit).
    ///
    ///  `last_tick_secs` is the `WorldClock.AbsSeconds` value at snapshot
    ///  time; the background ticker subtracts to compute elapsed.
    /// </summary>
    [StructLayout(LayoutKind.Sequential)]
    public unsafe partial struct FfiGhostUnit
    {
        public byte unit_type;
        public int q;
        public int r;
        public float health;
        public float max_health;
        public ushort inv0_id;
        public ushort inv0_qty;
        public ushort inv1_id;
        public ushort inv1_qty;
        public ushort inv2_id;
        public ushort inv2_qty;
        public ushort inv3_id;
        public ushort inv3_qty;
        public float hunger;
        public float hunger_max;
        public float hunger_per_second;
        public float fatigue;
        public float fatigue_max;
        public float fatigue_per_second;
        public float energy;
        public float energy_max;
        public float energy_per_second;
        public float last_tick_secs;
        public float attack_damage;
        public float attack_range;
        public float attack_cooldown;
        public float time_since_attack;
        public byte attack_kind;
        public byte target_mode;
    }

    /// <summary>
    ///  Mirror of the C# `UnloadedBuildingRecord`. Field order + types must
    ///  match the C# struct exactly so `#[repr(C)]` and the C# default layout
    ///  agree on padding. Bump [`UNITI_FFI_SCHEMA_VERSION`] when this layout
    ///  changes.
    ///
    ///  Inline ledger slots cap at 4 items; overflow truncates (acceptable
    ///  loss for offline state since real-world buildings rarely exceed 4
    ///  unique SKUs).
    /// </summary>
    [StructLayout(LayoutKind.Sequential)]
    public unsafe partial struct FfiUnloadedBuilding
    {
        public byte building_type;
        public int root_q;
        public int root_r;
        public byte owner_faction;
        public ushort health;
        public ushort health_max;
        public byte tier;
        public uint last_tick_turn;
        public float accrued_production;
        public float accrued_input;
        public byte flags;
        public float recipe_cycle_remaining;
        public ushort slot0_id;
        public ushort slot0_count;
        public ushort slot1_id;
        public ushort slot1_count;
        public ushort slot2_id;
        public ushort slot2_count;
        public ushort slot3_id;
        public ushort slot3_count;
        public float attack_damage;
        public float attack_range;
        public float attack_cooldown;
        public float time_since_attack;
        public byte attack_kind;
        public byte target_mode;
    }

    /// <summary>
    ///  Summary of the world store's in-memory cache.
    ///
    ///  `last_flush_micros` is the wall-clock duration of the most recent
    ///  flush (sum of SQLite write batches, in microseconds).
    ///  `total_flushes` is a session-monotonic counter — UI / dev panels
    ///  derive cadence + flush rate from these without polling timing.
    /// </summary>
    [StructLayout(LayoutKind.Sequential)]
    public unsafe partial struct FfiWorldStats
    {
        public uint chunks;
        public uint hexes;
        public uint units;
        public uint buildings;
        public uint dirty_chunks;
        public uint dirty_hexes;
        public ulong last_flush_micros;
        public ulong total_flushes;
    }

    /// <summary>
    ///  One hex divergence record for [`uniti_world_save_hexes_batch`].
    /// </summary>
    [StructLayout(LayoutKind.Sequential)]
    public unsafe partial struct FfiHexSave
    {
        public int q;
        public int r;
        public FfiHexResources res;
    }

    /// <summary>
    ///  One slice of [`FfiGhostUnit`]s belonging to chunk `(cx, cy)`. Used by
    ///  [`uniti_world_replace_chunks_units_bulk`] to replace many chunks in
    ///  one FFI call.
    /// </summary>
    [StructLayout(LayoutKind.Sequential)]
    public unsafe partial struct FfiChunkRange
    {
        public int cx;
        public int cy;
        public uint offset;
        public uint count;
    }

    [StructLayout(LayoutKind.Sequential)]
    public unsafe partial struct FfiChunkSummary
    {
        public int cx;
        public int cy;
        public ulong last_seen_ms;
        public ulong last_tick_ms;
        public uint flags;
        public uint threat_level;
        public uint unit_count;
        public uint building_count;
        public uint aggregate_count;
        public byte valid;
    }

    [StructLayout(LayoutKind.Sequential)]
    public unsafe partial struct FfiUnitAggregate
    {
        public int cx;
        public int cy;
        public byte unit_type;
        public uint count;
        public float avg_health;
        public float hunger_pool;
        public float last_tick_secs;
    }

    [StructLayout(LayoutKind.Sequential)]
    public unsafe partial struct FfiCallCounts
    {
        public ulong chunk_touch;
        public ulong chunk_summary;
        public ulong prefetch_neighbors;
        public ulong take_chunks_range;
        public ulong save_aggregate;
        public ulong take_aggregates;
        public ulong due_count;
        public ulong purge_stale;
        public ulong chunk_touch_batch;
        public ulong save_aggregate_batch;
    }

    [StructLayout(LayoutKind.Sequential)]
    public unsafe partial struct FfiChunkTouch
    {
        public int cx;
        public int cy;
        public ulong last_seen_ms;
        public uint flags;
        public uint threat_level;
    }

    [StructLayout(LayoutKind.Sequential)]
    public unsafe partial struct FfiDiskStats
    {
        public uint page_size_bytes;
        public ulong page_count;
        public ulong freelist_count;
        public ulong wal_pages;
        public ulong disk_size_bytes;
        public byte valid;
    }

    [StructLayout(LayoutKind.Sequential)]
    public unsafe partial struct FfiSchemaCounts
    {
        public ulong hexes;
        public ulong units;
        public ulong buildings;
        public ulong chunks;
        public ulong unit_aggregates;
        public uint schema_version;
        public byte valid;
    }

}
