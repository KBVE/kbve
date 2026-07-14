//! Persistent world store FFI surface — owns ghost-chunk state for hexes,
//! units, and buildings that have diverged from deterministic world-gen
//! so unloaded chunks aren't lost when their entities are destroyed.
//!
//! A background thread ticks abstract simulation for ghost units (hunger
//! / fatigue / energy) every ~1 s and flushes dirty state to SQLite every
//! 30 s without touching the Unity main thread. See the crate root for
//! the shared safety contract.

use std::collections::{HashMap, HashSet};
use std::ffi::{c_char, c_void};
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::Duration;

use rusqlite::Connection;
use tokio::task::JoinHandle;

use crate::runtime::shared_runtime;

/// Per-hex resource amounts. Mirrors the C# `HexResources` struct exactly.
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

/// Result of [`uniti_world_get_hex`]. `valid = 0` means no override is
/// stored — the caller falls back to deterministic world-gen.
#[repr(C)]
#[derive(Debug, Clone, Copy, Default)]
pub struct FfiHexLookup {
    pub valid: u8,
    pub res: FfiHexResources,
}

/// Abstract state of a unit that lived in an unloaded chunk. Position is
/// in hex-axial coords; the owning chunk is derived as
/// `(q.div_euclid(CHUNK_SIZE), r.div_euclid(CHUNK_SIZE))`.
///
/// Inventory carries the first 4 slots only — matches the HUD snapshot
/// shape and keeps the FFI struct flat (~50 bytes per unit).
///
/// `last_tick_secs` is the `WorldClock.AbsSeconds` value at snapshot
/// time; the background ticker subtracts to compute elapsed.
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

    // Combat snapshot — mirrors C# UnloadedUnitRecord. Field order MUST match.
    pub attack_damage: f32,
    pub attack_range: f32,
    pub attack_cooldown: f32,
    pub time_since_attack: f32,
    pub attack_kind: u8,
    pub target_mode: u8,
}

/// Mirror of the C# `UnloadedBuildingRecord`. Field order + types must
/// match the C# struct exactly so `#[repr(C)]` and the C# default layout
/// agree on padding. Bump [`UNITI_FFI_SCHEMA_VERSION`] when this layout
/// changes.
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

    // Combat snapshot — mirrors C# UnloadedBuildingRecord. Field order MUST match.
    pub attack_damage: f32,
    pub attack_range: f32,
    pub attack_cooldown: f32,
    pub time_since_attack: f32,
    pub attack_kind: u8,
    pub target_mode: u8,
}

type HexKey = (i32, i32);
type ChunkKey = (i32, i32);

#[derive(Default)]
struct ChunkData {
    hexes: HashMap<HexKey, FfiHexResources>,
    units: Vec<FfiGhostUnit>,
    buildings: Vec<FfiUnloadedBuilding>,
}

#[derive(Default)]
struct WorldState {
    chunks: HashMap<ChunkKey, ChunkData>,
    /// Chunk keys whose units / buildings mutated since the last flush.
    /// Flush rewrites the entire unit + building row-set for each dirty
    /// chunk because list-based state has no stable per-row key — the
    /// delete-all + insert-all pattern is simpler than maintaining
    /// per-row dirtiness on lists shuffled by drain calls.
    dirty_chunks: HashSet<ChunkKey>,
    /// Hex coords mutated since the last flush. Hexes upsert by (q, r)
    /// in SQLite, so we flush only the cells that changed instead of
    /// every hex inside a dirty chunk.
    dirty_hexes: HashSet<HexKey>,
}

/// World store handle. The background tick thread holds clones of
/// `state`, `db`, and `running`; setting `running = false` lets it
/// observe shutdown within ~100 ms.
pub struct WorldStore {
    state: Arc<Mutex<WorldState>>,
    db: Arc<Mutex<Option<Connection>>>,
    running: Arc<AtomicBool>,
    ticker_paused: Arc<AtomicBool>,
    ticker: Option<JoinHandle<()>>,
    last_flush_micros: Arc<std::sync::atomic::AtomicU64>,
    total_flushes: Arc<std::sync::atomic::AtomicU64>,
}

/// Hex chunk size. Must match `HexChunkSystem.ChunkSize` on the C# side.
const CHUNK_SIZE: i32 = 32;

/// Chunk that owns a hex coordinate. Floor division so negative coords
/// land in the right chunk.
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
            // WAL keeps readers lock-free, NORMAL trades a tiny
            // durability window for a big write-throughput win.
            let _ = c.pragma_update(None, "journal_mode", "WAL");
            let _ = c.pragma_update(None, "synchronous", "NORMAL");
            let _ = c.pragma_update(None, "foreign_keys", "ON");
            let _ = c.pragma_update(None, "mmap_size", 268_435_456i64);
            let _ = c.pragma_update(None, "temp_store", "MEMORY");
            let _ = c.busy_timeout(Duration::from_millis(500));
            if let Err(e) = init_schema(c) {
                eprintln!("[uniti-world] SQLite schema init failed: {e}");
            }
        }
        let store = Self::build(conn);
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
        let last_flush_micros = Arc::new(std::sync::atomic::AtomicU64::new(0));
        let total_flushes = Arc::new(std::sync::atomic::AtomicU64::new(0));

        // Building ghost-sim is owned by the C# side
        // (BuildingsGhostSimSystem) to keep the live working set + the
        // FFI mirror from diverging; buildings here are write-through
        // crash-recovery state only.
        let ticker_paused = Arc::new(AtomicBool::new(false));
        let state_for_thread = Arc::clone(&state);
        let db_for_thread = Arc::clone(&db);
        let running_for_thread = Arc::clone(&running);
        let ticker_paused_for_thread = Arc::clone(&ticker_paused);
        let last_flush_for_thread = Arc::clone(&last_flush_micros);
        let total_flushes_for_thread = Arc::clone(&total_flushes);
        // spawn_blocking instead of std::thread::spawn so the shared
        // tokio runtime owns this background work alongside the empire
        // ticker. Single shutdown path, single thread-naming convention,
        // and `rusqlite` calls inside the loop stay perfectly happy
        // because spawn_blocking dedicates a worker thread to the task.
        let ticker = shared_runtime().spawn_blocking(move || {
            let mut last_tick = std::time::Instant::now();
            let mut last_flush = std::time::Instant::now();
            const FLUSH_INTERVAL_SECS: f32 = 30.0;

            while running_for_thread.load(Ordering::Relaxed) {
                thread::sleep(Duration::from_millis(100));
                if ticker_paused_for_thread.load(Ordering::Relaxed) {
                    last_tick = std::time::Instant::now();
                    last_flush = std::time::Instant::now();
                    continue;
                }
                let now = std::time::Instant::now();
                let dt = now.duration_since(last_tick).as_secs_f32();
                if dt < 1.0 {
                    continue;
                }
                last_tick = now;

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

                if now.duration_since(last_flush).as_secs_f32() >= FLUSH_INTERVAL_SECS {
                    last_flush = now;
                    flush_dirty(
                        &state_for_thread,
                        &db_for_thread,
                        &last_flush_for_thread,
                        &total_flushes_for_thread,
                    );
                }
            }

            // Final flush on shutdown so the last tick of work + any
            // pending writes make it to disk before the process exits.
            flush_dirty(
                &state_for_thread,
                &db_for_thread,
                &last_flush_for_thread,
                &total_flushes_for_thread,
            );
        });

        Self {
            state,
            db,
            running,
            ticker_paused,
            ticker: Some(ticker),
            last_flush_micros,
            total_flushes,
        }
    }
}

/// Owned snapshot of one chunk's state captured under the state lock,
/// dropped into [`flush_dirty`]'s SQL loop.
struct FlushSnapshot {
    chunk: ChunkKey,
    hexes: Vec<((i32, i32), FfiHexResources)>,
    units: Vec<FfiGhostUnit>,
    buildings: Vec<FfiUnloadedBuilding>,
}

/// Aggregate of what [`flush_dirty`] needs to write.
struct DirtySnapshot {
    chunks: Vec<ChunkKey>,
    hex_rows: Vec<((i32, i32), FfiHexResources)>,
    per_chunk: Vec<FlushSnapshot>,
}

const SCHEMA_VERSION: i64 = 3;

fn init_schema(conn: &Connection) -> rusqlite::Result<()> {
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
            last_tick_secs REAL NOT NULL,
            attack_damage REAL NOT NULL DEFAULT 0,
            attack_range REAL NOT NULL DEFAULT 0,
            attack_cooldown REAL NOT NULL DEFAULT 0,
            time_since_attack REAL NOT NULL DEFAULT 0,
            attack_kind INTEGER NOT NULL DEFAULT 0,
            target_mode INTEGER NOT NULL DEFAULT 0
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
            slot3_id INTEGER NOT NULL, slot3_count INTEGER NOT NULL,
            attack_damage REAL NOT NULL DEFAULT 0,
            attack_range REAL NOT NULL DEFAULT 0,
            attack_cooldown REAL NOT NULL DEFAULT 0,
            time_since_attack REAL NOT NULL DEFAULT 0,
            attack_kind INTEGER NOT NULL DEFAULT 0,
            target_mode INTEGER NOT NULL DEFAULT 0
         );
         CREATE INDEX IF NOT EXISTS idx_buildings_chunk ON buildings(cx, cy);
         CREATE TABLE IF NOT EXISTS chunks (
            cx INTEGER NOT NULL,
            cy INTEGER NOT NULL,
            last_seen_ms INTEGER NOT NULL DEFAULT 0,
            last_tick_ms INTEGER NOT NULL DEFAULT 0,
            flags INTEGER NOT NULL DEFAULT 0,
            threat_level INTEGER NOT NULL DEFAULT 0,
            unit_count INTEGER NOT NULL DEFAULT 0,
            building_count INTEGER NOT NULL DEFAULT 0,
            aggregate_count INTEGER NOT NULL DEFAULT 0,
            PRIMARY KEY (cx, cy)
         );
         CREATE INDEX IF NOT EXISTS idx_chunks_due ON chunks(last_tick_ms);
         CREATE INDEX IF NOT EXISTS idx_chunks_seen ON chunks(last_seen_ms);
         CREATE INDEX IF NOT EXISTS idx_chunks_flags ON chunks(flags) WHERE flags != 0;
         CREATE TABLE IF NOT EXISTS unit_aggregates (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            cx INTEGER NOT NULL,
            cy INTEGER NOT NULL,
            unit_type INTEGER NOT NULL,
            count INTEGER NOT NULL,
            avg_health REAL NOT NULL,
            hunger_pool REAL NOT NULL DEFAULT 0,
            last_tick_secs REAL NOT NULL DEFAULT 0
         );
         CREATE INDEX IF NOT EXISTS idx_unit_aggregates_chunk ON unit_aggregates(cx, cy);
         CREATE UNIQUE INDEX IF NOT EXISTS idx_unit_aggregates_chunk_type
            ON unit_aggregates(cx, cy, unit_type);",
    )?;
    migrate_schema(conn)?;
    Ok(())
}

