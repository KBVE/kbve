use std::ffi::c_void;

use godot::classes::DisplayServer;
use godot::classes::display_server::HandleType;
use godot::prelude::*;

#[cfg(target_os = "windows")]
use godot::classes::CanvasLayer;

#[cfg(target_os = "windows")]
use windows::Win32::Foundation::{COLORREF, HWND};
#[cfg(target_os = "windows")]
use windows::Win32::UI::WindowsAndMessaging::{
    GWL_EXSTYLE, GetWindowLongW, LWA_ALPHA, SetLayeredWindowAttributes, SetWindowLongW,
    WS_EX_LAYERED,
};

#[cfg(target_os = "windows")]
pub fn set_windows_opacity(transparency_value: f64, gui_manager: &Gd<CanvasLayer>) {
    unsafe {
        let hwnd: HWND = HWND(
            DisplayServer::singleton().window_get_native_handle(HandleType::WINDOW_HANDLE)
                as *mut c_void,
        );
        if hwnd.0.is_null() {
            godot_print!("[Windows] ERROR: Failed to get active window handle.");
            return;
        }

        let ex_style = GetWindowLongW(hwnd, GWL_EXSTYLE);
        SetWindowLongW(hwnd, GWL_EXSTYLE, ex_style | (WS_EX_LAYERED.0 as i32));

        let alpha_value = (transparency_value.clamp(0.0, 1.0) * 255.0) as u8;

        if SetLayeredWindowAttributes(hwnd, COLORREF(0), alpha_value, LWA_ALPHA).is_err() {
            godot_print!("[Windows] ERROR: Failed to set window opacity.");
        } else {
            godot_print!(
                "[Windows] Window opacity set to {} (alpha {}).",
                transparency_value,
                alpha_value
            );
        }
    }
}

// --- Wry Browser Options ---

#[cfg(target_os = "windows")]
use std::num::{NonZero, NonZeroIsize};

#[cfg(target_os = "windows")]
use raw_window_handle::{
    HandleError, HasWindowHandle, RawWindowHandle, Win32WindowHandle, WindowHandle,
};

#[cfg(target_os = "windows")]
pub struct WindowsWryBrowserOptions;

#[cfg(target_os = "windows")]
impl HasWindowHandle for WindowsWryBrowserOptions {
    fn window_handle(&self) -> Result<WindowHandle<'_>, HandleError> {
        let display_server = DisplayServer::singleton();
        let window_handle = display_server.window_get_native_handle(HandleType::WINDOW_HANDLE);

        godot_print!(
            "[WindowsWryBrowserOptions] Retrieved window handle: {:?}",
            window_handle
        );

        if window_handle == 0 {
            godot_error!("[WindowsWryBrowserOptions] Invalid window handle (0)");
            return Err(HandleError::Unavailable);
        }

        let non_zero_window_handle = NonZero::new(window_handle).ok_or_else(|| {
            godot_error!("[WindowsWryBrowserOptions] Failed to create NonZero window handle.");
            HandleError::Unavailable
        })?;

        let non_zero_isize = NonZeroIsize::try_from(non_zero_window_handle).map_err(|_| {
            godot_error!(
                "[WindowsWryBrowserOptions] Failed to convert window handle to NonZeroIsize."
            );
            HandleError::Unavailable
        })?;

        godot_print!(
            "[WindowsWryBrowserOptions] NonZeroIsize: {:?}",
            non_zero_isize
        );

        unsafe {
            Ok(WindowHandle::borrow_raw(RawWindowHandle::Win32(
                Win32WindowHandle::new(non_zero_isize),
            )))
        }
    }
}
