use godot::prelude::*;
use godot::classes::{ DisplayServer };
use godot::classes::display_server::HandleType;
use core::ffi::c_void;

#[cfg(target_os = "windows")]
use windows::Win32::Foundation::HWND;

#[cfg(target_os = "windows")]
use windows::Win32::UI::WindowsAndMessaging::{
  GetWindowLongPtrW,
  GetWindowLongW,
  GWLP_HWNDPARENT,
  GWL_HWNDPARENT,
  IsWindow,
};

#[cfg(target_os = "windows")]
use std::num::{ NonZero, NonZeroIsize };

#[cfg(target_os = "windows")]
use raw_window_handle::{
  Win32WindowHandle,
  WindowHandle,
  RawWindowHandle,
  HasWindowHandle,
  HandleError,
};

#[cfg(target_os = "windows")]
pub struct WindowsWryBrowserOptions;
#[cfg(target_os = "windows")]
impl HasWindowHandle for WindowsWryBrowserOptions {
  fn window_handle(&self) -> Result<WindowHandle<'_>, HandleError> {
    let display_server = DisplayServer::singleton();
    let window_handle = display_server.window_get_native_handle(HandleType::WINDOW_HANDLE);

    godot_print!("[WindowsWryBrowserOptions] Retrieved window handle: {:?}", window_handle);

    if window_handle == 0 {
      godot_error!("[WindowsWryBrowserOptions] Invalid window handle (0)");
      return Err(HandleError::Unavailable);
    }

    let non_zero_window_handle = NonZero::new(window_handle).ok_or_else(|| {
      godot_error!("[WindowsWryBrowserOptions] Failed to create NonZero window handle.");
      HandleError::Unavailable
    })?;

    let non_zero_isize = NonZeroIsize::try_from(non_zero_window_handle).map_err(|_| {
      godot_error!("[WindowsWryBrowserOptions] Failed to convert window handle to NonZeroIsize.");
      HandleError::Unavailable
    })?;

    godot_print!("[WindowsWryBrowserOptions] NonZeroIsize: {:?}", non_zero_isize);

    unsafe {
      Ok(WindowHandle::borrow_raw(RawWindowHandle::Win32(Win32WindowHandle::new(non_zero_isize))))
    }
  }
}
