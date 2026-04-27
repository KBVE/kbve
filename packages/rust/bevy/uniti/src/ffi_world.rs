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

use std::collections::{HashMap, HashSet};
use std::ffi::{c_char, c_void};
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::thread::{self, JoinHandle};
use std::time::Duration;

use rusqlite::Connection;

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
///
/// Hunger / fatigue / energy trailing fields added for Phase 5 unit
/// ghost-sim. `*_max` + `*_per_second` carry the NPCDB-tuned rates so
/// the background ticker advances each pool without another FFI hop.
/// `last_tick_secs` is the `WorldClock.AbsSeconds` value at snapshot
/// time — the ticker subtracts to compute elapsed.
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
    // Phase 5 extension — Hunger / Fatigue / Energy ghost-sim state.
    pub hunger: f32,
    pub hunger_max: f32,
    pub hunger_per_second: f32,
    pub fatigue: f32,
    pub fatigue_max: f32,
    pub fatigue_per_second: f32,
    pub energy: f32,
    pub energy_max: f32,
    pub energy_per_second: f32,
    pub last_tick_secs: f32,
}

/// An unloaded building — mirror of the C# `UnloadedBuildingRecord` for
/// cross-process persistence. Field order + types must match exactly so
/// `#[repr(C)]` + C# default layout agree on padding. Version bumps via
/// a schema version header in save files — bump when layout changes.
///
/// Inline ledger slots cap at 4 items; overflow truncates (acceptable
/// loss for offline state since real-world buildings rarely exceed 4
/// unique SKUs).
#[repr(C)]
#[derive(Debug, Clone, Copy, Default)]
pub struct FfiUnloadedBuilding {
    pub building_type: u8,
    pub root_q: i32,
    pub root_r: i32,
    pub owner_faction: u8,
    pub health: u16,
    pub health_max: u16,
    pub tier: u8,
    pub last_tick_turn: u32,
    pub accrued_production: f32,
    pub accrued_input: f32,
    pub flags: u8,
    pub recipe_cycle_remaining: f32,
    pub slot0_id: u16,
    pub slot0_count: u16,
    pub slot1_id: u16,
    pub slot1_count: u16,
    pub slot2_id: u16,
    pub slot2_count: u16,
    pub slot3_id: u16,
    pub slot3_count: u16,
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
    /// Buildings known to be in this chunk while it's unloaded.
    /// Mirrors `units`; the background ticker advances
    /// `accrued_production` + decays `recipe_cycle_remaining` +
    /// (eventually) decays hostile-territory health.
    buildings: Vec<FfiUnloadedBuilding>,
}

#[derive(Default)]
struct WorldState {
    chunks: HashMap<ChunkKey, ChunkData>,
    /// Chunk keys whose units/buildings mutated since the last SQLite
    /// flush. Flush rewrites the entire unit + building row-set for each
    /// dirty chunk (list-based state with no stable per-row key — the
    /// delete-all + insert-all pattern is simpler than maintaining
    /// per-row dirtiness on lists that get shuffled by drain calls).
    dirty_chunks: HashSet<ChunkKey>,
    /// Hex coords mutated since the last flush. Hexes are keyed by
    /// (q, r) + addressed per-hex in SQLite via INSERT OR REPLACE, so we
    /// flush only the specific hexes that changed instead of every hex
    /// inside a dirty chunk. Massive write-cost reduction when players
    /// harvest a handful of cells inside a large populated chunk.
    dirty_hexes: HashSet<HexKey>,
}

