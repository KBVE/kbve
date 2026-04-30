use std::ffi::{CString, c_void};
use std::os::raw::c_char;
use tempfile::NamedTempFile;
use uniti::ffi_world::*;

pub struct WorldGuard {
    pub handle: *mut c_void,
    _temp: NamedTempFile,
}

impl WorldGuard {
    pub fn new() -> Self {
        let temp = NamedTempFile::new().expect("temp file");
        let path = temp.path().to_str().expect("utf8 path");
        let cpath = CString::new(path).expect("c string");
        let handle =
            unsafe { uniti_world_open(cpath.as_ptr() as *const c_char, path.len() as u32) };
        assert!(!handle.is_null(), "uniti_world_open returned null");
        WorldGuard {
            handle,
            _temp: temp,
        }
    }
}

impl Drop for WorldGuard {
    fn drop(&mut self) {
        if !self.handle.is_null() {
            unsafe { uniti_world_free(self.handle) };
            self.handle = std::ptr::null_mut();
        }
    }
}
