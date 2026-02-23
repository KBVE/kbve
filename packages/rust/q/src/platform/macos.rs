#[cfg(target_os = "macos")]
use objc2::runtime::Object;
#[cfg(target_os = "macos")]
use objc2::{class, msg_send};

#[cfg(target_os = "macos")]
pub fn enable_mac_transparency(transparency_value: f64) {
    unsafe {
        let ns_app: *mut Object = msg_send![class!(NSApplication), sharedApplication];
        if ns_app.is_null() {
            eprintln!("[MacOS] Failed to get NSApplication instance.");
            return;
        }

        let ns_window: *mut Object = msg_send![ns_app, mainWindow];
        if ns_window.is_null() {
            eprintln!("[MacOS] No main window found!");
            return;
        }

        let _: () = msg_send![ns_window, setOpaque: false];
        let _: () = msg_send![ns_window, setAlphaValue: transparency_value];
        let _: () = msg_send![ns_window, setBackgroundColor: std::ptr::null::<Object>()];

        println!("[MacOS] Window transparency enabled.");
    }
}

#[cfg(target_os = "macos")]
pub fn enable_mac_always_on_top() {
    unsafe {
        let ns_app: *mut Object = msg_send![class!(NSApplication), sharedApplication];
        let ns_window: *mut Object = msg_send![ns_app, mainWindow];

        if !ns_window.is_null() {
            let _: () = msg_send![ns_window, setLevel: 5]; // NSFloatingWindowLevel
            println!("[MacOS] Window set to always on top.");
        } else {
            eprintln!("[MacOS] No main window found for always-on-top!");
        }
    }
}

// --- Wry Browser Options ---

#[cfg(target_os = "macos")]
use std::ffi::c_void;
#[cfg(target_os = "macos")]
use std::mem::transmute;
#[cfg(target_os = "macos")]
use std::ptr::NonNull;

#[cfg(target_os = "macos")]
use godot::classes::DisplayServer;
#[cfg(target_os = "macos")]
use godot::classes::display_server::HandleType;
#[cfg(target_os = "macos")]
use godot::prelude::*;

#[cfg(target_os = "macos")]
use raw_window_handle::{
    AppKitWindowHandle, HandleError, HasWindowHandle, RawWindowHandle, WindowHandle,
};

#[cfg(target_os = "macos")]
pub struct MacOSWryBrowserOptions;

#[cfg(target_os = "macos")]
impl MacOSWryBrowserOptions {
    pub fn get_window_handle(&self) -> Result<WindowHandle<'_>, HandleError> {
        let display_server = DisplayServer::singleton();
        let window_handle = display_server.window_get_native_handle(HandleType::WINDOW_VIEW);
        unsafe {
            Ok(WindowHandle::borrow_raw(RawWindowHandle::AppKit(
                AppKitWindowHandle::new({
                    let ptr: *mut c_void = transmute(window_handle);
                    NonNull::new(ptr).expect("Id<T> should never be null")
                }),
            )))
        }
    }

    pub fn resize_window(&self, width: i32, height: i32) {
        let mut display_server = DisplayServer::singleton();
        display_server.window_set_size(Vector2i::new(width, height));
        godot_print!(
            "[MacOSWryBrowserOptions] Window resized to {}x{}",
            width,
            height
        );
    }
}

#[cfg(target_os = "macos")]
impl HasWindowHandle for MacOSWryBrowserOptions {
    fn window_handle(&self) -> Result<WindowHandle<'_>, HandleError> {
        godot_print!("[BrowserManager] -> [MacOSWryBrowserOptions] Window Handle");
        self.get_window_handle()
    }
}