/// Migration ladder. Keep blocks append-only and idempotent so players
/// who skip releases don't hit data loss.
fn migrate_schema(conn: &Connection) -> rusqlite::Result<()> {
    let row_count: i64 = conn.query_row("SELECT COUNT(*) FROM meta", [], |r| r.get(0))?;
    if row_count == 0 {
        conn.execute(
            "INSERT INTO meta (key, value) VALUES ('schema_version', ?1)",
            [SCHEMA_VERSION.to_string()],
        )?;
        return Ok(());
    }

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

    // Add migration blocks here when SCHEMA_VERSION bumps. Template:
    //   if current < 2 {
    //       let tx = conn.transaction()?;
    //       tx.execute_batch("ALTER TABLE units ADD COLUMN xp INTEGER NOT NULL DEFAULT 0;")?;
    //       tx.commit()?;
    //   }

    if current < 2 {
        conn.execute_batch(
            "ALTER TABLE units ADD COLUMN attack_damage REAL NOT NULL DEFAULT 0;
             ALTER TABLE units ADD COLUMN attack_range REAL NOT NULL DEFAULT 0;
             ALTER TABLE units ADD COLUMN attack_cooldown REAL NOT NULL DEFAULT 0;
             ALTER TABLE units ADD COLUMN time_since_attack REAL NOT NULL DEFAULT 0;
             ALTER TABLE units ADD COLUMN attack_kind INTEGER NOT NULL DEFAULT 0;
             ALTER TABLE units ADD COLUMN target_mode INTEGER NOT NULL DEFAULT 0;
             ALTER TABLE buildings ADD COLUMN attack_damage REAL NOT NULL DEFAULT 0;
             ALTER TABLE buildings ADD COLUMN attack_range REAL NOT NULL DEFAULT 0;
             ALTER TABLE buildings ADD COLUMN attack_cooldown REAL NOT NULL DEFAULT 0;
             ALTER TABLE buildings ADD COLUMN time_since_attack REAL NOT NULL DEFAULT 0;
             ALTER TABLE buildings ADD COLUMN attack_kind INTEGER NOT NULL DEFAULT 0;
             ALTER TABLE buildings ADD COLUMN target_mode INTEGER NOT NULL DEFAULT 0;",
        )?;
    }

    if current < 3 {
        conn.execute_batch(
            "CREATE TABLE IF NOT EXISTS chunks (
                cx INTEGER NOT NULL,
                cy INTEGER NOT NULL,
                last_seen_ms INTEGER NOT NULL DEFAULT 0,
                last_tick_ms INTEGER NOT NULL DEFAULT 0,
                flags INTEGER NOT NULL DEFAULT 0,
                threat_level INTEGER NOT NULL DEFAULT 0,
                unit_count INTEGER NOT NULL DEFAULT 0,
                building_count INTEGER NOT NULL DEFAULT 0,
                aggregate_count INTEGER NOT NULL DEFAULT 0,
                PRIMARY KEY (cx, cy)
             );
             CREATE INDEX IF NOT EXISTS idx_chunks_due ON chunks(last_tick_ms);
             CREATE INDEX IF NOT EXISTS idx_chunks_seen ON chunks(last_seen_ms);
             CREATE INDEX IF NOT EXISTS idx_chunks_flags ON chunks(flags) WHERE flags != 0;
             CREATE TABLE IF NOT EXISTS unit_aggregates (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                cx INTEGER NOT NULL,
                cy INTEGER NOT NULL,
                unit_type INTEGER NOT NULL,
                count INTEGER NOT NULL,
                avg_health REAL NOT NULL,
                hunger_pool REAL NOT NULL DEFAULT 0,
                last_tick_secs REAL NOT NULL DEFAULT 0
             );
             CREATE INDEX IF NOT EXISTS idx_unit_aggregates_chunk ON unit_aggregates(cx, cy);
             CREATE UNIQUE INDEX IF NOT EXISTS idx_unit_aggregates_chunk_type
                ON unit_aggregates(cx, cy, unit_type);",
        )?;
    }

    conn.execute(
        "INSERT OR REPLACE INTO meta (key, value) VALUES ('schema_version', ?1)",
        [SCHEMA_VERSION.to_string()],
    )?;
    let _ = current;
    Ok(())
}

fn load_all_from_db(conn: &Connection) -> rusqlite::Result<HashMap<ChunkKey, ChunkData>> {
    let mut chunks: HashMap<ChunkKey, ChunkData> = HashMap::new();

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

    let mut stmt = conn.prepare(
        "SELECT cx, cy, unit_type, q, r, health, max_health,
                inv0_id, inv0_qty, inv1_id, inv1_qty, inv2_id, inv2_qty, inv3_id, inv3_qty,
                hunger, hunger_max, hunger_per_second,
                fatigue, fatigue_max, fatigue_per_second,
                energy, energy_max, energy_per_second,
                last_tick_secs,
                attack_damage, attack_range, attack_cooldown, time_since_attack,
                attack_kind, target_mode
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
            attack_damage: row.get(25)?,
            attack_range: row.get(26)?,
            attack_cooldown: row.get(27)?,
            time_since_attack: row.get(28)?,
            attack_kind: row.get::<_, i64>(29)? as u8,
            target_mode: row.get::<_, i64>(30)? as u8,
        };
        Ok(((cx, cy), unit))
    })?;
    for row in rows {
        let ((cx, cy), unit) = row?;
        chunks.entry((cx, cy)).or_default().units.push(unit);
    }

    let mut stmt = conn.prepare(
        "SELECT cx, cy, building_type, root_q, root_r, owner_faction,
                health, health_max, tier, last_tick_turn,
                accrued_production, accrued_input, flags, recipe_cycle_remaining,
                slot0_id, slot0_count, slot1_id, slot1_count,
                slot2_id, slot2_count, slot3_id, slot3_count,
                attack_damage, attack_range, attack_cooldown, time_since_attack,
                attack_kind, target_mode
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
            attack_damage: row.get(22)?,
            attack_range: row.get(23)?,
            attack_cooldown: row.get(24)?,
            time_since_attack: row.get(25)?,
            attack_kind: row.get::<_, i64>(26)? as u8,
            target_mode: row.get::<_, i64>(27)? as u8,
        };
        Ok(((cx, cy), b))
    })?;
    for row in rows {
        let ((cx, cy), b) = row?;
        chunks.entry((cx, cy)).or_default().buildings.push(b);
    }

    Ok(chunks)
}

/// Write every dirty hex + dirty chunk to disk inside a single
/// transaction. Per-hex rows upsert by (q, r); per-chunk lists (units,
/// buildings) delete-then-insert by chunk so drained items disappear.
fn flush_dirty(
    state: &Arc<Mutex<WorldState>>,
    db: &Arc<Mutex<Option<Connection>>>,
    last_flush_micros: &Arc<std::sync::atomic::AtomicU64>,
    total_flushes: &Arc<std::sync::atomic::AtomicU64>,
) {
    let started = std::time::Instant::now();
    // Snapshot under the state lock then release before running SQL —
    // FFI calls and the ticker shouldn't stall on long transactions.
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
                        hexes: Vec::new(),
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
        return;
    };
    let tx = match conn.transaction() {
        Ok(t) => t,
        Err(_) => return,
    };

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

        let _ = tx.execute("DELETE FROM units WHERE cx = ?1 AND cy = ?2", [cx, cy]);
        {
            let mut stmt = match tx.prepare(
                "INSERT INTO units
                 (cx, cy, unit_type, q, r, health, max_health,
                  inv0_id, inv0_qty, inv1_id, inv1_qty, inv2_id, inv2_qty, inv3_id, inv3_qty,
                  hunger, hunger_max, hunger_per_second,
                  fatigue, fatigue_max, fatigue_per_second,
                  energy, energy_max, energy_per_second,
                  last_tick_secs,
                  attack_damage, attack_range, attack_cooldown, time_since_attack,
                  attack_kind, target_mode)
                 VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14,?15,?16,?17,?18,?19,?20,?21,?22,?23,?24,?25,?26,?27,?28,?29,?30,?31)",
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
                    u.attack_damage,
                    u.attack_range,
                    u.attack_cooldown,
                    u.time_since_attack,
                    u.attack_kind as i64,
                    u.target_mode as i64,
                ]);
            }
        }

        let _ = tx.execute("DELETE FROM buildings WHERE cx = ?1 AND cy = ?2", [cx, cy]);
        {
            let mut stmt = match tx.prepare(
                "INSERT INTO buildings
                 (cx, cy, building_type, root_q, root_r, owner_faction,
                  health, health_max, tier, last_tick_turn,
                  accrued_production, accrued_input, flags, recipe_cycle_remaining,
                  slot0_id, slot0_count, slot1_id, slot1_count,
                  slot2_id, slot2_count, slot3_id, slot3_count,
                  attack_damage, attack_range, attack_cooldown, time_since_attack,
                  attack_kind, target_mode)
                 VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14,?15,?16,?17,?18,?19,?20,?21,?22,?23,?24,?25,?26,?27,?28)",
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
                    b.attack_damage,
                    b.attack_range,
                    b.attack_cooldown,
                    b.time_since_attack,
                    b.attack_kind as i64,
                    b.target_mode as i64,
                ]);
            }
        }
    }

    let _ = tx.commit();
    let _ = conn.pragma_update(None, "wal_checkpoint", "PASSIVE");
    if let Ok(mut s) = state.lock() {
        s.dirty_chunks.clear();
        s.dirty_hexes.clear();
    }

    let elapsed = started.elapsed().as_micros() as u64;
    last_flush_micros.store(elapsed, std::sync::atomic::Ordering::Relaxed);
    total_flushes.fetch_add(1, std::sync::atomic::Ordering::Relaxed);
    if elapsed > 100_000 {
        eprintln!("[uniti-world] slow flush: {} us", elapsed);
    }
}

