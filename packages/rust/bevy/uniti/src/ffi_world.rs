// FFI bridge for the persistent world store (Unity / C# consumer).
//
// Owns ghost-chunk state for hexes and units that have diverged from
// deterministic world-gen, so unloaded chunks aren't lost when their
// entities are destroyed. A background thread ticks abstract simulation
// for ghost units (walk + harvest) every 10s without touching the main
// Unity thread.
//
// Shared safety contract for `pub unsafe extern "C" fn` items is
// documented at the crate root (src/lib.rs).

use std::collections::HashMap;
use std::ffi::c_void;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::thread::{self, JoinHandle};
use std::time::Duration;

// ---------------------------------------------------------------------------
// FFI struct shapes — flat, repr(C), no nested pointers
// ---------------------------------------------------------------------------

/// Per-hex resource amounts, mirrors the C# HexResources struct exactly.
#[repr(C)]
#[derive(Debug, Clone, Copy, Default)]
pub struct FfiHexResources {
    pub wood: u8,
    pub stone: u8,
    pub berries: u8,
    pub mushrooms: u8,
    pub herbs: u8,
    pub cactus: u8,
    pub cactus_variant: u8,
}

/// Result of `uniti_world_get_hex` — `valid=0` means "no override stored,
/// caller should fall back to deterministic gen".
#[repr(C)]
#[derive(Debug, Clone, Copy, Default)]
pub struct FfiHexLookup {
    pub valid: u8,
    pub res: FfiHexResources,
}

/// A ghost unit — abstract state of a unit that lived in an unloaded chunk.
/// Position is in hex-axial coords; the chunk it belongs to is derived by
/// the caller (currently `chunk = floor(q / 32), floor(r / 32)`).
///
/// Inventory carries the first 4 slots only — matches the HUD snapshot
/// shape and keeps the FFI struct flat (~50 bytes per unit).
#[repr(C)]
#[derive(Debug, Clone, Copy, Default)]
pub struct FfiGhostUnit {
    pub unit_type: u8,
    pub q: i32,
    pub r: i32,
    pub health: f32,
    pub max_health: f32,
    pub inv0_id: u16,
    pub inv0_qty: u16,
    pub inv1_id: u16,
    pub inv1_qty: u16,
    pub inv2_id: u16,
    pub inv2_qty: u16,
    pub inv3_id: u16,
    pub inv3_qty: u16,
}

// ---------------------------------------------------------------------------
// Internal store — Arc<Mutex<>> shared between FFI calls and background tick
// ---------------------------------------------------------------------------

/// Hex coord key. Using a tuple instead of a struct to keep HashMap
/// hashing trivial and avoid deriving on FFI types.
type HexKey = (i32, i32);

/// Chunk coord key. Same shape — separate alias for clarity at call sites.
type ChunkKey = (i32, i32);

/// What we actually own for a chunk. Only chunks with diverged state get an
/// entry — pristine chunks stay implicit (deterministic gen at load time).
#[derive(Default)]
struct ChunkData {
    /// Hexes in this chunk whose resource counts diverged from the gen
    /// table. Keyed by global (q, r) so reads don't have to translate.
    hexes: HashMap<HexKey, FfiHexResources>,
    /// Units known to be in this chunk while it's unloaded.
    units: Vec<FfiGhostUnit>,
}

#[derive(Default)]
struct WorldState {
    chunks: HashMap<ChunkKey, ChunkData>,
}

/// Owned by the FFI handle. Background thread holds a clone of `state` and
/// `running` and exits when `running` flips false.
pub struct WorldStore {
    state: Arc<Mutex<WorldState>>,
    running: Arc<AtomicBool>,
    ticker: Option<JoinHandle<()>>,
}

// Hex chunk size — must match C# HexChunkSystem.ChunkSize.
// Hard-coded for v1; if it ever needs to be configurable, expose a
// `uniti_world_new_with_chunk_size` constructor instead of plumbing it
// through every per-hex call.
const CHUNK_SIZE: i32 = 32;