/// Owned by the FFI handle. Background thread holds a clone of `state` and
/// `running` and exits when `running` flips false. `db` is the optional
/// SQLite connection — `None` means in-memory-only (matches legacy
/// `uniti_world_new` behaviour); `Some` means the store was opened via
/// `uniti_world_open` and persists across process restart.
pub struct WorldStore {
    state: Arc<Mutex<WorldState>>,
    db: Arc<Mutex<Option<Connection>>>,
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
        Self::build(None)
    }

    fn open(path: PathBuf) -> Self {
        let conn = Connection::open(&path).ok();
        if let Some(ref c) = conn {
            // Performance knobs tuned for "occasional batch writes +
            // frequent reads on open" — WAL keeps readers lock-free,
            // NORMAL sync trades a tiny durability window for a big
            // write-throughput win, and foreign_keys stays ON in case
            // later schema iterations add cross-table refs.
            let _ = c.pragma_update(None, "journal_mode", "WAL");
            let _ = c.pragma_update(None, "synchronous", "NORMAL");
            let _ = c.pragma_update(None, "foreign_keys", "ON");
            if let Err(e) = init_schema(c) {
                eprintln!("[uniti-world] SQLite schema init failed: {e}");
            }
        }
        let store = Self::build(conn);
        // Preload the in-memory cache from disk so get_hex / take_units
        // hit the fast path from the first frame after open.
        if let (Ok(mut db_guard), Ok(mut state_guard)) = (store.db.lock(), store.state.lock())
            && let Some(conn) = db_guard.as_mut()
            && let Ok(loaded) = load_all_from_db(conn)
        {
            state_guard.chunks = loaded;
            state_guard.dirty_chunks.clear();
            state_guard.dirty_hexes.clear();
        }
        store
    }

    fn build(conn: Option<Connection>) -> Self {
        let state = Arc::new(Mutex::new(WorldState::default()));
        let db: Arc<Mutex<Option<Connection>>> = Arc::new(Mutex::new(conn));
        let running = Arc::new(AtomicBool::new(true));

        // Background ticker — advances per-unit hunger / fatigue /
        // energy while the owning chunk is unloaded. Ticks at ~1 Hz
        // (sleep 100ms, accumulate elapsed, run the pass on every
        // second). Building ghost-sim is owned by the C# side
        // (BuildingsGhostSimSystem) to keep the live working set + the
        // FFI mirror from diverging; buildings here are write-through
        // crash-recovery state only.
        //
        // Shutdown responsiveness: the sleep stays at 100ms so `Drop`
        // setting `running=false` is observed within that window.
        let state_for_thread = Arc::clone(&state);
        let db_for_thread = Arc::clone(&db);
        let running_for_thread = Arc::clone(&running);
        let ticker = thread::Builder::new()
            .name("uniti-world-tick".into())
            .spawn(move || {
                let mut last_tick = std::time::Instant::now();
                let mut last_flush = std::time::Instant::now();
                const FLUSH_INTERVAL_SECS: f32 = 30.0;

                while running_for_thread.load(Ordering::Relaxed) {
                    thread::sleep(Duration::from_millis(100));
                    let now = std::time::Instant::now();
                    let dt = now.duration_since(last_tick).as_secs_f32();
                    if dt < 1.0 {
                        continue;
                    }
                    last_tick = now;

                    // --- Tick pass: advance ghost units (hunger / fatigue / energy) ---
                    // Two-phase to avoid double-mutable-borrow on the state
                    // lock: collect dirty keys during the iter, insert into
                    // the dirty set after. Chunks with zero units stay
                    // untouched.
                    {
                        let Ok(mut locked) = state_for_thread.lock() else {
                            continue;
                        };
                        let mut dirty_keys: Vec<ChunkKey> = Vec::new();
                        for (chunk_key, chunk_data) in locked.chunks.iter_mut() {
                            if chunk_data.units.is_empty() {
                                continue;
                            }
                            for unit in chunk_data.units.iter_mut() {
                                if unit.hunger_per_second > 0.0 {
                                    unit.hunger = (unit.hunger + unit.hunger_per_second * dt)
                                        .min(unit.hunger_max);
                                }
                                if unit.fatigue_per_second > 0.0 {
                                    unit.fatigue = (unit.fatigue + unit.fatigue_per_second * dt)
                                        .min(unit.fatigue_max);
                                }
                                if unit.energy_per_second != 0.0 {
                                    unit.energy = (unit.energy + unit.energy_per_second * dt)
                                        .clamp(0.0, unit.energy_max);
                                }
                                unit.last_tick_secs += dt;
                            }
                            dirty_keys.push(*chunk_key);
                        }
                        for k in dirty_keys {
                            locked.dirty_chunks.insert(k);
                        }
                    }

                    // --- Flush pass (every FLUSH_INTERVAL_SECS) ---
                    if now.duration_since(last_flush).as_secs_f32() >= FLUSH_INTERVAL_SECS {
                        last_flush = now;
                        flush_dirty(&state_for_thread, &db_for_thread);
                    }
                }

                // Final flush on shutdown so the last tick of work + any
                // pending writes make it to disk before the process exits.
                flush_dirty(&state_for_thread, &db_for_thread);
            })
            .expect("spawn uniti-world-tick");

        Self {
            state,
            db,
            running,
            ticker: Some(ticker),
        }
    }
}

// ---------------------------------------------------------------------------
// SQLite schema + dirty-chunk flush
// ---------------------------------------------------------------------------

/// Owned snapshot of one chunk's state captured while holding the state
/// lock; dropped into flush_dirty's SQL loop. Lives as a struct (instead
/// of an inline tuple) so clippy's type-complexity lint stays quiet.
struct FlushSnapshot {
    chunk: ChunkKey,
    hexes: Vec<((i32, i32), FfiHexResources)>,
    units: Vec<FfiGhostUnit>,
    buildings: Vec<FfiUnloadedBuilding>,
}

/// Aggregate of what `flush_dirty` needs to write — dirty chunk keys,
/// dirty hex rows, and per-chunk unit+building snapshots. Lifted out of
/// the inline tuple so clippy's type-complexity lint stays quiet.
struct DirtySnapshot {
    chunks: Vec<ChunkKey>,
    hex_rows: Vec<((i32, i32), FfiHexResources)>,
    per_chunk: Vec<FlushSnapshot>,
}

/// Current schema version. Bump + add a migration step whenever the
/// table layout changes. On open, we read the stored version from the
/// `meta` table and run each pending step in order. New installs land
/// at this version directly via `init_schema`.
const SCHEMA_VERSION: i64 = 1;

