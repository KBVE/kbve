//! Browser capability profile — probed in JS, read once in WASM.
//!
//! On page load, `probeClientProfile()` (main.tsx) writes a JSON object to
//! `localStorage["kbve_client_profile"]`. The WASM side reads it once at
//! startup into a Bevy `Resource` so every system can make transport, shim,
//! and feature-gate decisions from a single source of truth.

use bevy::prelude::*;

/// Browser capabilities probed by JS before WASM init.
/// All fields default to the most conservative (safe) value so that
/// a missing or corrupt localStorage entry never causes a crash.
#[derive(Resource, Debug, Clone)]
pub struct ClientProfile {
    /// Page was loaded over HTTPS (or localhost).
    pub secure_context: bool,
    /// Browser exposes the WebGPU API.
    pub has_webgpu: bool,
    /// Browser exposes the WebTransport constructor.
    pub has_webtransport: bool,
    /// `SharedArrayBuffer` is available (cross-origin isolated).
    pub has_shared_array_buffer: bool,
    /// `OffscreenCanvas` is available (worker rendering).
    pub has_offscreen_canvas: bool,
    /// `navigator.hardwareConcurrency` (fallback: 1).
    pub hardware_concurrency: u32,
    /// REST API base URL (e.g. `https://kbve.com` or `https://localhost:3080`).
    pub api_base: String,
    /// WebSocket game server URL (e.g. `wss://kbve.com/ws` or `wss://localhost:5000`).
    pub ws_url: String,
    /// WebTransport game server URL (e.g. `https://wt.kbve.com:5001` or `https://localhost:5001`).
    pub wt_url: String,
}

impl Default for ClientProfile {
    fn default() -> Self {
        Self {
            secure_context: false,
            has_webgpu: false,
            has_webtransport: false,
            has_shared_array_buffer: false,
            has_offscreen_canvas: false,
            hardware_concurrency: 1,
            api_base: String::new(),
            ws_url: String::new(),
            wt_url: String::new(),
        }
    }
}

impl ClientProfile {
    /// Build profile by probing browser capabilities directly, with
    /// optional URL overrides from `localStorage["kbve_client_profile"]`.
    #[cfg(target_arch = "wasm32")]
    pub fn from_local_storage() -> Self {
        use wasm_bindgen::prelude::*;

        let window = web_sys::window();

        let secure_context = window
            .as_ref()
            .and_then(|w| js_sys::Reflect::get(w, &JsValue::from_str("isSecureContext")).ok())
            .and_then(|v| v.as_bool())
            .unwrap_or(false);

        let has_webtransport = {
            let global = js_sys::global();
            let wt = js_sys::Reflect::get(&global, &JsValue::from_str("WebTransport"));
            matches!(wt, Ok(val) if !val.is_undefined())
        };

        let has_shared_array_buffer = {
            let global = js_sys::global();
            let sab = js_sys::Reflect::get(&global, &JsValue::from_str("SharedArrayBuffer"));
            matches!(sab, Ok(val) if !val.is_undefined())
        };

        let has_offscreen_canvas = {
            let global = js_sys::global();
            let oc = js_sys::Reflect::get(&global, &JsValue::from_str("OffscreenCanvas"));
            matches!(oc, Ok(val) if !val.is_undefined())
        };

        let hardware_concurrency = window
            .as_ref()
            .map(|w| w.navigator().hardware_concurrency() as u32)
            .unwrap_or(1u32);

        let storage = window
            .as_ref()
            .and_then(|w| w.local_storage().ok().flatten());
        let stored: Option<serde_json::Value> = storage
            .as_ref()
            .and_then(|s| s.get_item("kbve_client_profile").ok().flatten())
            .and_then(|raw| serde_json::from_str(&raw).ok());

        let page_origin = window
            .as_ref()
            .and_then(|w| w.location().origin().ok())
            .unwrap_or_default();

        let api_base = stored
            .as_ref()
            .and_then(|v| v["api_base"].as_str())
            .filter(|s| !s.is_empty())
            .map(|s| s.to_owned())
            .unwrap_or_else(|| page_origin.clone());

        let ws_url = stored
            .as_ref()
            .and_then(|v| v["ws_url"].as_str())
            .filter(|s| !s.is_empty())
            .map(|s| s.to_owned())
            .unwrap_or_else(|| {
                page_origin
                    .replace("https://", "wss://")
                    .replace("http://", "ws://")
                    + ":5000"
            });

        let wt_url = stored
            .as_ref()
            .and_then(|v| v["wt_url"].as_str())
            .filter(|s| !s.is_empty())
            .map(|s| s.to_owned())
            .unwrap_or_else(|| {
                page_origin
                    .replace("https://", "https://")
                    .replace("http://", "https://")
                    + ":5001"
            });

        Self {
            secure_context,
            has_webgpu: true,
            has_webtransport,
            has_shared_array_buffer,
            has_offscreen_canvas,
            hardware_concurrency,
            api_base,
            ws_url,
            wt_url,
        }
    }

    /// Desktop always gets full capabilities.
    #[cfg(not(target_arch = "wasm32"))]
    pub fn from_local_storage() -> Self {
        Self {
            secure_context: true,
            has_webgpu: true,
            has_webtransport: true,
            has_shared_array_buffer: true,
            has_offscreen_canvas: true,
            hardware_concurrency: std::thread::available_parallelism()
                .map(|n| n.get() as u32)
                .unwrap_or(4),
            api_base: "https://127.0.0.1:3080".to_owned(),
            ws_url: "wss://127.0.0.1:5000".to_owned(),
            wt_url: "https://127.0.0.1:5001".to_owned(),
        }
    }

    /// Which transport the netcode token should prefer.
    /// Returns `"webtransport"` or `"websocket"`.
    pub fn preferred_transport(&self) -> &'static str {
        if self.has_webtransport {
            "webtransport"
        } else {
            "websocket"
        }
    }

    /// True if connecting with `ws://` would be blocked (secure page, insecure socket).
    pub fn would_block_insecure_ws(&self) -> bool {
        self.secure_context
    }
}