impl Drop for WorldStore {
    fn drop(&mut self) {
        // Signal stop; the spawn_blocking loop polls this flag every
        // 100 ms and runs the final flush before returning. Wait on the
        // tokio JoinHandle via the shared runtime so the writer thread
        // has a chance to land its last SQLite batch before the
        // connection mutex drops with the WorldStore.
        self.running.store(false, Ordering::Relaxed);
        if let Some(handle) = self.ticker.take() {
            let _ = shared_runtime().block_on(handle);
        }
    }
}

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

/// Create a new in-memory world store. Spawns the background tick
/// thread immediately. Use [`uniti_world_open`] instead when on-disk
/// persistence is needed.
///
/// # Returns
///
/// Opaque handle the caller must eventually pass to [`uniti_world_free`].
///
/// # Panics
///
/// Panics if the background `uniti-world-tick` thread fails to spawn.
///
/// # Safety
///
/// Always safe to call. Marked `unsafe` for FFI consistency with the
/// rest of the module.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn uniti_world_new() -> *mut c_void {
    let store = Box::new(WorldStore::new());
    Box::into_raw(store) as *mut c_void
}

/// Open a disk-backed world store. The file is created if missing;
/// existing rows hydrate into the in-memory cache before the function
/// returns so the first read after open is hot.
///
/// The background tick thread flushes dirty chunks every 30 s and on
/// shutdown. Call [`uniti_world_flush`] for a synchronous save (e.g.
/// before a risky operation or an explicit "Save Game" UI button).
///
/// # Arguments
///
/// * `path_ptr` — pointer to a UTF-8 byte string. Not required to be
///   null-terminated.
/// * `path_len` — number of bytes pointed at by `path_ptr`.
///
/// # Returns
///
/// Opaque handle the caller must eventually pass to [`uniti_world_free`].
/// Returns null when `path_ptr` is null, `path_len == 0`, or the bytes
/// are not valid UTF-8.
///
/// # Panics
///
/// Panics if the background `uniti-world-tick` thread fails to spawn.
///
/// # Safety
///
/// `path_ptr` (when non-null) must point to at least `path_len` valid
/// bytes. The pointer is read but not retained beyond the call.
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

/// Synchronously flush every dirty chunk to the DB. No-op for
/// in-memory stores or a null `world`. Locks the DB briefly; safe to
/// call from any thread.
///
/// # Safety
///
/// `world` (when non-null) must point to a live store handle.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn uniti_world_flush(world: *mut c_void) {
    let world = match unsafe { to_world(world as *const c_void) } {
        Some(w) => w,
        None => return,
    };
    flush_dirty(
        &world.state,
        &world.db,
        &world.last_flush_micros,
        &world.total_flushes,
    );
}

/// Drop the store. Stops the background thread (which does a final
/// flush before exiting) and frees all chunk state. Null-safe.
///
/// # Safety
///
/// `world` (when non-null) must be a live handle returned by
/// [`uniti_world_new`] or [`uniti_world_open`] that has not yet been
/// freed. Calling this twice on the same handle is undefined behavior.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn uniti_world_free(world: *mut c_void) {
    if world.is_null() {
        return;
    }
    drop(unsafe { Box::from_raw(world as *mut WorldStore) });
}

/// FFI struct schema version. Bump when any `repr(C)` struct in this
/// module changes layout — Unity asserts on this at boot and refuses to
/// load the dylib if the value drifts from the C# constant. Catches the
/// silent-corruption case where the Rust side is rebuilt without
/// regenerating the C# bindings (or vice-versa).
pub const UNITI_FFI_SCHEMA_VERSION: u32 = 3;

/// Returns the current FFI schema version. Unity calls this once on
/// `WorldStoreSystem` boot and aborts if the returned value doesn't
/// match `UnitiSchema.Version` in the C# bindings.
///
/// # Safety
///
/// Always safe to call. Marked `unsafe` for FFI consistency.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn uniti_world_schema_version() -> u32 {
    UNITI_FFI_SCHEMA_VERSION
}

/// Summary of the world store's in-memory cache.
///
/// `last_flush_micros` is the wall-clock duration of the most recent
/// flush (sum of SQLite write batches, in microseconds).
/// `total_flushes` is a session-monotonic counter — UI / dev panels
/// derive cadence + flush rate from these without polling timing.
#[repr(C)]
#[derive(Debug, Clone, Copy, Default)]
pub struct FfiWorldStats {
    pub chunks: u32,
    pub hexes: u32,
    pub units: u32,
    pub buildings: u32,
    pub dirty_chunks: u32,
    pub dirty_hexes: u32,
    pub last_flush_micros: u64,
    pub total_flushes: u64,
}

/// Aggregate read-only counts.
///
/// # Returns
///
/// [`FfiWorldStats`] populated from the in-memory cache, or
/// [`FfiWorldStats::default`] (all zeros) if `world` is null or its
/// state lock is poisoned. Walks the in-memory `HashMap` only — no
/// SQLite read.
///
/// # Safety
///
/// `world` (when non-null) must point to a live store handle.
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
        last_flush_micros: world
            .last_flush_micros
            .load(std::sync::atomic::Ordering::Relaxed),
        total_flushes: world
            .total_flushes
            .load(std::sync::atomic::Ordering::Relaxed),
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

/// Create a zstd-compressed backup of the live SQLite DB. Flushes
/// pending dirty state first so the archive is a coherent snapshot.
/// Works only on disk-backed stores.
///
/// # Arguments
///
/// * `world` — live disk-backed store handle.
/// * `dst_ptr` — pointer to a UTF-8 destination path.
/// * `dst_len` — number of bytes pointed at by `dst_ptr`.
///
/// # Returns
///
/// `1` on success, `0` on any failure (null input, in-memory store,
/// invalid UTF-8, IO error, compression error).
///
/// # Safety
///
/// `world` (when non-null) must point to a live store handle. `dst_ptr`
/// (when non-null) must point to at least `dst_len` valid bytes.
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

    flush_dirty(
        &world.state,
        &world.db,
        &world.last_flush_micros,
        &world.total_flushes,
    );

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
    drop(db_lock);

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

/// Decompress a zstd archive produced by [`uniti_world_archive`] into
/// the destination path. Call before [`uniti_world_open`] on the
/// destination to restore a save slot.
///
/// # Arguments
///
/// * `src_ptr` / `src_len` — source archive path (UTF-8 bytes).
/// * `dst_ptr` / `dst_len` — destination DB path (UTF-8 bytes).
///
/// # Returns
///
/// `1` on success, `0` on any failure (null input, invalid UTF-8, IO
/// error, decompression error).
///
/// # Safety
///
/// `src_ptr` and `dst_ptr` (when non-null) must point to at least their
/// respective `*_len` bytes of valid UTF-8 data.
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

/// Returns `1` if any state is stored for the chunk `(cx, cy)`, `0`
/// otherwise. Cheap fast-path for chunk-load: skip per-hex queries
/// entirely if `0`.
///
/// # Safety
///
/// `world` (when non-null) must point to a live store handle.
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

/// Read the saved override for a hex.
///
/// # Returns
///
/// [`FfiHexLookup`] with `valid = 1` and the stored resources on hit;
/// `valid = 0` (and zeroed `res`) means no override exists — the caller
/// falls back to deterministic gen.
///
/// # Safety
///
/// `world` (when non-null) must point to a live store handle.
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

/// One hex divergence record for [`uniti_world_save_hexes_batch`].
#[repr(C)]
#[derive(Debug, Clone, Copy, Default)]
pub struct FfiHexSave {
    pub q: i32,
    pub r: i32,
    pub res: FfiHexResources,
}

