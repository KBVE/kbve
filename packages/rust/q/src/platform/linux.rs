use godot::classes::DisplayServer;
use godot::classes::display_server::HandleType;
use godot::prelude::*;

use raw_window_handle::{
    HandleError, HasWindowHandle, RawWindowHandle, WindowHandle, XlibWindowHandle,
};

pub struct LinuxWryBrowserOptions;

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
