//! Client-side telemetry — report WARN/ERROR to the server via JS bridge.
//!
//! On WASM, calls `window.__telemetry(level, message, stack)` (injected by bug-report-shim.js).
//! On desktop, logs to bevy's tracing backend directly (no HTTP roundtrip needed).

use bevy::log;

/// Report a warning to the telemetry endpoint.
#[allow(unused_variables)]
pub fn report_warn(message: &str) {
    #[cfg(target_arch = "wasm32")]
    {
        js_report("warn", message, "");
    }

    #[cfg(not(target_arch = "wasm32"))]
    {
        log::warn!(target: "client_telemetry", "[client] {message}");
    }
}

/// Report an error to the telemetry endpoint.
#[allow(unused_variables)]
pub fn report_error(message: &str) {
    #[cfg(target_arch = "wasm32")]
    {
        js_report("error", message, "");
    }

    #[cfg(not(target_arch = "wasm32"))]
    {
        log::error!(target: "client_telemetry", "[client] {message}");
    }
}

/// Report an error with a stack trace / context string.
#[allow(unused_variables)]
pub fn report_error_with_context(message: &str, context: &str) {
    #[cfg(target_arch = "wasm32")]
    {
        js_report("error", message, context);
    }

    #[cfg(not(target_arch = "wasm32"))]
    {
        log::error!(target: "client_telemetry", "[client] {message} | {context}");
    }
}

/// Call `window.__telemetry(level, message, stack)` from WASM.
#[cfg(target_arch = "wasm32")]
fn js_report(level: &str, message: &str, stack: &str) {
    use wasm_bindgen::prelude::*;

    // Grab window.__telemetry — if the shim wasn't loaded, silently skip.
    let window = match web_sys::window() {
        Some(w) => w,
        None => return,
    };

    let func = js_sys::Reflect::get(&window, &JsValue::from_str("__telemetry")).ok();
    let func = match func {
        Some(f) if f.is_function() => js_sys::Function::from(f),
        _ => return,
    };

    let _ = func.call3(
        &JsValue::NULL,
        &JsValue::from_str(level),
        &JsValue::from_str(message),
        &JsValue::from_str(stack),
    );
}