fn init_schema(conn: &Connection) -> rusqlite::Result<()> {
    // Base schema + meta bookkeeping. `meta` stores schema_version so
    // future migrations can detect the current level + apply deltas.
    conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS meta (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL
         );
         CREATE TABLE IF NOT EXISTS hexes (
            q INTEGER NOT NULL,
            r INTEGER NOT NULL,
            wood INTEGER NOT NULL,
            stone INTEGER NOT NULL,
            berries INTEGER NOT NULL,
            mushrooms INTEGER NOT NULL,
            herbs INTEGER NOT NULL,
            cactus INTEGER NOT NULL,
            cactus_variant INTEGER NOT NULL,
            PRIMARY KEY (q, r)
         );
         CREATE TABLE IF NOT EXISTS units (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            cx INTEGER NOT NULL,
            cy INTEGER NOT NULL,
            unit_type INTEGER NOT NULL,
            q INTEGER NOT NULL,
            r INTEGER NOT NULL,
            health REAL NOT NULL,
            max_health REAL NOT NULL,
            inv0_id INTEGER NOT NULL, inv0_qty INTEGER NOT NULL,
            inv1_id INTEGER NOT NULL, inv1_qty INTEGER NOT NULL,
            inv2_id INTEGER NOT NULL, inv2_qty INTEGER NOT NULL,
            inv3_id INTEGER NOT NULL, inv3_qty INTEGER NOT NULL,
            hunger REAL NOT NULL, hunger_max REAL NOT NULL, hunger_per_second REAL NOT NULL,
            fatigue REAL NOT NULL, fatigue_max REAL NOT NULL, fatigue_per_second REAL NOT NULL,
            energy REAL NOT NULL, energy_max REAL NOT NULL, energy_per_second REAL NOT NULL,
            last_tick_secs REAL NOT NULL
         );
         CREATE INDEX IF NOT EXISTS idx_units_chunk ON units(cx, cy);
         CREATE TABLE IF NOT EXISTS buildings (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            cx INTEGER NOT NULL,
            cy INTEGER NOT NULL,
            building_type INTEGER NOT NULL,
            root_q INTEGER NOT NULL,
            root_r INTEGER NOT NULL,
            owner_faction INTEGER NOT NULL,
            health INTEGER NOT NULL,
            health_max INTEGER NOT NULL,
            tier INTEGER NOT NULL,
            last_tick_turn INTEGER NOT NULL,
            accrued_production REAL NOT NULL,
            accrued_input REAL NOT NULL,
            flags INTEGER NOT NULL,
            recipe_cycle_remaining REAL NOT NULL,
            slot0_id INTEGER NOT NULL, slot0_count INTEGER NOT NULL,
            slot1_id INTEGER NOT NULL, slot1_count INTEGER NOT NULL,
            slot2_id INTEGER NOT NULL, slot2_count INTEGER NOT NULL,
            slot3_id INTEGER NOT NULL, slot3_count INTEGER NOT NULL
         );
         CREATE INDEX IF NOT EXISTS idx_buildings_chunk ON buildings(cx, cy);",
    )?;
    migrate_schema(conn)?;
    Ok(())
}

/// Read the stored schema_version (0 if absent) and step forward through
/// the migration ladder. New installs (no meta row) write the current
/// version directly. Keep migrations append-only + idempotent so players
/// who straddle multiple release updates don't hit data loss.
fn migrate_schema(conn: &Connection) -> rusqlite::Result<()> {
    let current: i64 = conn
        .query_row(
            "SELECT value FROM meta WHERE key = 'schema_version'",
            [],
            |row| {
                row.get::<_, String>(0)
                    .map(|s| s.parse::<i64>().unwrap_or(0))
            },
        )
        .unwrap_or(0);

    // Migration ladder — add blocks here when SCHEMA_VERSION bumps.
    // Each block is idempotent + wrapped in its own transaction.
    //
    // Example template:
    //   if current < 2 {
    //       let tx = conn.transaction()?;
    //       tx.execute_batch("ALTER TABLE units ADD COLUMN xp INTEGER NOT NULL DEFAULT 0;")?;
    //       tx.commit()?;
    //   }

    // Stamp the current version (also covers the fresh-install case).
    conn.execute(
        "INSERT OR REPLACE INTO meta (key, value) VALUES ('schema_version', ?1)",
        [SCHEMA_VERSION.to_string()],
    )?;
    let _ = current; // silence unused until the ladder grows
    Ok(())
}

