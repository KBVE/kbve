// FFI bridge for the pathfinding system (Unity / C# consumer).
// Shared safety contract for `pub unsafe extern "C" fn` items is
// documented at the crate root (src/lib.rs).

use std::ffi::c_void;

use bevy_pathfinding::flow_field::FlowField;
use bevy_pathfinding::grid::{BlockGrid, CellNav, SurfaceKind};

// ---------------------------------------------------------------------------
// FFI result struct for direction queries
// ---------------------------------------------------------------------------

#[repr(C)]
pub struct FfiDirection {
    pub dx: i32,
    pub dz: i32,
    pub valid: u8,
}

// ---------------------------------------------------------------------------
// BlockGrid — opaque handle (C# sees IntPtr)
// ---------------------------------------------------------------------------

/// Create an empty grid. Caller must free with `uniti_grid_free`.
#[unsafe(no_mangle)]
pub extern "C" fn uniti_grid_new(
    origin_x: i32,
    origin_z: i32,
    width: u32,
    depth: u32,
) -> *mut c_void {
    let grid = Box::new(BlockGrid::new(origin_x, origin_z, width, depth));
    Box::into_raw(grid) as *mut c_void
}

/// Set a cell in the grid.
///
/// `surface_kind`: 0=Blocked, 1=Solid, 2=Slow, 3=Hazard
#[unsafe(no_mangle)]
pub unsafe extern "C" fn uniti_grid_set(
    grid: *mut c_void,
    x: i32,
    z: i32,
    height: i32,
    surface_kind: u8,
) {
    if grid.is_null() {
        return;
    }
    let grid = unsafe { &mut *(grid as *mut BlockGrid) };
    let surface = match surface_kind {
        1 => SurfaceKind::Solid,
        2 => SurfaceKind::Slow,
        3 => SurfaceKind::Hazard,
        _ => SurfaceKind::Blocked,
    };
    grid.set(
        x,
        z,
        CellNav {
            height,
            surface,
            cost: surface.base_cost(),
        },
    );
}

/// Check if a cell is walkable.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn uniti_grid_is_walkable(grid: *const c_void, x: i32, z: i32) -> u8 {
    if grid.is_null() {
        return 0;
    }
    let grid = unsafe { &*(grid as *const BlockGrid) };
    grid.is_walkable(x, z) as u8
}

/// Free a grid allocated by `uniti_grid_new`.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn uniti_grid_free(grid: *mut c_void) {
    if !grid.is_null() {
        unsafe { drop(Box::from_raw(grid as *mut BlockGrid)) };
    }
}

// ---------------------------------------------------------------------------
// FlowField — opaque handle (C# sees IntPtr)
// ---------------------------------------------------------------------------

/// Compute a flow field toward the given goals.
///
/// `goals_ptr` is a flat array of `[x0, z0, x1, z1, ...]` with `goal_count` pairs.
/// Caller must free the result with `uniti_flow_free`.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn uniti_flow_compute(
    grid: *const c_void,
    goals_ptr: *const i32,
    goal_count: u32,
) -> *mut c_void {
    if grid.is_null() || goals_ptr.is_null() || goal_count == 0 {
        return std::ptr::null_mut();
    }
    let grid = unsafe { &*(grid as *const BlockGrid) };
    let pairs = unsafe { std::slice::from_raw_parts(goals_ptr, (goal_count * 2) as usize) };
    let goals: Vec<(i32, i32)> = pairs.chunks_exact(2).map(|c| (c[0], c[1])).collect();

    Box::into_raw(Box::new(FlowField::compute(grid, &goals))) as *mut c_void
}

/// Compute a flee field (away from sources).
#[unsafe(no_mangle)]
pub unsafe extern "C" fn uniti_flow_compute_flee(
    grid: *const c_void,
    sources_ptr: *const i32,
    source_count: u32,
) -> *mut c_void {
    if grid.is_null() || sources_ptr.is_null() || source_count == 0 {
        return std::ptr::null_mut();
    }
    let grid = unsafe { &*(grid as *const BlockGrid) };
    let pairs = unsafe { std::slice::from_raw_parts(sources_ptr, (source_count * 2) as usize) };
    let sources: Vec<(i32, i32)> = pairs.chunks_exact(2).map(|c| (c[0], c[1])).collect();

    Box::into_raw(Box::new(FlowField::compute_flee(grid, &sources))) as *mut c_void
}

/// Query the direction at a cell.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn uniti_flow_direction(
    field: *const c_void,
    x: i32,
    z: i32,
) -> FfiDirection {
    if field.is_null() {
        return FfiDirection {
            dx: 0,
            dz: 0,
            valid: 0,
        };
    }
    let field = unsafe { &*(field as *const FlowField) };
    match field.direction(x, z) {
        Some((dx, dz)) => FfiDirection { dx, dz, valid: 1 },
        None => FfiDirection {
            dx: 0,
            dz: 0,
            valid: 0,
        },
    }
}

/// Query the BFS distance to the nearest goal. Returns u32::MAX if unreachable.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn uniti_flow_distance(field: *const c_void, x: i32, z: i32) -> u32 {
    if field.is_null() {
        return u32::MAX;
    }
    let field = unsafe { &*(field as *const FlowField) };
    field.distance(x, z).unwrap_or(u32::MAX)
}

/// Free a flow field allocated by `uniti_flow_compute` or `uniti_flow_compute_flee`.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn uniti_flow_free(field: *mut c_void) {
    if !field.is_null() {
        unsafe { drop(Box::from_raw(field as *mut FlowField)) };
    }
}
