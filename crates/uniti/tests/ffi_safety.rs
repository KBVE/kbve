mod common;
use common::WorldGuard;
use std::ffi::{CStr, CString};
use std::os::raw::c_char;
use uniti::ffi_world::*;

#[test]
fn abi_version_is_constant() {
    let v1 = unsafe { uniti_world_abi_version() };
    let v2 = unsafe { uniti_world_abi_version() };
    assert_eq!(v1, v2);
    assert_eq!(v1, FFI_ABI_VERSION);
}

#[test]
fn integrity_check_passes_on_fresh_db() {
    let world = WorldGuard::new();
    unsafe { uniti_world_chunk_touch(world.handle, 1, 2, 100, 0, 0) };
    let ok = unsafe { uniti_world_integrity_check(world.handle) };
    assert_eq!(ok, 1);
}

#[test]
fn open_readonly_blocks_writes() {
    let temp = tempfile::NamedTempFile::new().unwrap();
    let path = temp.path().to_str().unwrap().to_string();
    {
        let cpath = CString::new(path.as_str()).unwrap();
        let h = unsafe { uniti_world_open(cpath.as_ptr() as *const c_char, path.len() as u32) };
        assert!(!h.is_null());
        unsafe {
            uniti_world_chunk_touch(h, 5, 5, 1, 0, 0);
            uniti_world_flush(h);
            uniti_world_free(h);
        };
    }
    let cpath = CString::new(path.as_str()).unwrap();
    let ro =
        unsafe { uniti_world_open_readonly(cpath.as_ptr() as *const c_char, path.len() as u32) };
    assert!(!ro.is_null(), "open_readonly returned null");
    let s = unsafe { uniti_world_chunk_summary(ro, 5, 5) };
    assert_eq!(s.valid, 1);
    let writeok = unsafe { uniti_world_chunk_touch(ro, 6, 6, 1, 0, 0) };
    assert_eq!(writeok, 0);
    unsafe { uniti_world_free(ro) };
}

#[test]
fn schema_counts_returns_table_sizes() {
    let world = WorldGuard::new();
    for i in 0..7 {
        unsafe { uniti_world_chunk_touch(world.handle, i, 0, 1, 0, 0) };
    }
    let counts = unsafe { uniti_world_schema_counts(world.handle) };
    assert_eq!(counts.valid, 1);
    assert_eq!(counts.chunks, 7);
    assert!(counts.schema_version >= 3);
}

#[test]
fn export_chunk_json_writes_valid_json() {
    let world = WorldGuard::new();
    unsafe { uniti_world_chunk_touch(world.handle, 4, 7, 999, 1, 50) };
    unsafe {
        uniti_world_save_unit_aggregate(
            world.handle,
            FfiUnitAggregate {
                cx: 4,
                cy: 7,
                unit_type: 1,
                count: 3,
                avg_health: 0.9,
                hunger_pool: 0.0,
                last_tick_secs: 0.0,
            },
        )
    };
    let mut buf = vec![0u8; 1024];
    let n = unsafe {
        uniti_world_export_chunk_json(world.handle, 4, 7, buf.as_mut_ptr(), buf.len() as u32)
    };
    assert!(n > 0);
    let s = std::str::from_utf8(&buf[..n as usize]).unwrap();
    assert!(s.contains("\"cx\":4"));
    assert!(s.contains("\"cy\":7"));
    assert!(s.contains("\"threat_level\":50"));
    assert!(s.contains("\"unit_type\":1"));
}

extern "C" fn capture_log(_level: u8, msg: *const c_char) {
    let m = unsafe { CStr::from_ptr(msg) }.to_str().unwrap_or("");
    eprintln!("[capture] {m}");
}

#[test]
fn log_callback_can_be_set_and_cleared() {
    unsafe { uniti_world_set_log_callback(Some(capture_log)) };
    unsafe { uniti_world_set_log_callback(None) };
}
