#[cfg(target_os = "macos")]
pub mod macos;

#[cfg(target_os = "windows")]
pub mod windows;

#[cfg(target_os = "linux")]
pub mod linux;

#[cfg(any(target_os = "macos", target_os = "windows", target_os = "linux"))]
pub mod browser;
