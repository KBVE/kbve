//! Pathfinding FFI surface — `BlockGrid` + `FlowField` over an opaque
//! handle. See the crate root for the shared safety contract.

use std::ffi::c_void;

use bevy_pathfinding::flow_field::FlowField;
use bevy_pathfinding::grid::{BlockGrid, CellNav, SurfaceKind};

/// Direction sample returned by [`uniti_flow_direction`].
///
/// `valid = 0` means the cell has no resolved direction (out of bounds,
/// blocked, or equidistant from all goals). `valid = 1` means `(dx, dz)`
/// is the next-step delta with each component in `-1..=1`.
#[repr(C)]
pub struct FfiDirection {
    pub dx: i32,
    pub dz: i32,
    pub valid: u8,
}

/// Create an empty grid (all cells [`SurfaceKind::Blocked`]) covering
/// the rectangle `(origin_x, origin_z) ..= (origin_x + width - 1,
/// origin_z + depth - 1)`.
///
/// # Arguments
///
/// * `origin_x` / `origin_z` — minimum block coords (inclusive).
/// * `width` / `depth` — region dimensions in cells.
///
/// # Returns
///
/// Opaque handle the caller must eventually pass to [`uniti_grid_free`].
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

/// Set a cell in the grid. No-op if `grid` is null or `(x, z)` is out
/// of bounds.
///
/// # Arguments
///
/// * `grid` — handle from [`uniti_grid_new`].
/// * `x` / `z` — absolute block coords.
/// * `height` — Y coordinate of the walkable surface.
/// * `surface_kind` — `0 = Blocked, 1 = Solid, 2 = Slow, 3 = Hazard`.
///   Any other value is treated as `Blocked`.
///
/// # Safety
///
/// `grid` (when non-null) must point to a live grid handle returned by
/// [`uniti_grid_new`].
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

/// Returns `1` if the cell at `(x, z)` is walkable, `0` otherwise.
/// Out-of-bounds coords and a null `grid` return `0`.
///
/// # Safety
///
/// `grid` (when non-null) must point to a live grid handle returned by
/// [`uniti_grid_new`].
#[unsafe(no_mangle)]
pub unsafe extern "C" fn uniti_grid_is_walkable(grid: *const c_void, x: i32, z: i32) -> u8 {
    if grid.is_null() {
        return 0;
    }
    let grid = unsafe { &*(grid as *const BlockGrid) };
    grid.is_walkable(x, z) as u8
}

/// Free a grid allocated by [`uniti_grid_new`]. Null-safe.
///
/// # Safety
///
/// `grid` (when non-null) must be a live handle returned by
/// [`uniti_grid_new`] that has not yet been freed.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn uniti_grid_free(grid: *mut c_void) {
    if !grid.is_null() {
        unsafe { drop(Box::from_raw(grid as *mut BlockGrid)) };
    }
}

/// Compute a flow field toward the given goals.
///
/// # Arguments
///
/// * `grid` — handle from [`uniti_grid_new`].
/// * `goals_ptr` — flat array of `[x0, z0, x1, z1, ...]` block coords.
/// * `goal_count` — number of `(x, z)` pairs (so `2 * goal_count` i32s
///   total).
///
/// # Returns
///
/// Opaque flow-field handle, or null if `grid` / `goals_ptr` is null or
/// `goal_count == 0`. Caller must free with [`uniti_flow_free`].
///
/// # Safety
///
/// `grid` (when non-null) must point to a live grid handle. `goals_ptr`
/// (when non-null) must point to at least `2 * goal_count` valid `i32`
/// elements.
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

/// Compute a flee field that guides AWAY from the given sources.
///
/// # Arguments
///
/// * `grid` — handle from [`uniti_grid_new`].
/// * `sources_ptr` — flat array of `[x0, z0, x1, z1, ...]` block coords.
/// * `source_count` — number of `(x, z)` pairs.
///
/// # Returns
///
/// Opaque flow-field handle, or null on invalid input. Caller must free
/// with [`uniti_flow_free`].
///
/// # Safety
///
/// `grid` (when non-null) must point to a live grid handle. `sources_ptr`
/// (when non-null) must point to at least `2 * source_count` valid `i32`
/// elements.
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
///
/// # Returns
///
/// [`FfiDirection`] with `valid = 1` and the next-step delta when the
/// cell is reachable; `valid = 0` (and `dx = dz = 0`) when `field` is
/// null, the cell is out of bounds, or the cell is unreachable.
///
/// # Safety
///
/// `field` (when non-null) must point to a live flow-field handle
/// returned by [`uniti_flow_compute`] or [`uniti_flow_compute_flee`].
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

/// BFS distance to the nearest goal.
///
/// # Returns
///
/// The cell distance, or `u32::MAX` for out-of-bounds, unreachable, or
/// when `field` is null.
///
/// # Safety
///
/// `field` (when non-null) must point to a live flow-field handle.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn uniti_flow_distance(field: *const c_void, x: i32, z: i32) -> u32 {
    if field.is_null() {
        return u32::MAX;
    }
    let field = unsafe { &*(field as *const FlowField) };
    field.distance(x, z).unwrap_or(u32::MAX)
}

/// Free a flow field allocated by [`uniti_flow_compute`] or
/// [`uniti_flow_compute_flee`]. Null-safe.
///
/// # Safety
///
/// `field` (when non-null) must be a live handle that has not yet been
/// freed.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn uniti_flow_free(field: *mut c_void) {
    if !field.is_null() {
        unsafe { drop(Box::from_raw(field as *mut FlowField)) };
    }
}