/// Bulk variant of [`uniti_world_save_hex`]. Each entry upserts by
/// `(q, r)` like the single-record path.
///
/// # Arguments
///
/// * `world` — live store handle.
/// * `hexes_buf` — pointer to an array of [`FfiHexSave`] of length `count`.
/// * `count` — number of records.
///
/// # Safety
///
/// `world` (when non-null) must point to a live store handle.
/// `hexes_buf` (when non-null and `count > 0`) must point to at least
/// `count` valid [`FfiHexSave`] values.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn uniti_world_save_hexes_batch(
    world: *mut c_void,
    hexes_buf: *const FfiHexSave,
    count: u32,
) {
    let world = match unsafe { to_world_mut(world) } {
        Some(w) => w,
        None => return,
    };
    if count == 0 || hexes_buf.is_null() {
        return;
    }
    let mut state = match world.state.lock() {
        Ok(s) => s,
        Err(_) => return,
    };
    let slice = unsafe { std::slice::from_raw_parts(hexes_buf, count as usize) };
    for hex in slice {
        let chunk = chunk_of(hex.q, hex.r);
        state
            .chunks
            .entry(chunk)
            .or_default()
            .hexes
            .insert((hex.q, hex.r), hex.res);
        state.dirty_hexes.insert((hex.q, hex.r));
    }
}

/// Save a hex's resource state.
///
/// # Arguments
///
/// * `world` — live store handle.
/// * `q`, `r` — hex axial coords.
/// * `res` — divergent resource counts to persist.
///
/// Caller is responsible for only calling this on hexes that actually
/// diverged from the gen-time roll — pristine hexes should stay implicit.
///
/// # Safety
///
/// `world` (when non-null) must point to a live store handle.
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
    state.dirty_hexes.insert((q, r));
}

/// Push a ghost unit into the store. Chunk is derived from unit position.
///
/// # Safety
///
/// `world` (when non-null) must point to a live store handle.
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

/// Drain ghost units in a chunk into the caller's buffer. Units that
/// fit are removed from the store; unwritten remainders stay until the
/// next call.
///
/// # Arguments
///
/// * `world` — live store handle.
/// * `cx`, `cy` — chunk coords.
/// * `out_buf` — pointer to an array of at least `cap` [`FfiGhostUnit`].
/// * `cap` — buffer capacity in elements.
///
/// # Returns
///
/// Number of units written.
///
/// # Safety
///
/// `world` (when non-null) must point to a live store handle. `out_buf`
/// (when non-null and `cap > 0`) must point to at least `cap` writable
/// [`FfiGhostUnit`] slots.
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

    let drained: Vec<FfiGhostUnit> = chunk_data.units.drain(..take_n).collect();
    let slice = unsafe { std::slice::from_raw_parts_mut(out_buf, take_n) };
    slice.copy_from_slice(&drained);
    state.dirty_chunks.insert((cx, cy));
    take_n as u32
}

/// One slice of [`FfiGhostUnit`]s belonging to chunk `(cx, cy)`. Used by
/// [`uniti_world_replace_chunks_units_bulk`] to replace many chunks in
/// one FFI call.
#[repr(C)]
#[derive(Debug, Clone, Copy, Default)]
pub struct FfiChunkRange {
    pub cx: i32,
    pub cy: i32,
    pub offset: u32,
    pub count: u32,
}

/// Bulk variant of [`uniti_world_replace_chunk_units`]. Replaces every
/// chunk listed in `ranges_buf` in one FFI call.
///
/// # Arguments
///
/// * `world` — live store handle.
/// * `units_buf` — flat array of [`FfiGhostUnit`] of length `units_count`.
///   May be null when every range has `count = 0`.
/// * `units_count` — total elements in `units_buf`.
/// * `ranges_buf` — array of [`FfiChunkRange`] of length `ranges_count`.
///   Each `offset` indexes into `units_buf`; `count` is the slice length.
/// * `ranges_count` — number of ranges. Must be `> 0` for any work to
///   happen.
///
/// # Safety
///
/// `world` (when non-null) must point to a live store handle.
/// `ranges_buf` (when `ranges_count > 0`) must point to at least
/// `ranges_count` valid [`FfiChunkRange`] values. `units_buf` (when
/// non-null and `units_count > 0`) must point to at least `units_count`
/// valid [`FfiGhostUnit`] values, and every range's
/// `[offset, offset + count)` slice must lie within those bounds.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn uniti_world_replace_chunks_units_bulk(
    world: *mut c_void,
    units_buf: *const FfiGhostUnit,
    units_count: u32,
    ranges_buf: *const FfiChunkRange,
    ranges_count: u32,
) {
    let world = match unsafe { to_world_mut(world) } {
        Some(w) => w,
        None => return,
    };
    if ranges_count == 0 || ranges_buf.is_null() {
        return;
    }
    let mut state = match world.state.lock() {
        Ok(s) => s,
        Err(_) => return,
    };

    let ranges = unsafe { std::slice::from_raw_parts(ranges_buf, ranges_count as usize) };
    let units = if units_buf.is_null() || units_count == 0 {
        &[][..]
    } else {
        unsafe { std::slice::from_raw_parts(units_buf, units_count as usize) }
    };

    for r in ranges {
        let chunk_data = state.chunks.entry((r.cx, r.cy)).or_default();
        chunk_data.units.clear();
        if r.count > 0 {
            let start = r.offset as usize;
            let end = start.saturating_add(r.count as usize);
            if end <= units.len() {
                chunk_data.units.extend_from_slice(&units[start..end]);
            }
        }
        state.dirty_chunks.insert((r.cx, r.cy));
    }
}

/// Replace the entire unit set for a chunk. Drops every existing unit
/// in the chunk and writes the caller's buffer in its place.
///
/// Used during the periodic flush to push ghost-sim-advanced state back
/// to disk without growing duplicates — units have no stable per-record
/// uid in the FFI struct, so replacement is at chunk granularity.
///
/// # Arguments
///
/// * `world` — live store handle.
/// * `cx`, `cy` — chunk coords.
/// * `units_buf` — array of [`FfiGhostUnit`] of length `count`. May be
///   null only if `count == 0` (chunk-wipe).
/// * `count` — element count.
///
/// # Safety
///
/// `world` (when non-null) must point to a live store handle.
/// `units_buf` (when non-null and `count > 0`) must point to at least
/// `count` valid [`FfiGhostUnit`] values.
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

/// Number of ghost units stored for a chunk. Useful for sizing the
/// buffer before [`uniti_world_take_units_in_chunk`].
///
/// # Returns
///
/// Unit count, or `0` if the chunk has no entry or `world` is null.
///
/// # Safety
///
/// `world` (when non-null) must point to a live store handle.
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
/// [`uniti_world_take_all_units`] at session startup.
///
/// # Safety
///
/// `world` (when non-null) must point to a live store handle.
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
    for chunk in state.chunks.values() {
        total = total.saturating_add(chunk.units.len() as u32);
    }
    total
}

/// Drain every ghost unit across every chunk into the caller's flat
/// buffer. Used at session startup to rebuild the in-memory Unloaded
/// unit list from on-disk state.
///
/// # Arguments
///
/// * `world` — live store handle.
/// * `out_buf` — pointer to an array of at least `cap` [`FfiGhostUnit`].
/// * `cap` — buffer capacity in elements.
///
/// # Returns
///
/// Number of units written. If the total exceeds `cap`, the leftover
/// units stay in the store for the next call.
///
/// # Safety
///
/// `world` (when non-null) must point to a live store handle. `out_buf`
/// (when non-null and `cap > 0`) must point to at least `cap` writable
/// [`FfiGhostUnit`] slots.
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

/// Push an unloaded building into the store. Chunk is derived from the
/// building's root hex. Upserts by `(root_q, root_r)` so the periodic
/// flush re-saving every record back to disk doesn't grow duplicates.
///
/// # Safety
///
/// `world` (when non-null) must point to a live store handle.
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

/// Number of unloaded buildings stored for a chunk. Useful for sizing
/// the buffer before [`uniti_world_take_buildings_in_chunk`].
///
/// # Returns
///
/// Building count, or `0` if the chunk has no entry or `world` is null.
///
/// # Safety
///
/// `world` (when non-null) must point to a live store handle.
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

/// Drain unloaded buildings in a chunk into the caller's buffer.
/// Buildings that fit are removed; unwritten remainders stay until the
/// next call.
///
/// # Arguments
///
/// * `world` — live store handle.
/// * `cx`, `cy` — chunk coords.
/// * `out_buf` — pointer to an array of at least `cap`
///   [`FfiUnloadedBuilding`].
/// * `cap` — buffer capacity in elements.
///
/// # Returns
///
/// Number of buildings written.
///
/// # Safety
///
/// `world` (when non-null) must point to a live store handle. `out_buf`
/// (when non-null and `cap > 0`) must point to at least `cap` writable
/// [`FfiUnloadedBuilding`] slots.
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

/// Bulk variant of [`uniti_world_save_building`]. Each entry upserts by
/// `(root_q, root_r)` like the single-record path.
///
/// # Arguments
///
/// * `world` — live store handle.
/// * `buildings_buf` — array of [`FfiUnloadedBuilding`] of length
///   `count`. May be null only when `count == 0`.
/// * `count` — element count.
///
/// # Safety
///
/// `world` (when non-null) must point to a live store handle.
/// `buildings_buf` (when non-null and `count > 0`) must point to at
/// least `count` valid [`FfiUnloadedBuilding`] values.
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

/// Total unloaded buildings across all chunks. Use to size the buffer
/// for [`uniti_world_take_all_buildings`].
///
/// # Safety
///
/// `world` (when non-null) must point to a live store handle.
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
    for chunk in state.chunks.values() {
        total = total.saturating_add(chunk.buildings.len() as u32);
    }
    total
}