fn load_all_from_db(conn: &Connection) -> rusqlite::Result<HashMap<ChunkKey, ChunkData>> {
    let mut chunks: HashMap<ChunkKey, ChunkData> = HashMap::new();

    // Hexes
    let mut stmt = conn.prepare(
        "SELECT q, r, wood, stone, berries, mushrooms, herbs, cactus, cactus_variant FROM hexes",
    )?;
    let rows = stmt.query_map([], |row| {
        Ok((
            row.get::<_, i32>(0)?,
            row.get::<_, i32>(1)?,
            FfiHexResources {
                wood: row.get::<_, i64>(2)? as u8,
                stone: row.get::<_, i64>(3)? as u8,
                berries: row.get::<_, i64>(4)? as u8,
                mushrooms: row.get::<_, i64>(5)? as u8,
                herbs: row.get::<_, i64>(6)? as u8,
                cactus: row.get::<_, i64>(7)? as u8,
                cactus_variant: row.get::<_, i64>(8)? as u8,
            },
        ))
    })?;
    for row in rows {
        let (q, r, res) = row?;
        chunks
            .entry(chunk_of(q, r))
            .or_default()
            .hexes
            .insert((q, r), res);
    }

    // Units
    let mut stmt = conn.prepare(
        "SELECT cx, cy, unit_type, q, r, health, max_health,
                inv0_id, inv0_qty, inv1_id, inv1_qty, inv2_id, inv2_qty, inv3_id, inv3_qty,
                hunger, hunger_max, hunger_per_second,
                fatigue, fatigue_max, fatigue_per_second,
                energy, energy_max, energy_per_second,
                last_tick_secs
         FROM units",
    )?;
    let rows = stmt.query_map([], |row| {
        let cx: i32 = row.get(0)?;
        let cy: i32 = row.get(1)?;
        let unit = FfiGhostUnit {
            unit_type: row.get::<_, i64>(2)? as u8,
            q: row.get(3)?,
            r: row.get(4)?,
            health: row.get(5)?,
            max_health: row.get(6)?,
            inv0_id: row.get::<_, i64>(7)? as u16,
            inv0_qty: row.get::<_, i64>(8)? as u16,
            inv1_id: row.get::<_, i64>(9)? as u16,
            inv1_qty: row.get::<_, i64>(10)? as u16,
            inv2_id: row.get::<_, i64>(11)? as u16,
            inv2_qty: row.get::<_, i64>(12)? as u16,
            inv3_id: row.get::<_, i64>(13)? as u16,
            inv3_qty: row.get::<_, i64>(14)? as u16,
            hunger: row.get(15)?,
            hunger_max: row.get(16)?,
            hunger_per_second: row.get(17)?,
            fatigue: row.get(18)?,
            fatigue_max: row.get(19)?,
            fatigue_per_second: row.get(20)?,
            energy: row.get(21)?,
            energy_max: row.get(22)?,
            energy_per_second: row.get(23)?,
            last_tick_secs: row.get(24)?,
        };
        Ok(((cx, cy), unit))
    })?;
    for row in rows {
        let ((cx, cy), unit) = row?;
        chunks.entry((cx, cy)).or_default().units.push(unit);
    }

    // Buildings
    let mut stmt = conn.prepare(
        "SELECT cx, cy, building_type, root_q, root_r, owner_faction,
                health, health_max, tier, last_tick_turn,
                accrued_production, accrued_input, flags, recipe_cycle_remaining,
                slot0_id, slot0_count, slot1_id, slot1_count,
                slot2_id, slot2_count, slot3_id, slot3_count
         FROM buildings",
    )?;
    let rows = stmt.query_map([], |row| {
        let cx: i32 = row.get(0)?;
        let cy: i32 = row.get(1)?;
        let b = FfiUnloadedBuilding {
            building_type: row.get::<_, i64>(2)? as u8,
            root_q: row.get(3)?,
            root_r: row.get(4)?,
            owner_faction: row.get::<_, i64>(5)? as u8,
            health: row.get::<_, i64>(6)? as u16,
            health_max: row.get::<_, i64>(7)? as u16,
            tier: row.get::<_, i64>(8)? as u8,
            last_tick_turn: row.get::<_, i64>(9)? as u32,
            accrued_production: row.get(10)?,
            accrued_input: row.get(11)?,
            flags: row.get::<_, i64>(12)? as u8,
            recipe_cycle_remaining: row.get(13)?,
            slot0_id: row.get::<_, i64>(14)? as u16,
            slot0_count: row.get::<_, i64>(15)? as u16,
            slot1_id: row.get::<_, i64>(16)? as u16,
            slot1_count: row.get::<_, i64>(17)? as u16,
            slot2_id: row.get::<_, i64>(18)? as u16,
            slot2_count: row.get::<_, i64>(19)? as u16,
            slot3_id: row.get::<_, i64>(20)? as u16,
            slot3_count: row.get::<_, i64>(21)? as u16,
        };
        Ok(((cx, cy), b))
    })?;
    for row in rows {
        let ((cx, cy), b) = row?;
        chunks.entry((cx, cy)).or_default().buildings.push(b);
    }

    Ok(chunks)
}

