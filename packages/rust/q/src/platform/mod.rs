#[cfg(target_os = "macos")]
pub mod macos;

#[cfg(target_os = "windows")]
pub mod windows;

#[cfg(all(feature = "webview", target_os = "linux"))]
pub mod linux;

#[cfg(all(
    feature = "webview",
    any(target_os = "macos", target_os = "windows", target_os = "linux")
))]
pub mod browser;