/// Drain every unloaded building across every chunk into the caller's
/// flat buffer. Used at session startup to rebuild the in-memory
/// Unloaded list from on-disk state — Rust is the canonical persistence
/// layer; the in-memory list is a session cache. Unwritten remainders
/// stay until the next call.
///
/// # Arguments
///
/// * `world` — live store handle.
/// * `out_buf` — pointer to an array of at least `cap`
///   [`FfiUnloadedBuilding`].
/// * `cap` — buffer capacity in elements.
///
/// # Returns
///
/// Number of buildings written.
///
/// # Safety
///
/// `world` (when non-null) must point to a live store handle. `out_buf`
/// (when non-null and `cap > 0`) must point to at least `cap` writable
/// [`FfiUnloadedBuilding`] slots.
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

#[repr(C)]
#[derive(Debug, Clone, Copy, Default)]
pub struct FfiChunkSummary {
    pub cx: i32,
    pub cy: i32,
    pub last_seen_ms: u64,
    pub last_tick_ms: u64,
    pub flags: u32,
    pub threat_level: u32,
    pub unit_count: u32,
    pub building_count: u32,
    pub aggregate_count: u32,
    pub valid: u8,
}

#[repr(C)]
#[derive(Debug, Clone, Copy, Default)]
pub struct FfiUnitAggregate {
    pub cx: i32,
    pub cy: i32,
    pub unit_type: u8,
    pub count: u32,
    pub avg_health: f32,
    pub hunger_pool: f32,
    pub last_tick_secs: f32,
}

fn read_chunk_summary(conn: &Connection, cx: i32, cy: i32) -> FfiChunkSummary {
    let mut s = FfiChunkSummary {
        cx,
        cy,
        ..Default::default()
    };
    let row: rusqlite::Result<(i64, i64, i64, i64, i64, i64, i64)> = conn.query_row(
        "SELECT last_seen_ms, last_tick_ms, flags, threat_level, unit_count, building_count, aggregate_count
         FROM chunks WHERE cx = ?1 AND cy = ?2",
        [cx as i64, cy as i64],
        |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?, r.get(4)?, r.get(5)?, r.get(6)?)),
    );
    if let Ok((seen, tick, flags, threat, uc, bc, ac)) = row {
        s.last_seen_ms = seen as u64;
        s.last_tick_ms = tick as u64;
        s.flags = flags as u32;
        s.threat_level = threat as u32;
        s.unit_count = uc as u32;
        s.building_count = bc as u32;
        s.aggregate_count = ac as u32;
        s.valid = 1;
    }
    s
}

fn refresh_chunk_counts(conn: &Connection, cx: i32, cy: i32) -> rusqlite::Result<()> {
    let uc: i64 = conn.query_row(
        "SELECT COUNT(*) FROM units WHERE cx = ?1 AND cy = ?2",
        [cx as i64, cy as i64],
        |r| r.get(0),
    )?;
    let bc: i64 = conn.query_row(
        "SELECT COUNT(*) FROM buildings WHERE cx = ?1 AND cy = ?2",
        [cx as i64, cy as i64],
        |r| r.get(0),
    )?;
    let ac: i64 = conn.query_row(
        "SELECT COUNT(*) FROM unit_aggregates WHERE cx = ?1 AND cy = ?2",
        [cx as i64, cy as i64],
        |r| r.get(0),
    )?;
    conn.execute(
        "UPDATE chunks SET unit_count = ?1, building_count = ?2, aggregate_count = ?3
         WHERE cx = ?4 AND cy = ?5",
        [uc, bc, ac, cx as i64, cy as i64],
    )?;
    Ok(())
}

#[unsafe(no_mangle)]
pub unsafe extern "C" fn uniti_world_chunk_touch(
    world: *mut c_void,
    cx: i32,
    cy: i32,
    last_seen_ms: u64,
    flags: u32,
    threat_level: u32,
) -> u8 {
    telemetry::bump(telemetry::CALL_CHUNK_TOUCH);
    if world.is_null() {
        set_error("chunk_touch: null world handle");
        return 0;
    }
    let world = unsafe { &*(world as *const WorldStore) };
    let db_guard = match world.db.lock() {
        Ok(g) => g,
        Err(_) => return 0,
    };
    let Some(conn) = db_guard.as_ref() else {
        return 0;
    };
    let res = conn.execute(
        "INSERT INTO chunks (cx, cy, last_seen_ms, flags, threat_level)
         VALUES (?1, ?2, ?3, ?4, ?5)
         ON CONFLICT(cx, cy) DO UPDATE SET
            last_seen_ms = excluded.last_seen_ms,
            flags = excluded.flags,
            threat_level = excluded.threat_level",
        [
            cx as i64,
            cy as i64,
            last_seen_ms as i64,
            flags as i64,
            threat_level as i64,
        ],
    );
    if res.is_ok() {
        let _ = refresh_chunk_counts(conn, cx, cy);
        1
    } else {
        0
    }
}

#[unsafe(no_mangle)]
pub unsafe extern "C" fn uniti_world_chunk_summary(
    world: *const c_void,
    cx: i32,
    cy: i32,
) -> FfiChunkSummary {
    telemetry::bump(telemetry::CALL_CHUNK_SUMMARY);
    if world.is_null() {
        return FfiChunkSummary::default();
    }
    let world = unsafe { &*(world as *const WorldStore) };
    let db_guard = match world.db.lock() {
        Ok(g) => g,
        Err(_) => return FfiChunkSummary::default(),
    };
    let Some(conn) = db_guard.as_ref() else {
        return FfiChunkSummary::default();
    };
    read_chunk_summary(conn, cx, cy)
}

#[unsafe(no_mangle)]
pub unsafe extern "C" fn uniti_world_prefetch_neighbors(
    world: *const c_void,
    cx: i32,
    cy: i32,
    out: *mut FfiChunkSummary,
    cap: u32,
) -> u32 {
    telemetry::bump(telemetry::CALL_PREFETCH_NEIGHBORS);
    if world.is_null() || out.is_null() || cap < 6 {
        return 0;
    }
    let world = unsafe { &*(world as *const WorldStore) };
    let db_guard = match world.db.lock() {
        Ok(g) => g,
        Err(_) => return 0,
    };
    let Some(conn) = db_guard.as_ref() else {
        return 0;
    };
    let neighbors = [
        (cx + 1, cy),
        (cx - 1, cy),
        (cx, cy + 1),
        (cx, cy - 1),
        (cx + 1, cy - 1),
        (cx - 1, cy + 1),
    ];
    let slice = unsafe { std::slice::from_raw_parts_mut(out, 6) };
    for (i, (nx, ny)) in neighbors.iter().enumerate() {
        slice[i] = read_chunk_summary(conn, *nx, *ny);
    }
    6
}

#[unsafe(no_mangle)]
pub unsafe extern "C" fn uniti_world_take_chunks_in_range(
    world: *mut c_void,
    cx_min: i32,
    cy_min: i32,
    cx_max: i32,
    cy_max: i32,
    out: *mut FfiChunkSummary,
    cap: u32,
) -> u32 {
    telemetry::bump(telemetry::CALL_TAKE_CHUNKS_RANGE);
    if world.is_null() || out.is_null() || cap == 0 {
        return 0;
    }
    let world = unsafe { &*(world as *const WorldStore) };
    let db_guard = match world.db.lock() {
        Ok(g) => g,
        Err(_) => return 0,
    };
    let Some(conn) = db_guard.as_ref() else {
        return 0;
    };
    let mut stmt = match conn.prepare(
        "SELECT cx, cy, last_seen_ms, last_tick_ms, flags, threat_level,
                unit_count, building_count, aggregate_count
         FROM chunks
         WHERE cx BETWEEN ?1 AND ?2 AND cy BETWEEN ?3 AND ?4
         LIMIT ?5",
    ) {
        Ok(s) => s,
        Err(_) => return 0,
    };
    let rows = stmt.query_map(
        [
            cx_min as i64,
            cx_max as i64,
            cy_min as i64,
            cy_max as i64,
            cap as i64,
        ],
        |r| {
            Ok(FfiChunkSummary {
                cx: r.get::<_, i64>(0)? as i32,
                cy: r.get::<_, i64>(1)? as i32,
                last_seen_ms: r.get::<_, i64>(2)? as u64,
                last_tick_ms: r.get::<_, i64>(3)? as u64,
                flags: r.get::<_, i64>(4)? as u32,
                threat_level: r.get::<_, i64>(5)? as u32,
                unit_count: r.get::<_, i64>(6)? as u32,
                building_count: r.get::<_, i64>(7)? as u32,
                aggregate_count: r.get::<_, i64>(8)? as u32,
                valid: 1,
            })
        },
    );
    let Ok(rows) = rows else { return 0 };
    let slice = unsafe { std::slice::from_raw_parts_mut(out, cap as usize) };
    let mut written = 0usize;
    for row in rows.flatten() {
        if written >= cap as usize {
            break;
        }
        slice[written] = row;
        written += 1;
    }
    written as u32
}

#[unsafe(no_mangle)]
pub unsafe extern "C" fn uniti_world_save_unit_aggregate(
    world: *mut c_void,
    agg: FfiUnitAggregate,
) -> u8 {
    telemetry::bump(telemetry::CALL_SAVE_AGGREGATE);
    if world.is_null() {
        set_error("save_unit_aggregate: null world handle");
        return 0;
    }
    let world = unsafe { &*(world as *const WorldStore) };
    let db_guard = match world.db.lock() {
        Ok(g) => g,
        Err(_) => return 0,
    };
    let Some(conn) = db_guard.as_ref() else {
        return 0;
    };
    let res = conn.execute(
        "INSERT INTO unit_aggregates (cx, cy, unit_type, count, avg_health, hunger_pool, last_tick_secs)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)
         ON CONFLICT(cx, cy, unit_type) DO UPDATE SET
            count = excluded.count,
            avg_health = excluded.avg_health,
            hunger_pool = excluded.hunger_pool,
            last_tick_secs = excluded.last_tick_secs",
        rusqlite::params![
            agg.cx as i64,
            agg.cy as i64,
            agg.unit_type as i64,
            agg.count as i64,
            agg.avg_health as f64,
            agg.hunger_pool as f64,
            agg.last_tick_secs as f64,
        ],
    );
    if res.is_ok() {
        let _ = refresh_chunk_counts(conn, agg.cx, agg.cy);
        1
    } else {
        0
    }
}

