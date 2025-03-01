pub mod ui_extension;
pub mod timer_extension;
pub mod gui_manager_extension;
#[cfg(any(target_os = "macos", target_os = "windows"))]
pub mod wry_extension;
//pub mod clockmaster_extension;