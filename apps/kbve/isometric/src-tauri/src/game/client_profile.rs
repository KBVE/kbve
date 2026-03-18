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
        }
    }
}

impl ClientProfile {
    /// Read the profile from `localStorage["kbve_client_profile"]`.
    /// Returns `Default` if anything goes wrong (WASM-only).
    #[cfg(target_arch = "wasm32")]
    pub fn from_local_storage() -> Self {
        let fallback = Self::default();
        let Some(window) = web_sys::window() else {
            return fallback;
        };
        let Ok(Some(storage)) = window.local_storage() else {
            return fallback;
        };
        let Ok(Some(raw)) = storage.get_item("kbve_client_profile") else {
            return fallback;
        };
        let Ok(v) = serde_json::from_str::<serde_json::Value>(&raw) else {
            return fallback;
        };
        Self {
            secure_context: v["secure_context"].as_bool().unwrap_or(false),
            has_webgpu: v["has_webgpu"].as_bool().unwrap_or(false),
            has_webtransport: v["has_webtransport"].as_bool().unwrap_or(false),
            has_shared_array_buffer: v["has_shared_array_buffer"].as_bool().unwrap_or(false),
            has_offscreen_canvas: v["has_offscreen_canvas"].as_bool().unwrap_or(false),
            hardware_concurrency: v["hardware_concurrency"]
                .as_u64()
                .unwrap_or(1)
                .min(u32::MAX as u64) as u32,
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
