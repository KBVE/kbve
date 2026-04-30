mod common;
use common::WorldGuard;
use uniti::ffi_world::*;

#[test]
fn open_returns_non_null_for_valid_path() {
    let world = WorldGuard::new();
    let stats = unsafe { uniti_world_stats(world.handle) };
    assert_eq!(stats.units, 0);
    assert_eq!(stats.buildings, 0);
    assert_eq!(stats.hexes, 0);
}

#[test]
fn schema_version_matches_constant() {
    let v = unsafe { uniti_world_schema_version() };
    assert!(v >= 3, "schema version should be at least 3, got {}", v);
}

#[test]
fn save_and_get_hex_round_trip() {
    let world = WorldGuard::new();
    let res = FfiHexResources {
        wood: 12,
        stone: 5,
        berries: 3,
        mushrooms: 0,
        herbs: 7,
        cactus: 0,
        cactus_variant: 0,
    };
    unsafe { uniti_world_save_hex(world.handle, 10, 20, res) };
    let lookup = unsafe { uniti_world_get_hex(world.handle, 10, 20) };
    assert_eq!(lookup.valid, 1);
    assert_eq!(lookup.res.wood, 12);
    assert_eq!(lookup.res.stone, 5);
    assert_eq!(lookup.res.herbs, 7);
}

#[test]
fn get_hex_for_missing_returns_invalid() {
    let world = WorldGuard::new();
    let lookup = unsafe { uniti_world_get_hex(world.handle, 9999, 9999) };
    assert_eq!(lookup.valid, 0);
}

#[test]
fn has_chunk_starts_false() {
    let world = WorldGuard::new();
    let has = unsafe { uniti_world_has_chunk(world.handle, 0, 0) };
    assert_eq!(has, 0);
}

#[test]
fn save_unit_and_count_in_chunk() {
    let world = WorldGuard::new();
    let unit = FfiGhostUnit {
        unit_type: 1,
        q: 5,
        r: 5,
        health: 100.0,
        max_health: 100.0,
        ..Default::default()
    };
    unsafe { uniti_world_save_unit(world.handle, unit) };
    let count = unsafe { uniti_world_unit_count_in_chunk(world.handle, 0, 0) };
    assert_eq!(count, 1);
    let total = unsafe { uniti_world_total_unit_count(world.handle) };
    assert_eq!(total, 1);
}