#[unsafe(no_mangle)]
pub unsafe extern "C" fn uniti_world_take_unit_aggregates_in_chunk(
    world: *mut c_void,
    cx: i32,
    cy: i32,
    out: *mut FfiUnitAggregate,
    cap: u32,
) -> u32 {
    telemetry::bump(telemetry::CALL_TAKE_AGGREGATES);
    if world.is_null() || out.is_null() || cap == 0 {
        return 0;
    }
    let world = unsafe { &*(world as *const WorldStore) };
    let db_guard = match world.db.lock() {
        Ok(g) => g,
        Err(_) => return 0,
    };
    let Some(conn) = db_guard.as_ref() else {
        return 0;
    };
    let mut stmt = match conn.prepare(
        "SELECT unit_type, count, avg_health, hunger_pool, last_tick_secs
         FROM unit_aggregates WHERE cx = ?1 AND cy = ?2 LIMIT ?3",
    ) {
        Ok(s) => s,
        Err(_) => return 0,
    };
    let rows = stmt.query_map([cx as i64, cy as i64, cap as i64], |r| {
        Ok(FfiUnitAggregate {
            cx,
            cy,
            unit_type: r.get::<_, i64>(0)? as u8,
            count: r.get::<_, i64>(1)? as u32,
            avg_health: r.get::<_, f64>(2)? as f32,
            hunger_pool: r.get::<_, f64>(3)? as f32,
            last_tick_secs: r.get::<_, f64>(4)? as f32,
        })
    });
    let Ok(rows) = rows else { return 0 };
    let slice = unsafe { std::slice::from_raw_parts_mut(out, cap as usize) };
    let mut written = 0usize;
    for row in rows.flatten() {
        if written >= cap as usize {
            break;
        }
        slice[written] = row;
        written += 1;
    }
    if written > 0 {
        let _ = conn.execute(
            "DELETE FROM unit_aggregates WHERE cx = ?1 AND cy = ?2",
            [cx as i64, cy as i64],
        );
        let _ = refresh_chunk_counts(conn, cx, cy);
    }
    written as u32
}

#[unsafe(no_mangle)]
pub unsafe extern "C" fn uniti_world_due_count(world: *const c_void, due_before_ms: u64) -> u32 {
    telemetry::bump(telemetry::CALL_DUE_COUNT);
    if world.is_null() {
        return 0;
    }
    let world = unsafe { &*(world as *const WorldStore) };
    let db_guard = match world.db.lock() {
        Ok(g) => g,
        Err(_) => return 0,
    };
    let Some(conn) = db_guard.as_ref() else {
        return 0;
    };
    conn.query_row(
        "SELECT COUNT(*) FROM chunks WHERE last_tick_ms < ?1",
        [due_before_ms as i64],
        |r| r.get::<_, i64>(0),
    )
    .map(|n| n as u32)
    .unwrap_or(0)
}

#[unsafe(no_mangle)]
pub unsafe extern "C" fn uniti_world_chunks_purge_stale(
    world: *mut c_void,
    older_than_ms: u64,
) -> u32 {
    telemetry::bump(telemetry::CALL_PURGE_STALE);
    if world.is_null() {
        return 0;
    }
    let world = unsafe { &*(world as *const WorldStore) };
    let db_guard = match world.db.lock() {
        Ok(g) => g,
        Err(_) => return 0,
    };
    let Some(conn) = db_guard.as_ref() else {
        return 0;
    };
    let stale: Vec<(i32, i32)> = match conn.prepare(
        "SELECT cx, cy FROM chunks
         WHERE last_seen_ms < ?1 AND unit_count = 0 AND building_count = 0 AND aggregate_count = 0",
    ) {
        Ok(mut stmt) => stmt
            .query_map([older_than_ms as i64], |r| {
                Ok((r.get::<_, i64>(0)? as i32, r.get::<_, i64>(1)? as i32))
            })
            .map(|rows| rows.flatten().collect())
            .unwrap_or_default(),
        Err(_) => return 0,
    };
    let mut purged = 0u32;
    for (cx, cy) in stale {
        let res = conn.execute(
            "DELETE FROM chunks WHERE cx = ?1 AND cy = ?2",
            [cx as i64, cy as i64],
        );
        if res.is_ok() {
            purged += 1;
        }
    }
    purged
}

use std::cell::RefCell;
use std::ffi::CString;

thread_local! {
    static LAST_ERROR: RefCell<Option<CString>> = const { RefCell::new(None) };
}

fn set_error(msg: impl Into<String>) {
    let s = CString::new(msg.into())
        .unwrap_or_else(|_| CString::new("uniti: error message contained NUL").unwrap());
    LAST_ERROR.with(|cell| *cell.borrow_mut() = Some(s));
}

fn clear_error() {
    LAST_ERROR.with(|cell| *cell.borrow_mut() = None);
}

#[unsafe(no_mangle)]
pub unsafe extern "C" fn uniti_world_last_error() -> *const c_char {
    LAST_ERROR.with(|cell| match cell.borrow().as_ref() {
        Some(s) => s.as_ptr(),
        None => std::ptr::null(),
    })
}

#[unsafe(no_mangle)]
pub unsafe extern "C" fn uniti_world_clear_error() {
    clear_error();
}

mod telemetry {
    use std::sync::atomic::{AtomicU64, Ordering};

    pub const N: usize = 16;
    pub const CALL_CHUNK_TOUCH: usize = 0;
    pub const CALL_CHUNK_SUMMARY: usize = 1;
    pub const CALL_PREFETCH_NEIGHBORS: usize = 2;
    pub const CALL_TAKE_CHUNKS_RANGE: usize = 3;
    pub const CALL_SAVE_AGGREGATE: usize = 4;
    pub const CALL_TAKE_AGGREGATES: usize = 5;
    pub const CALL_DUE_COUNT: usize = 6;
    pub const CALL_PURGE_STALE: usize = 7;
    pub const CALL_CHUNK_TOUCH_BATCH: usize = 8;
    pub const CALL_SAVE_AGGREGATE_BATCH: usize = 9;

    static COUNTERS: [AtomicU64; N] = [
        AtomicU64::new(0),
        AtomicU64::new(0),
        AtomicU64::new(0),
        AtomicU64::new(0),
        AtomicU64::new(0),
        AtomicU64::new(0),
        AtomicU64::new(0),
        AtomicU64::new(0),
        AtomicU64::new(0),
        AtomicU64::new(0),
        AtomicU64::new(0),
        AtomicU64::new(0),
        AtomicU64::new(0),
        AtomicU64::new(0),
        AtomicU64::new(0),
        AtomicU64::new(0),
    ];

    pub fn bump(idx: usize) {
        if idx < N {
            COUNTERS[idx].fetch_add(1, Ordering::Relaxed);
        }
    }

    pub fn snapshot(out: &mut [u64; N]) {
        for (i, c) in COUNTERS.iter().enumerate() {
            out[i] = c.load(Ordering::Relaxed);
        }
    }

    pub fn reset() {
        for c in COUNTERS.iter() {
            c.store(0, Ordering::Relaxed);
        }
    }
}

#[repr(C)]
#[derive(Debug, Clone, Copy, Default)]
pub struct FfiCallCounts {
    pub chunk_touch: u64,
    pub chunk_summary: u64,
    pub prefetch_neighbors: u64,
    pub take_chunks_range: u64,
    pub save_aggregate: u64,
    pub take_aggregates: u64,
    pub due_count: u64,
    pub purge_stale: u64,
    pub chunk_touch_batch: u64,
    pub save_aggregate_batch: u64,
}

#[unsafe(no_mangle)]
pub unsafe extern "C" fn uniti_world_call_counts() -> FfiCallCounts {
    let mut buf = [0u64; telemetry::N];
    telemetry::snapshot(&mut buf);
    FfiCallCounts {
        chunk_touch: buf[telemetry::CALL_CHUNK_TOUCH],
        chunk_summary: buf[telemetry::CALL_CHUNK_SUMMARY],
        prefetch_neighbors: buf[telemetry::CALL_PREFETCH_NEIGHBORS],
        take_chunks_range: buf[telemetry::CALL_TAKE_CHUNKS_RANGE],
        save_aggregate: buf[telemetry::CALL_SAVE_AGGREGATE],
        take_aggregates: buf[telemetry::CALL_TAKE_AGGREGATES],
        due_count: buf[telemetry::CALL_DUE_COUNT],
        purge_stale: buf[telemetry::CALL_PURGE_STALE],
        chunk_touch_batch: buf[telemetry::CALL_CHUNK_TOUCH_BATCH],
        save_aggregate_batch: buf[telemetry::CALL_SAVE_AGGREGATE_BATCH],
    }
}

#[unsafe(no_mangle)]
pub unsafe extern "C" fn uniti_world_call_counts_reset() {
    telemetry::reset();
}

#[repr(C)]
#[derive(Debug, Clone, Copy, Default)]
pub struct FfiChunkTouch {
    pub cx: i32,
    pub cy: i32,
    pub last_seen_ms: u64,
    pub flags: u32,
    pub threat_level: u32,
}