/// Write every dirty hex + dirty chunk to disk inside a single transaction.
/// Per-hex rows upsert by (q, r); per-chunk lists (units, buildings)
/// delete-then-insert by chunk so drained items disappear. Called every
/// FLUSH_INTERVAL_SECS by the ticker + on shutdown.
fn flush_dirty(state: &Arc<Mutex<WorldState>>, db: &Arc<Mutex<Option<Connection>>>) {
    // Snapshot dirty sets + the per-chunk/per-hex rows under the state
    // lock, then release so the main ticker + FFI calls don't stall on
    // long SQL transactions.
    let snapshot = match state.lock() {
        Ok(s) => {
            let dc: Vec<ChunkKey> = s.dirty_chunks.iter().copied().collect();
            let dh: Vec<((i32, i32), FfiHexResources)> = s
                .dirty_hexes
                .iter()
                .filter_map(|coord| {
                    let chunk = chunk_of(coord.0, coord.1);
                    s.chunks
                        .get(&chunk)
                        .and_then(|c| c.hexes.get(coord))
                        .map(|res| (*coord, *res))
                })
                .collect();
            let snaps: Vec<FlushSnapshot> = dc
                .iter()
                .filter_map(|k| {
                    s.chunks.get(k).map(|c| FlushSnapshot {
                        chunk: *k,
                        hexes: Vec::new(), // hexes handled separately now
                        units: c.units.clone(),
                        buildings: c.buildings.clone(),
                    })
                })
                .collect();
            DirtySnapshot {
                chunks: dc,
                hex_rows: dh,
                per_chunk: snaps,
            }
        }
        Err(_) => return,
    };
    let DirtySnapshot {
        chunks: dirty_chunks,
        hex_rows: dirty_hex_rows,
        per_chunk: snapshots,
    } = snapshot;

    if dirty_chunks.is_empty() && dirty_hex_rows.is_empty() {
        return;
    }

    let mut db_lock = match db.lock() {
        Ok(g) => g,
        Err(_) => return,
    };
    let Some(conn) = db_lock.as_mut() else {
        return; // in-memory-only store — nothing to do
    };
    let tx = match conn.transaction() {
        Ok(t) => t,
        Err(_) => return,
    };

    // --- Per-hex upserts ---
    if !dirty_hex_rows.is_empty() {
        let Ok(mut stmt) = tx.prepare(
            "INSERT OR REPLACE INTO hexes
             (q, r, wood, stone, berries, mushrooms, herbs, cactus, cactus_variant)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
        ) else {
            return;
        };
        for ((q, r), res) in &dirty_hex_rows {
            let _ = stmt.execute(rusqlite::params![
                *q,
                *r,
                res.wood as i64,
                res.stone as i64,
                res.berries as i64,
                res.mushrooms as i64,
                res.herbs as i64,
                res.cactus as i64,
                res.cactus_variant as i64,
            ]);
        }
    }

    for FlushSnapshot {
        chunk,
        hexes: _hex_rows,
        units,
        buildings,
    } in snapshots
    {
        let (cx, cy) = chunk;

        // Units — delete-then-insert chunk-scoped.
        let _ = tx.execute("DELETE FROM units WHERE cx = ?1 AND cy = ?2", [cx, cy]);
        {
            let mut stmt = match tx.prepare(
                "INSERT INTO units
                 (cx, cy, unit_type, q, r, health, max_health,
                  inv0_id, inv0_qty, inv1_id, inv1_qty, inv2_id, inv2_qty, inv3_id, inv3_qty,
                  hunger, hunger_max, hunger_per_second,
                  fatigue, fatigue_max, fatigue_per_second,
                  energy, energy_max, energy_per_second,
                  last_tick_secs)
                 VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14,?15,?16,?17,?18,?19,?20,?21,?22,?23,?24,?25)",
            ) {
                Ok(s) => s,
                Err(_) => continue,
            };
            for u in &units {
                let _ = stmt.execute(rusqlite::params![
                    cx,
                    cy,
                    u.unit_type as i64,
                    u.q,
                    u.r,
                    u.health,
                    u.max_health,
                    u.inv0_id as i64,
                    u.inv0_qty as i64,
                    u.inv1_id as i64,
                    u.inv1_qty as i64,
                    u.inv2_id as i64,
                    u.inv2_qty as i64,
                    u.inv3_id as i64,
                    u.inv3_qty as i64,
                    u.hunger,
                    u.hunger_max,
                    u.hunger_per_second,
                    u.fatigue,
                    u.fatigue_max,
                    u.fatigue_per_second,
                    u.energy,
                    u.energy_max,
                    u.energy_per_second,
                    u.last_tick_secs,
                ]);
            }
        }

        // Buildings — delete-then-insert chunk-scoped.
        let _ = tx.execute("DELETE FROM buildings WHERE cx = ?1 AND cy = ?2", [cx, cy]);
        {
            let mut stmt = match tx.prepare(
                "INSERT INTO buildings
                 (cx, cy, building_type, root_q, root_r, owner_faction,
                  health, health_max, tier, last_tick_turn,
                  accrued_production, accrued_input, flags, recipe_cycle_remaining,
                  slot0_id, slot0_count, slot1_id, slot1_count,
                  slot2_id, slot2_count, slot3_id, slot3_count)
                 VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14,?15,?16,?17,?18,?19,?20,?21,?22)",
            ) {
                Ok(s) => s,
                Err(_) => continue,
            };
            for b in &buildings {
                let _ = stmt.execute(rusqlite::params![
                    cx,
                    cy,
                    b.building_type as i64,
                    b.root_q,
                    b.root_r,
                    b.owner_faction as i64,
                    b.health as i64,
                    b.health_max as i64,
                    b.tier as i64,
                    b.last_tick_turn as i64,
                    b.accrued_production,
                    b.accrued_input,
                    b.flags as i64,
                    b.recipe_cycle_remaining,
                    b.slot0_id as i64,
                    b.slot0_count as i64,
                    b.slot1_id as i64,
                    b.slot1_count as i64,
                    b.slot2_id as i64,
                    b.slot2_count as i64,
                    b.slot3_id as i64,
                    b.slot3_count as i64,
                ]);
            }
        }
    }

    let _ = tx.commit();
    if let Ok(mut s) = state.lock() {
        s.dirty_chunks.clear();
        s.dirty_hexes.clear();
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

/// Create a new in-memory world store. Spawns a background tick thread
/// immediately. Returns an opaque handle the caller must eventually pass
/// to `uniti_world_free`. Returns null only if thread spawn fails. Use
/// `uniti_world_open` instead when you want on-disk persistence.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn uniti_world_new() -> *mut c_void {
    let store = Box::new(WorldStore::new());
    Box::into_raw(store) as *mut c_void
}

