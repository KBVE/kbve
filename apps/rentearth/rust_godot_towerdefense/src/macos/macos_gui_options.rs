#[cfg(target_os = "macos")]
use objc2::runtime::Object;
#[cfg(target_os = "macos")]
use objc2::{ class, msg_send, sel };

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