#[unsafe(no_mangle)]
pub unsafe extern "C" fn uniti_world_chunk_touch_batch(
    world: *mut c_void,
    items: *const FfiChunkTouch,
    count: u32,
) -> u32 {
    telemetry::bump(telemetry::CALL_CHUNK_TOUCH_BATCH);
    if world.is_null() || items.is_null() || count == 0 {
        set_error("chunk_touch_batch: null world/items or zero count");
        return 0;
    }
    let world = unsafe { &*(world as *const WorldStore) };
    let mut db_guard = match world.db.lock() {
        Ok(g) => g,
        Err(_) => {
            set_error("chunk_touch_batch: db mutex poisoned");
            return 0;
        }
    };
    let Some(conn) = db_guard.as_mut() else {
        set_error("chunk_touch_batch: db not open");
        return 0;
    };
    let slice = unsafe { std::slice::from_raw_parts(items, count as usize) };
    let tx = match conn.transaction() {
        Ok(t) => t,
        Err(e) => {
            set_error(format!("chunk_touch_batch: begin tx: {e}"));
            return 0;
        }
    };
    let mut written = 0u32;
    for item in slice {
        let res = tx.execute(
            "INSERT INTO chunks (cx, cy, last_seen_ms, flags, threat_level)
             VALUES (?1, ?2, ?3, ?4, ?5)
             ON CONFLICT(cx, cy) DO UPDATE SET
                last_seen_ms = excluded.last_seen_ms,
                flags = excluded.flags,
                threat_level = excluded.threat_level",
            [
                item.cx as i64,
                item.cy as i64,
                item.last_seen_ms as i64,
                item.flags as i64,
                item.threat_level as i64,
            ],
        );
        if res.is_ok() {
            written += 1;
        }
    }
    if let Err(e) = tx.commit() {
        set_error(format!("chunk_touch_batch: commit: {e}"));
        return 0;
    }
    for item in slice {
        let _ = refresh_chunk_counts(conn, item.cx, item.cy);
    }
    written
}

#[unsafe(no_mangle)]
pub unsafe extern "C" fn uniti_world_save_unit_aggregate_batch(
    world: *mut c_void,
    items: *const FfiUnitAggregate,
    count: u32,
) -> u32 {
    telemetry::bump(telemetry::CALL_SAVE_AGGREGATE_BATCH);
    if world.is_null() || items.is_null() || count == 0 {
        set_error("save_unit_aggregate_batch: null world/items or zero count");
        return 0;
    }
    let world = unsafe { &*(world as *const WorldStore) };
    let mut db_guard = match world.db.lock() {
        Ok(g) => g,
        Err(_) => {
            set_error("save_unit_aggregate_batch: db mutex poisoned");
            return 0;
        }
    };
    let Some(conn) = db_guard.as_mut() else {
        set_error("save_unit_aggregate_batch: db not open");
        return 0;
    };
    let slice = unsafe { std::slice::from_raw_parts(items, count as usize) };
    let tx = match conn.transaction() {
        Ok(t) => t,
        Err(e) => {
            set_error(format!("save_unit_aggregate_batch: begin tx: {e}"));
            return 0;
        }
    };
    let mut written = 0u32;
    let mut touched: std::collections::HashSet<(i32, i32)> = std::collections::HashSet::new();
    for item in slice {
        let res = tx.execute(
            "INSERT INTO unit_aggregates (cx, cy, unit_type, count, avg_health, hunger_pool, last_tick_secs)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)
             ON CONFLICT(cx, cy, unit_type) DO UPDATE SET
                count = excluded.count,
                avg_health = excluded.avg_health,
                hunger_pool = excluded.hunger_pool,
                last_tick_secs = excluded.last_tick_secs",
            rusqlite::params![
                item.cx as i64,
                item.cy as i64,
                item.unit_type as i64,
                item.count as i64,
                item.avg_health as f64,
                item.hunger_pool as f64,
                item.last_tick_secs as f64,
            ],
        );
        if res.is_ok() {
            written += 1;
            touched.insert((item.cx, item.cy));
        }
    }
    if let Err(e) = tx.commit() {
        set_error(format!("save_unit_aggregate_batch: commit: {e}"));
        return 0;
    }
    for (cx, cy) in touched {
        let _ = refresh_chunk_counts(conn, cx, cy);
    }
    written
}

use std::panic::{AssertUnwindSafe, catch_unwind};