/// Open a disk-backed world store. `path_ptr` points at a UTF-8 byte
/// string of length `path_len` (not required to be null-terminated).
/// The file at that path is created if missing; existing rows hydrate
/// into the in-memory cache before the function returns so the first
/// read after open is hot. Returns null on invalid input.
///
/// The background tick thread flushes dirty chunks to the DB every 30 s
/// and on shutdown. Call `uniti_world_flush` between intervals if the
/// caller wants a synchronous save (e.g. before a risky operation or
/// an explicit "Save Game" button in UI).
#[unsafe(no_mangle)]
pub unsafe extern "C" fn uniti_world_open(path_ptr: *const c_char, path_len: u32) -> *mut c_void {
    if path_ptr.is_null() || path_len == 0 {
        return std::ptr::null_mut();
    }
    let slice = unsafe { std::slice::from_raw_parts(path_ptr as *const u8, path_len as usize) };
    let path_str = match std::str::from_utf8(slice) {
        Ok(s) => s,
        Err(_) => return std::ptr::null_mut(),
    };
    let path = PathBuf::from(path_str);
    let store = Box::new(WorldStore::open(path));
    Box::into_raw(store) as *mut c_void
}

/// Synchronously flush every dirty chunk to the DB. No-op for in-memory
/// stores (created via `uniti_world_new`). Safe to call from any thread;
/// locks the DB briefly.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn uniti_world_flush(world: *mut c_void) {
    let world = match unsafe { to_world(world as *const c_void) } {
        Some(w) => w,
        None => return,
    };
    flush_dirty(&world.state, &world.db);
}

/// Drop the store. Stops the background thread (which does a final
/// flush before exiting) and frees all chunk state. Calling this twice
/// on the same handle is undefined behavior.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn uniti_world_free(world: *mut c_void) {
    if world.is_null() {
        return;
    }
    drop(unsafe { Box::from_raw(world as *mut WorldStore) });
}

// ---------------------------------------------------------------------------
// World stats (read-only UI-friendly aggregate)
// ---------------------------------------------------------------------------

/// Summary of the world store's in-memory cache. Populated by
/// `uniti_world_stats`. Counts are u32 — if we ever need to represent
/// > 4B items, bump to u64 + a schema version, but that's ~Minecraft scale.
#[repr(C)]
#[derive(Debug, Clone, Copy, Default)]
pub struct FfiWorldStats {
    pub chunks: u32,
    pub hexes: u32,
    pub units: u32,
    pub buildings: u32,
    pub dirty_chunks: u32,
    pub dirty_hexes: u32,
}

/// Aggregate read-only counts. Cheap — just walks the in-memory HashMap.
/// UI / save-selection screens call this to show "N saved chunks, M
/// offline buildings, K ghost units" without pulling full row data.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn uniti_world_stats(world: *const c_void) -> FfiWorldStats {
    let world = match unsafe { to_world(world) } {
        Some(w) => w,
        None => return FfiWorldStats::default(),
    };
    let state = match world.state.lock() {
        Ok(s) => s,
        Err(_) => return FfiWorldStats::default(),
    };

    let mut stats = FfiWorldStats {
        chunks: state.chunks.len() as u32,
        dirty_chunks: state.dirty_chunks.len() as u32,
        dirty_hexes: state.dirty_hexes.len() as u32,
        ..Default::default()
    };
    for chunk in state.chunks.values() {
        stats.hexes = stats.hexes.saturating_add(chunk.hexes.len() as u32);
        stats.units = stats.units.saturating_add(chunk.units.len() as u32);
        stats.buildings = stats.buildings.saturating_add(chunk.buildings.len() as u32);
    }
    stats
}

// ---------------------------------------------------------------------------
// Archive + restore (zstd-compressed SQLite backups)
// ---------------------------------------------------------------------------

/// Create a zstd-compressed backup of the live SQLite DB at `dst_path`.
/// Flushes pending dirty state first so the archive is a coherent
/// snapshot. Works only on disk-backed stores (opened via
/// `uniti_world_open`). Returns 1 on success, 0 on failure.
///
/// Callers who want a .db snapshot without compression can use SQLite's
/// `VACUUM INTO` via a future endpoint; zstd-path is intended for save-
/// slot archival + cloud sync where the smaller file matters.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn uniti_world_archive(
    world: *mut c_void,
    dst_ptr: *const c_char,
    dst_len: u32,
) -> u8 {
    if dst_ptr.is_null() || dst_len == 0 {
        return 0;
    }
    let world = match unsafe { to_world(world as *const c_void) } {
        Some(w) => w,
        None => return 0,
    };
    let slice = unsafe { std::slice::from_raw_parts(dst_ptr as *const u8, dst_len as usize) };
    let Ok(dst_str) = std::str::from_utf8(slice) else {
        return 0;
    };
    let dst = PathBuf::from(dst_str);

    // Ensure pending state is on disk first, then read DB bytes.
    flush_dirty(&world.state, &world.db);

    // Locate the DB path via SQLite's pragma_database_list.
    let db_lock = match world.db.lock() {
        Ok(g) => g,
        Err(_) => return 0,
    };
    let Some(conn) = db_lock.as_ref() else {
        return 0;
    };
    let src_path: String = match conn.query_row(
        "SELECT file FROM pragma_database_list WHERE name='main'",
        [],
        |row| row.get::<_, String>(0),
    ) {
        Ok(p) => p,
        Err(_) => return 0,
    };
    drop(db_lock); // release before long IO

    let Ok(input) = std::fs::read(&src_path) else {
        return 0;
    };
    let Ok(compressed) = zstd::encode_all(&input[..], 3) else {
        return 0;
    };
    match std::fs::write(&dst, compressed) {
        Ok(_) => 1,
        Err(_) => 0,
    }
}

