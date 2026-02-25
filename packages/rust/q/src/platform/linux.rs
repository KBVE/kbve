#[cfg(target_os = "linux")]
use godot::classes::DisplayServer;
#[cfg(target_os = "linux")]
use godot::classes::display_server::HandleType;
#[cfg(target_os = "linux")]
use godot::prelude::*;

#[cfg(target_os = "linux")]
use raw_window_handle::{
    HandleError, HasWindowHandle, RawWindowHandle, WindowHandle, XlibWindowHandle,
};

#[cfg(target_os = "linux")]
pub struct LinuxWryBrowserOptions;

#[cfg(target_os = "linux")]
impl HasWindowHandle for LinuxWryBrowserOptions {
    fn window_handle(&self) -> Result<WindowHandle<'_>, HandleError> {
        let display_server = DisplayServer::singleton();
        let window_handle = display_server.window_get_native_handle(HandleType::WINDOW_HANDLE);

        if window_handle == 0 {
            godot_error!("[LinuxWryBrowserOptions] Invalid window handle (0)");
            return Err(HandleError::Unavailable);
        }

        unsafe {
            let xlib_handle = XlibWindowHandle::new(window_handle as std::ffi::c_ulong);
            Ok(WindowHandle::borrow_raw(RawWindowHandle::Xlib(xlib_handle)))
        }
    }
}