fn ffi_guard<F, R>(label: &'static str, default: R, f: F) -> R
where
    F: FnOnce() -> R,
{
    match catch_unwind(AssertUnwindSafe(f)) {
        Ok(v) => v,
        Err(_) => {
            set_error(format!("{label}: panicked (caught and recovered)"));
            default
        }
    }
}

#[unsafe(no_mangle)]
pub unsafe extern "C" fn uniti_world_pause_ticker(world: *const c_void) -> u8 {
    ffi_guard("pause_ticker", 0, || {
        if world.is_null() {
            set_error("pause_ticker: null world");
            return 0;
        }
        let w = unsafe { &*(world as *const WorldStore) };
        w.ticker_paused
            .store(true, std::sync::atomic::Ordering::Relaxed);
        1
    })
}

#[unsafe(no_mangle)]
pub unsafe extern "C" fn uniti_world_resume_ticker(world: *const c_void) -> u8 {
    ffi_guard("resume_ticker", 0, || {
        if world.is_null() {
            set_error("resume_ticker: null world");
            return 0;
        }
        let w = unsafe { &*(world as *const WorldStore) };
        w.ticker_paused
            .store(false, std::sync::atomic::Ordering::Relaxed);
        1
    })
}

#[unsafe(no_mangle)]
pub unsafe extern "C" fn uniti_world_is_ticker_paused(world: *const c_void) -> u8 {
    if world.is_null() {
        return 0;
    }
    let w = unsafe { &*(world as *const WorldStore) };
    if w.ticker_paused.load(std::sync::atomic::Ordering::Relaxed) {
        1
    } else {
        0
    }
}

#[unsafe(no_mangle)]
pub unsafe extern "C" fn uniti_world_compact(world: *mut c_void) -> u8 {
    ffi_guard("compact", 0, || {
        if world.is_null() {
            set_error("compact: null world");
            return 0;
        }
        let w = unsafe { &*(world as *const WorldStore) };
        let db = match w.db.lock() {
            Ok(g) => g,
            Err(_) => {
                set_error("compact: db mutex poisoned");
                return 0;
            }
        };
        let Some(conn) = db.as_ref() else {
            set_error("compact: db not open");
            return 0;
        };
        let started = std::time::Instant::now();
        match conn.execute_batch("VACUUM;") {
            Ok(_) => {
                let elapsed_ms = started.elapsed().as_millis();
                if elapsed_ms > 500 {
                    eprintln!("[uniti-world] slow VACUUM: {elapsed_ms} ms");
                }
                1
            }
            Err(e) => {
                set_error(format!("compact: vacuum: {e}"));
                0
            }
        }
    })
}

#[repr(C)]
#[derive(Debug, Clone, Copy, Default)]
pub struct FfiDiskStats {
    pub page_size_bytes: u32,
    pub page_count: u64,
    pub freelist_count: u64,
    pub wal_pages: u64,
    pub disk_size_bytes: u64,
    pub valid: u8,
}

#[unsafe(no_mangle)]
pub unsafe extern "C" fn uniti_world_disk_stats(world: *const c_void) -> FfiDiskStats {
    ffi_guard("disk_stats", FfiDiskStats::default(), || {
        if world.is_null() {
            return FfiDiskStats::default();
        }
        let w = unsafe { &*(world as *const WorldStore) };
        let db = match w.db.lock() {
            Ok(g) => g,
            Err(_) => return FfiDiskStats::default(),
        };
        let Some(conn) = db.as_ref() else {
            return FfiDiskStats::default();
        };
        let mut s = FfiDiskStats::default();
        if let Ok(v) = conn.query_row("PRAGMA page_size", [], |r| r.get::<_, i64>(0)) {
            s.page_size_bytes = v as u32;
        }
        if let Ok(v) = conn.query_row("PRAGMA page_count", [], |r| r.get::<_, i64>(0)) {
            s.page_count = v as u64;
        }
        if let Ok(v) = conn.query_row("PRAGMA freelist_count", [], |r| r.get::<_, i64>(0)) {
            s.freelist_count = v as u64;
        }
        if let Ok(v) = conn.query_row("PRAGMA wal_checkpoint(PASSIVE)", [], |r| r.get::<_, i64>(1))
        {
            s.wal_pages = v as u64;
        }
        s.disk_size_bytes = s.page_count * s.page_size_bytes as u64;
        s.valid = 1;
        s
    })
}

pub struct ChunkIter {
    rows: Vec<FfiChunkSummary>,
    pos: usize,
}

#[unsafe(no_mangle)]
pub unsafe extern "C" fn uniti_world_chunks_iter_open(world: *const c_void) -> *mut c_void {
    ffi_guard("chunks_iter_open", std::ptr::null_mut(), || {
        if world.is_null() {
            set_error("chunks_iter_open: null world");
            return std::ptr::null_mut();
        }
        let w = unsafe { &*(world as *const WorldStore) };
        let db = match w.db.lock() {
            Ok(g) => g,
            Err(_) => {
                set_error("chunks_iter_open: db mutex poisoned");
                return std::ptr::null_mut();
            }
        };
        let Some(conn) = db.as_ref() else {
            set_error("chunks_iter_open: db not open");
            return std::ptr::null_mut();
        };
        let mut stmt = match conn.prepare(
            "SELECT cx, cy, last_seen_ms, last_tick_ms, flags, threat_level,
                    unit_count, building_count, aggregate_count
             FROM chunks ORDER BY cx, cy",
        ) {
            Ok(s) => s,
            Err(e) => {
                set_error(format!("chunks_iter_open: prepare: {e}"));
                return std::ptr::null_mut();
            }
        };
        let rows: Vec<FfiChunkSummary> = stmt
            .query_map([], |r| {
                Ok(FfiChunkSummary {
                    cx: r.get::<_, i64>(0)? as i32,
                    cy: r.get::<_, i64>(1)? as i32,
                    last_seen_ms: r.get::<_, i64>(2)? as u64,
                    last_tick_ms: r.get::<_, i64>(3)? as u64,
                    flags: r.get::<_, i64>(4)? as u32,
                    threat_level: r.get::<_, i64>(5)? as u32,
                    unit_count: r.get::<_, i64>(6)? as u32,
                    building_count: r.get::<_, i64>(7)? as u32,
                    aggregate_count: r.get::<_, i64>(8)? as u32,
                    valid: 1,
                })
            })
            .map(|r| r.flatten().collect())
            .unwrap_or_default();
        let iter = Box::new(ChunkIter { rows, pos: 0 });
        Box::into_raw(iter) as *mut c_void
    })
}

#[unsafe(no_mangle)]
pub unsafe extern "C" fn uniti_world_chunks_iter_next(
    iter: *mut c_void,
    out: *mut FfiChunkSummary,
) -> u8 {
    if iter.is_null() || out.is_null() {
        return 0;
    }
    let it = unsafe { &mut *(iter as *mut ChunkIter) };
    if it.pos >= it.rows.len() {
        return 0;
    }
    unsafe { *out = it.rows[it.pos] };
    it.pos += 1;
    1
}

#[unsafe(no_mangle)]
pub unsafe extern "C" fn uniti_world_chunks_iter_remaining(iter: *const c_void) -> u32 {
    if iter.is_null() {
        return 0;
    }
    let it = unsafe { &*(iter as *const ChunkIter) };
    (it.rows.len().saturating_sub(it.pos)) as u32
}

#[unsafe(no_mangle)]
pub unsafe extern "C" fn uniti_world_chunks_iter_close(iter: *mut c_void) {
    if iter.is_null() {
        return;
    }
    unsafe {
        drop(Box::from_raw(iter as *mut ChunkIter));
    }
}

pub const FFI_ABI_VERSION: u64 = 0x0001_0000_0000_0001;

#[unsafe(no_mangle)]
pub unsafe extern "C" fn uniti_world_abi_version() -> u64 {
    FFI_ABI_VERSION
}

#[unsafe(no_mangle)]
pub unsafe extern "C" fn uniti_world_integrity_check(world: *const c_void) -> u8 {
    ffi_guard("integrity_check", 0, || {
        if world.is_null() {
            set_error("integrity_check: null world");
            return 0;
        }
        let w = unsafe { &*(world as *const WorldStore) };
        let db = match w.db.lock() {
            Ok(g) => g,
            Err(_) => {
                set_error("integrity_check: db mutex poisoned");
                return 0;
            }
        };
        let Some(conn) = db.as_ref() else {
            set_error("integrity_check: db not open");
            return 0;
        };
        match conn.query_row("PRAGMA integrity_check", [], |r| r.get::<_, String>(0)) {
            Ok(s) if s == "ok" => 1,
            Ok(s) => {
                set_error(format!("integrity_check: {s}"));
                0
            }
            Err(e) => {
                set_error(format!("integrity_check: {e}"));
                0
            }
        }
    })
}

#[unsafe(no_mangle)]
pub unsafe extern "C" fn uniti_world_open_readonly(
    path_ptr: *const c_char,
    path_len: u32,
) -> *mut c_void {
    ffi_guard("open_readonly", std::ptr::null_mut(), || {
        if path_ptr.is_null() || path_len == 0 {
            set_error("open_readonly: empty path");
            return std::ptr::null_mut();
        }
        let bytes = unsafe { std::slice::from_raw_parts(path_ptr as *const u8, path_len as usize) };
        let path_str = match std::str::from_utf8(bytes) {
            Ok(s) => s,
            Err(_) => {
                set_error("open_readonly: utf8 path required");
                return std::ptr::null_mut();
            }
        };
        let path = PathBuf::from(path_str);
        let conn = match Connection::open_with_flags(
            &path,
            rusqlite::OpenFlags::SQLITE_OPEN_READ_ONLY | rusqlite::OpenFlags::SQLITE_OPEN_NO_MUTEX,
        ) {
            Ok(c) => c,
            Err(e) => {
                set_error(format!("open_readonly: {e}"));
                return std::ptr::null_mut();
            }
        };
        let _ = conn.busy_timeout(Duration::from_millis(500));
        let _ = conn.pragma_update(None, "mmap_size", 268_435_456i64);
        let store = WorldStore::build(Some(conn));
        Box::into_raw(Box::new(store)) as *mut c_void
    })
}

#[repr(C)]
#[derive(Debug, Clone, Copy, Default)]
pub struct FfiSchemaCounts {
    pub hexes: u64,
    pub units: u64,
    pub buildings: u64,
    pub chunks: u64,
    pub unit_aggregates: u64,
    pub schema_version: u32,
    pub valid: u8,
}

#[unsafe(no_mangle)]
pub unsafe extern "C" fn uniti_world_schema_counts(world: *const c_void) -> FfiSchemaCounts {
    ffi_guard("schema_counts", FfiSchemaCounts::default(), || {
        if world.is_null() {
            return FfiSchemaCounts::default();
        }
        let w = unsafe { &*(world as *const WorldStore) };
        let db = match w.db.lock() {
            Ok(g) => g,
            Err(_) => return FfiSchemaCounts::default(),
        };
        let Some(conn) = db.as_ref() else {
            return FfiSchemaCounts::default();
        };
        let mut s = FfiSchemaCounts::default();
        for (col, table) in [
            (&mut s.hexes, "hexes"),
            (&mut s.units, "units"),
            (&mut s.buildings, "buildings"),
            (&mut s.chunks, "chunks"),
            (&mut s.unit_aggregates, "unit_aggregates"),
        ] {
            if let Ok(n) = conn.query_row(&format!("SELECT COUNT(*) FROM {table}"), [], |r| {
                r.get::<_, i64>(0)
            }) {
                *col = n as u64;
            }
        }
        if let Ok(v) = conn.query_row(
            "SELECT value FROM meta WHERE key = 'schema_version'",
            [],
            |r| r.get::<_, String>(0),
        ) {
            s.schema_version = v.parse().unwrap_or(0);
        }
        s.valid = 1;
        s
    })
}

#[unsafe(no_mangle)]
pub unsafe extern "C" fn uniti_world_export_chunk_json(
    world: *const c_void,
    cx: i32,
    cy: i32,
    out_buf: *mut u8,
    cap: u32,
) -> u32 {
    ffi_guard("export_chunk_json", 0, || {
        if world.is_null() || out_buf.is_null() || cap == 0 {
            return 0;
        }
        let w = unsafe { &*(world as *const WorldStore) };
        let db = match w.db.lock() {
            Ok(g) => g,
            Err(_) => return 0,
        };
        let Some(conn) = db.as_ref() else {
            return 0;
        };
        let summary = read_chunk_summary(conn, cx, cy);
        let unit_count: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM units WHERE cx = ?1 AND cy = ?2",
                [cx as i64, cy as i64],
                |r| r.get(0),
            )
            .unwrap_or(0);
        let building_count: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM buildings WHERE cx = ?1 AND cy = ?2",
                [cx as i64, cy as i64],
                |r| r.get(0),
            )
            .unwrap_or(0);
        let aggregates: Vec<(i64, i64, f64, f64)> = conn
            .prepare(
                "SELECT unit_type, count, avg_health, hunger_pool
                 FROM unit_aggregates WHERE cx = ?1 AND cy = ?2",
            )
            .and_then(|mut st| {
                let rows = st
                    .query_map([cx as i64, cy as i64], |r| {
                        Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?))
                    })?
                    .flatten()
                    .collect::<Vec<_>>();
                Ok(rows)
            })
            .unwrap_or_default();
        let aggs_json = aggregates
            .iter()
            .map(|(t, n, h, hu)| {
                format!(
                    "{{\"unit_type\":{t},\"count\":{n},\"avg_health\":{h},\"hunger_pool\":{hu}}}"
                )
            })
            .collect::<Vec<_>>()
            .join(",");
        let json = format!(
            "{{\"cx\":{cx},\"cy\":{cy},\"valid\":{v},\"last_seen_ms\":{ls},\"last_tick_ms\":{lt},\"flags\":{f},\"threat_level\":{th},\"unit_count\":{uc},\"building_count\":{bc},\"unit_aggregates\":[{aggs_json}]}}",
            v = summary.valid,
            ls = summary.last_seen_ms,
            lt = summary.last_tick_ms,
            f = summary.flags,
            th = summary.threat_level,
            uc = unit_count,
            bc = building_count,
        );
        let bytes = json.as_bytes();
        let n = bytes.len().min(cap as usize);
        let dst = unsafe { std::slice::from_raw_parts_mut(out_buf, n) };
        dst.copy_from_slice(&bytes[..n]);
        n as u32
    })
}

pub type LogCallback = extern "C" fn(level: u8, msg: *const c_char);

static LOG_CALLBACK: std::sync::Mutex<Option<LogCallback>> = std::sync::Mutex::new(None);

#[unsafe(no_mangle)]
pub unsafe extern "C" fn uniti_world_set_log_callback(cb: Option<LogCallback>) {
    if let Ok(mut guard) = LOG_CALLBACK.lock() {
        *guard = cb;
    }
}