/// Returns the chunk that owns a hex coordinate.
/// Floor division so negative coords land in the right chunk.
fn chunk_of(q: i32, r: i32) -> ChunkKey {
    (q.div_euclid(CHUNK_SIZE), r.div_euclid(CHUNK_SIZE))
}

impl WorldStore {
    fn new() -> Self {
        let state = Arc::new(Mutex::new(WorldState::default()));
        let running = Arc::new(AtomicBool::new(true));

        // Background ticker — runs abstract sim for ghost units every 10s.
        // v1 stub: just sleeps so shutdown is responsive. Real abstract
        // goblin behavior (walk + harvest) lands in a follow-up commit
        // once the FFI surface is exercised end-to-end. The `state` Arc
        // gets cloned into the thread when that lands.
        let running_for_thread = Arc::clone(&running);
        let ticker = thread::Builder::new()
            .name("uniti-world-tick".into())
            .spawn(move || {
                // Wake every 100ms so a shutdown signal is observed within
                // ~100ms of `Drop` setting `running = false`.
                while running_for_thread.load(Ordering::Relaxed) {
                    thread::sleep(Duration::from_millis(100));
                }
            })
            .expect("spawn uniti-world-tick");

        Self {
            state,
            running,
            ticker: Some(ticker),
        }
    }
}

impl Drop for WorldStore {
    fn drop(&mut self) {
        self.running.store(false, Ordering::Relaxed);
        if let Some(handle) = self.ticker.take() {
            // Best-effort join — if the thread panicked the store is
            // being torn down anyway, nothing useful to recover.
            let _ = handle.join();
        }
    }
}

// ---------------------------------------------------------------------------
// Handle conversion helpers — same shape as ffi_inventory
// ---------------------------------------------------------------------------

unsafe fn to_world<'a>(ptr: *const c_void) -> Option<&'a WorldStore> {
    if ptr.is_null() {
        None
    } else {
        Some(unsafe { &*(ptr as *const WorldStore) })
    }
}

unsafe fn to_world_mut<'a>(ptr: *mut c_void) -> Option<&'a mut WorldStore> {
    if ptr.is_null() {
        None
    } else {
        Some(unsafe { &mut *(ptr as *mut WorldStore) })
    }
}

// ---------------------------------------------------------------------------
// Lifecycle
// ---------------------------------------------------------------------------

/// Create a new world store. Spawns a background tick thread immediately.
/// Returns an opaque handle the caller must eventually pass to
/// `uniti_world_free`. Returns null only if thread spawn fails.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn uniti_world_new() -> *mut c_void {
    let store = Box::new(WorldStore::new());
    Box::into_raw(store) as *mut c_void
}

/// Drop the store. Stops the background thread and frees all chunk state.
/// Calling this twice on the same handle is undefined behavior.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn uniti_world_free(world: *mut c_void) {
    if world.is_null() {
        return;
    }
    drop(unsafe { Box::from_raw(world as *mut WorldStore) });
}

// ---------------------------------------------------------------------------
// Hex queries
// ---------------------------------------------------------------------------

/// Returns 1 if any state is stored for the chunk that owns this hex.
/// Cheap fast-path for chunk-load: skip the per-hex queries entirely if 0.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn uniti_world_has_chunk(world: *const c_void, cx: i32, cy: i32) -> u8 {
    let world = match unsafe { to_world(world) } {
        Some(w) => w,
        None => return 0,
    };
    let state = match world.state.lock() {
        Ok(s) => s,
        Err(_) => return 0,
    };
    if state.chunks.contains_key(&(cx, cy)) {
        1
    } else {
        0
    }
}