/// Decompress a zstd archive produced by `uniti_world_archive` into
/// `dst_db_path`. Returns 1 on success, 0 on failure. Call before
/// `uniti_world_open` on the destination path to restore a save slot.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn uniti_world_restore(
    src_ptr: *const c_char,
    src_len: u32,
    dst_ptr: *const c_char,
    dst_len: u32,
) -> u8 {
    if src_ptr.is_null() || src_len == 0 || dst_ptr.is_null() || dst_len == 0 {
        return 0;
    }
    let src_slice = unsafe { std::slice::from_raw_parts(src_ptr as *const u8, src_len as usize) };
    let dst_slice = unsafe { std::slice::from_raw_parts(dst_ptr as *const u8, dst_len as usize) };
    let (Ok(src_str), Ok(dst_str)) = (
        std::str::from_utf8(src_slice),
        std::str::from_utf8(dst_slice),
    ) else {
        return 0;
    };
    let Ok(input) = std::fs::read(src_str) else {
        return 0;
    };
    let Ok(decompressed) = zstd::decode_all(&input[..]) else {
        return 0;
    };
    match std::fs::write(dst_str, decompressed) {
        Ok(_) => 1,
        Err(_) => 0,
    }
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
    // Per-hex dirty tracking — only this single (q, r) gets flushed,
    // not every hex inside the chunk.
    state.dirty_hexes.insert((q, r));
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
    state.dirty_chunks.insert(chunk);
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
    state.dirty_chunks.insert((cx, cy));
    take_n as u32
}

/// Replace the entire unit set for a chunk. Drops every existing unit
/// in the chunk and writes the caller's buffer in its place. Use during
/// the periodic flush to push ghost-sim-advanced state back to disk
/// without growing duplicates — units don't have a stable per-record uid
/// in the FFI struct, so we replace at the chunk granularity instead of
/// per-row upsert.
///
/// `units_buf` may be null only if `count == 0` (chunk-wipe).
#[unsafe(no_mangle)]
pub unsafe extern "C" fn uniti_world_replace_chunk_units(
    world: *mut c_void,
    cx: i32,
    cy: i32,
    units_buf: *const FfiGhostUnit,
    count: u32,
) {
    let world = match unsafe { to_world_mut(world) } {
        Some(w) => w,
        None => return,
    };
    let mut state = match world.state.lock() {
        Ok(s) => s,
        Err(_) => return,
    };
    let chunk_data = state.chunks.entry((cx, cy)).or_default();
    chunk_data.units.clear();
    if count > 0 && !units_buf.is_null() {
        let slice = unsafe { std::slice::from_raw_parts(units_buf, count as usize) };
        chunk_data.units.extend_from_slice(slice);
    }
    state.dirty_chunks.insert((cx, cy));
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

/// Total ghost units across all chunks. Use to size the buffer for
/// `uniti_world_take_all_units` at session startup.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn uniti_world_total_unit_count(world: *const c_void) -> u32 {
    let world = match unsafe { to_world(world) } {
        Some(w) => w,
        None => return 0,
    };
    let state = match world.state.lock() {
        Ok(s) => s,
        Err(_) => return 0,
    };
    let mut total: u32 = 0;
    for (_coord, chunk) in state.chunks.iter() {
        total = total.saturating_add(chunk.units.len() as u32);
    }
    total
}

/// Drain every ghost unit across every chunk into the caller's flat
/// buffer. Returns the number written. Use at session startup to
/// rebuild the in-memory Unloaded unit list from on-disk state.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn uniti_world_take_all_units(
    world: *mut c_void,
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

    let mut written: usize = 0;
    let cap_usize = cap as usize;
    let coords: Vec<(i32, i32)> = state.chunks.keys().copied().collect();
    for coord in coords {
        if written >= cap_usize {
            break;
        }
        if let Some(chunk_data) = state.chunks.get_mut(&coord) {
            let remaining = cap_usize - written;
            let take_n = remaining.min(chunk_data.units.len());
            if take_n == 0 {
                continue;
            }
            let drained: Vec<FfiGhostUnit> = chunk_data.units.drain(..take_n).collect();
            let slice = unsafe { std::slice::from_raw_parts_mut(out_buf.add(written), take_n) };
            slice.copy_from_slice(&drained);
            written += take_n;
            state.dirty_chunks.insert(coord);
        }
    }
    written as u32
}

// ---------------------------------------------------------------------------
// Building queries
// ---------------------------------------------------------------------------

