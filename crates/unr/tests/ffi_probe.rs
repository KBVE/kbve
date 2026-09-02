use std::ffi::CStr;

use unr::ffi_probe::{unr_add, unr_runtime_probe, unr_version};

#[test]
fn version_is_the_crate_version() {
    let v = unsafe { CStr::from_ptr(unr_version()) };
    assert_eq!(v.to_str().unwrap(), env!("CARGO_PKG_VERSION"));
}

#[test]
fn add_round_trips() {
    assert_eq!(unr_add(2, 40), 42);
    assert_eq!(unr_add(i32::MAX, 1), i32::MIN);
}

#[test]
fn runtime_probe_runs_on_the_blocking_pool() {
    assert_eq!(unr_runtime_probe(0), 0);
    assert_eq!(unr_runtime_probe(10), 45);
}

#[test]
fn runtime_probe_is_reusable() {
    // The runtime is a OnceLock; a second call must reuse it, not rebuild it.
    assert_eq!(unr_runtime_probe(5), 10);
    assert_eq!(unr_runtime_probe(5), 10);
}