/// Read the saved override for a hex. `valid=0` means no override exists
/// (caller falls back to deterministic gen).
#[unsafe(no_mangle)]
pub unsafe extern "C" fn uniti_world_get_hex(world: *const c_void, q: i32, r: i32) -> FfiHexLookup {
    let world = match unsafe { to_world(world) } {
        Some(w) => w,
        None => return FfiHexLookup::default(),
    };
    let state = match world.state.lock() {
        Ok(s) => s,
        Err(_) => return FfiHexLookup::default(),
    };
    let chunk = chunk_of(q, r);
    match state.chunks.get(&chunk).and_then(|c| c.hexes.get(&(q, r))) {
        Some(res) => FfiHexLookup {
            valid: 1,
            res: *res,
        },
        None => FfiHexLookup::default(),
    }
}

/// Save a hex's resource state. Caller is responsible for only calling
/// this on hexes that actually diverged from the gen-time roll.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn uniti_world_save_hex(
    world: *mut c_void,
    q: i32,
    r: i32,
    res: FfiHexResources,
) {
    let world = match unsafe { to_world_mut(world) } {
        Some(w) => w,
        None => return,
    };
    let mut state = match world.state.lock() {
        Ok(s) => s,
        Err(_) => return,
    };
    let chunk = chunk_of(q, r);
    state
        .chunks
        .entry(chunk)
        .or_default()
        .hexes
        .insert((q, r), res);
}

// ---------------------------------------------------------------------------
// Unit queries
// ---------------------------------------------------------------------------

/// Push a ghost unit into the store. Chunk is derived from unit position.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn uniti_world_save_unit(world: *mut c_void, unit: FfiGhostUnit) {
    let world = match unsafe { to_world_mut(world) } {
        Some(w) => w,
        None => return,
    };
    let mut state = match world.state.lock() {
        Ok(s) => s,
        Err(_) => return,
    };
    let chunk = chunk_of(unit.q, unit.r);
    state.chunks.entry(chunk).or_default().units.push(unit);
}

/// Drain all ghost units in a chunk into the caller's buffer.
/// Returns the number of units written. Units that fit are removed from
/// the store; if `cap` is too small, the unwritten ones stay (and the
/// caller can call again with a bigger buffer to drain the rest).
///
/// `out_buf` must be a valid pointer to an array of at least `cap`
/// `FfiGhostUnit` values.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn uniti_world_take_units_in_chunk(
    world: *mut c_void,
    cx: i32,
    cy: i32,
    out_buf: *mut FfiGhostUnit,
    cap: u32,
) -> u32 {
    let world = match unsafe { to_world_mut(world) } {
        Some(w) => w,
        None => return 0,
    };
    if out_buf.is_null() || cap == 0 {
        return 0;
    }
    let mut state = match world.state.lock() {
        Ok(s) => s,
        Err(_) => return 0,
    };

    let Some(chunk_data) = state.chunks.get_mut(&(cx, cy)) else {
        return 0;
    };
    let take_n = (cap as usize).min(chunk_data.units.len());
    if take_n == 0 {
        return 0;
    }

    // Drain the front `take_n` units into the buffer.
    let drained: Vec<FfiGhostUnit> = chunk_data.units.drain(..take_n).collect();
    let slice = unsafe { std::slice::from_raw_parts_mut(out_buf, take_n) };
    slice.copy_from_slice(&drained);
    take_n as u32
}

/// How many ghost units are stored for a chunk. Useful for sizing the
/// buffer before `uniti_world_take_units_in_chunk`.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn uniti_world_unit_count_in_chunk(
    world: *const c_void,
    cx: i32,
    cy: i32,
) -> u32 {
    let world = match unsafe { to_world(world) } {
        Some(w) => w,
        None => return 0,
    };
    let state = match world.state.lock() {
        Ok(s) => s,
        Err(_) => return 0,
    };
    state
        .chunks
        .get(&(cx, cy))
        .map(|c| c.units.len() as u32)
        .unwrap_or(0)
}