/// Push an unloaded building into the store. Chunk is derived from the
/// building's root hex via the same `chunk_of` math as units + hexes.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn uniti_world_save_building(
    world: *mut c_void,
    building: FfiUnloadedBuilding,
) {
    let world = match unsafe { to_world_mut(world) } {
        Some(w) => w,
        None => return,
    };
    let mut state = match world.state.lock() {
        Ok(s) => s,
        Err(_) => return,
    };
    let chunk = chunk_of(building.root_q, building.root_r);
    let chunk_data = state.chunks.entry(chunk).or_default();
    // Upsert by (root_q, root_r) — periodic flush re-saves every in-memory
    // ghost-sim record back to disk, so without dedup the on-disk Vec
    // would grow unbounded. Buildings are uniquely identified by their
    // root hex within the empire.
    if let Some(existing) = chunk_data
        .buildings
        .iter_mut()
        .find(|b| b.root_q == building.root_q && b.root_r == building.root_r)
    {
        *existing = building;
    } else {
        chunk_data.buildings.push(building);
    }
    state.dirty_chunks.insert(chunk);
}

/// How many unloaded buildings are stored for a chunk. Useful for sizing
/// the buffer before `uniti_world_take_buildings_in_chunk`.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn uniti_world_building_count_in_chunk(
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
        .map(|c| c.buildings.len() as u32)
        .unwrap_or(0)
}

/// Drain all unloaded buildings in a chunk into the caller's buffer.
/// Returns the number of buildings written. Buildings that fit are
/// removed from the store; if `cap` is too small, the unwritten ones
/// stay (and the caller can call again with a bigger buffer to drain
/// the rest). Mirrors `uniti_world_take_units_in_chunk`.
///
/// `out_buf` must be a valid pointer to an array of at least `cap`
/// `FfiUnloadedBuilding` values.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn uniti_world_take_buildings_in_chunk(
    world: *mut c_void,
    cx: i32,
    cy: i32,
    out_buf: *mut FfiUnloadedBuilding,
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
    let take_n = (cap as usize).min(chunk_data.buildings.len());
    if take_n == 0 {
        return 0;
    }

    let drained: Vec<FfiUnloadedBuilding> = chunk_data.buildings.drain(..take_n).collect();
    let slice = unsafe { std::slice::from_raw_parts_mut(out_buf, take_n) };
    slice.copy_from_slice(&drained);
    state.dirty_chunks.insert((cx, cy));
    take_n as u32
}

/// Bulk variant of `uniti_world_save_building`. Pushes `count`
/// buildings from `buildings_buf` in one FFI call — keeps periodic
/// flush from making N round-trips through Mono → C. Each entry
/// upserts by `(root_q, root_r)` like the single-record path.
///
/// `buildings_buf` may be null only when `count == 0`.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn uniti_world_save_buildings_batch(
    world: *mut c_void,
    buildings_buf: *const FfiUnloadedBuilding,
    count: u32,
) {
    let world = match unsafe { to_world_mut(world) } {
        Some(w) => w,
        None => return,
    };
    if count == 0 || buildings_buf.is_null() {
        return;
    }
    let mut state = match world.state.lock() {
        Ok(s) => s,
        Err(_) => return,
    };
    let slice = unsafe { std::slice::from_raw_parts(buildings_buf, count as usize) };
    for building in slice {
        let chunk = chunk_of(building.root_q, building.root_r);
        let chunk_data = state.chunks.entry(chunk).or_default();
        if let Some(existing) = chunk_data
            .buildings
            .iter_mut()
            .find(|b| b.root_q == building.root_q && b.root_r == building.root_r)
        {
            *existing = *building;
        } else {
            chunk_data.buildings.push(*building);
        }
        state.dirty_chunks.insert(chunk);
    }
}

/// Total count of unloaded buildings across all chunks. Use for buffer
/// sizing before `uniti_world_take_all_buildings`. Cheap O(N_chunks).
#[unsafe(no_mangle)]
pub unsafe extern "C" fn uniti_world_total_building_count(world: *const c_void) -> u32 {
    let world = match unsafe { to_world(world) } {
        Some(w) => w,
        None => return 0,
    };
    let state = match world.state.lock() {
        Ok(s) => s,
        Err(_) => return 0,
    };
    let mut total: u32 = 0;
    for (_coord, chunk) in state.chunks.iter() {
        total = total.saturating_add(chunk.buildings.len() as u32);
    }
    total
}

/// Drain every unloaded building across every chunk into the caller's
/// flat buffer. Returns the number written. Use at session startup to
/// rebuild the in-memory Unloaded list from on-disk state — Rust is the
/// canonical persistence layer; the in-memory list is a session cache.
/// Buildings that fit are removed from the store; oversize remainders
/// stay until the next call.
///
/// `out_buf` must be a valid pointer to an array of at least `cap`
/// `FfiUnloadedBuilding` values.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn uniti_world_take_all_buildings(
    world: *mut c_void,
    out_buf: *mut FfiUnloadedBuilding,
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

    let mut written: usize = 0;
    let cap_usize = cap as usize;
    let coords: Vec<(i32, i32)> = state.chunks.keys().copied().collect();
    for coord in coords {
        if written >= cap_usize {
            break;
        }
        if let Some(chunk_data) = state.chunks.get_mut(&coord) {
            let remaining = cap_usize - written;
            let take_n = remaining.min(chunk_data.buildings.len());
            if take_n == 0 {
                continue;
            }
            let drained: Vec<FfiUnloadedBuilding> = chunk_data.buildings.drain(..take_n).collect();
            let slice = unsafe { std::slice::from_raw_parts_mut(out_buf.add(written), take_n) };
            slice.copy_from_slice(&drained);
            written += take_n;
            state.dirty_chunks.insert(coord);
        }
    }
    written as u32
}
