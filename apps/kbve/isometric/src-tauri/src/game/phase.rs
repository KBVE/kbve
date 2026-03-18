//! Game phase state machine.
//!
//! ```text
//! Title ──▶ Playing
//! ```
//!
//! - **Title**: world renders behind a full-screen Bevy UI overlay.
//!   Player exists but input is blocked. Pre-flight auth + transport
//!   probes run here.
//! - **Playing**: title screen despawns, HUD + input active.

use bevy::prelude::*;

/// Top-level game phase — drives what UI is visible and which systems run.
#[derive(States, Debug, Clone, Copy, PartialEq, Eq, Hash, Default)]
pub enum GamePhase {
    #[default]
    Title,
    Playing,
}

/// Pre-flight networking / auth state gathered before the player chooses
/// to go online. Populated by systems during `Title` phase.
#[derive(Resource, Default)]
pub struct PreFlight {
    /// Whether the stored JWT (if any) is still valid.
    pub jwt_valid: Option<bool>,
    /// Username from JWT claims (if valid).
    pub username: Option<String>,
    /// Detected transport capability.
    pub transport: TransportKind,
    /// True while a background probe is still running.
    pub probing: bool,
}

/// Which transport the client expects to use.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub enum TransportKind {
    #[default]
    Unknown,
    WebTransport,
    WebSocket,
}

pub struct PhasePlugin;

impl Plugin for PhasePlugin {
    fn build(&self, app: &mut App) {
        app.init_state::<GamePhase>();
        app.init_resource::<PreFlight>();

        // One-shot transport probe: runs once during Title when transport is still Unknown
        app.add_systems(
            Update,
            probe_transport.run_if(
                in_state(GamePhase::Title)
                    .and(|pf: Res<PreFlight>| pf.transport == TransportKind::Unknown),
            ),
        );
    }
}

/// One-shot system: detect WebTransport browser support.
/// On native, always marks WT as available. On WASM, checks `window.WebTransport`.
fn probe_transport(mut preflight: ResMut<PreFlight>) {
    #[cfg(not(target_arch = "wasm32"))]
    {
        preflight.transport = TransportKind::WebTransport;
        info!("[phase] native build — WebTransport available");
    }

    #[cfg(target_arch = "wasm32")]
    {
        use wasm_bindgen::prelude::*;

        let has_wt = js_sys::Reflect::get(
            &web_sys::window().unwrap(),
            &JsValue::from_str("WebTransport"),
        )
        .map(|v| !v.is_undefined())
        .unwrap_or(false);

        if has_wt {
            preflight.transport = TransportKind::WebTransport;
            info!("[phase] WASM — WebTransport supported");
        } else {
            preflight.transport = TransportKind::WebSocket;
            info!("[phase] WASM — WebTransport NOT supported, will use WebSocket");
        }
    }
}
