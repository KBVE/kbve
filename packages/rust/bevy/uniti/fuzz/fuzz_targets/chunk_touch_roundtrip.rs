#![no_main]

use libfuzzer_sys::fuzz_target;
use std::ffi::{CString, c_char};
use uniti::ffi_world::*;

fuzz_target!(|data: &[u8]| {
    if data.len() < 16 {
        return;
    }
    let cx = i32::from_le_bytes(data[0..4].try_into().unwrap());
    let cy = i32::from_le_bytes(data[4..8].try_into().unwrap());
    let last_seen = u64::from_le_bytes(data[8..16].try_into().unwrap());

    let temp = tempfile::NamedTempFile::new().unwrap();
    let path = temp.path().to_str().unwrap();
    let cpath = CString::new(path).unwrap();
    let world = unsafe { uniti_world_open(cpath.as_ptr() as *const c_char, path.len() as u32) };
    if world.is_null() {
        return;
    }

    unsafe {
        uniti_world_chunk_touch(world, cx, cy, last_seen, 0, 0);
        let s = uniti_world_chunk_summary(world, cx, cy);
        assert_eq!(s.cx, cx);
        assert_eq!(s.cy, cy);
        uniti_world_free(world);
    };
});
