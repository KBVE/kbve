//! Game phase state machine.
//!
//! ```text
//! Title ──▶ Connecting ──▶ Playing
//!              │
//!              └──▶ Title  (on failure / timeout)
//! ```
//!
//! - **Title**: world renders behind a full-screen Bevy UI overlay.
//!   Player exists but input is blocked. Pre-flight auth + transport
//!   probes run here.
//! - **Connecting**: "Play Online" was pressed. Token fetch + netcode
//!   handshake + auth in progress. A status overlay is shown. Player
//!   input is still blocked. Transitions to Playing on auth success,
//!   or back to Title on failure/timeout.
//! - **Playing**: title screen despawns, HUD + input active.

use bevy::prelude::*;

/// Top-level game phase — drives what UI is visible and which systems run.
#[derive(States, Debug, Clone, Copy, PartialEq, Eq, Hash, Default)]
pub enum GamePhase {
    #[default]
    Title,
    /// Netcode handshake + auth in progress (online mode only).
    Connecting,
    Playing,
}

/// Tracks whether the player chose to play online or offline.
/// Used to decide whether to return to the title screen on disconnect.
#[derive(Resource, Default, Debug, Clone, Copy, PartialEq, Eq)]
pub enum PlayMode {
    #[default]
    Offline,
    Online,
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

/// Marker for the "Connecting…" overlay so it auto-despawns on exit.
#[derive(Component)]
struct ConnectingOverlay;

/// How long to wait before giving up on the connection.
const CONNECT_TIMEOUT_SECS: f32 = 20.0;

/// Timer resource for connection timeout.
#[derive(Resource)]
pub struct ConnectTimer(pub Timer);

pub struct PhasePlugin;

impl Plugin for PhasePlugin {
    fn build(&self, app: &mut App) {
        app.init_state::<GamePhase>();
        app.init_resource::<PreFlight>();
        app.init_resource::<PlayMode>();

        // One-shot transport probe: runs once during Title when transport is still Unknown
        app.add_systems(
            Update,
            probe_transport.run_if(
                in_state(GamePhase::Title)
                    .and(|pf: Res<PreFlight>| pf.transport == TransportKind::Unknown),
            ),
        );

        // Connecting phase — spawn overlay, tick timeout
        app.add_systems(OnEnter(GamePhase::Connecting), spawn_connecting_overlay);
        app.add_systems(
            Update,
            tick_connect_timeout.run_if(in_state(GamePhase::Connecting)),
        );
    }
}

fn spawn_connecting_overlay(mut commands: Commands) {
    commands.insert_resource(ConnectTimer(Timer::from_seconds(
        CONNECT_TIMEOUT_SECS,
        TimerMode::Once,
    )));

    commands
        .spawn((
            Node {
                width: Val::Percent(100.0),
                height: Val::Percent(100.0),
                position_type: PositionType::Absolute,
                flex_direction: FlexDirection::Column,
                justify_content: JustifyContent::Center,
                align_items: AlignItems::Center,
                ..default()
            },
            BackgroundColor(Color::srgba(0.1, 0.1, 0.15, 0.85)),
            GlobalZIndex(100),
            DespawnOnExit(GamePhase::Connecting),
            ConnectingOverlay,
        ))
        .with_children(|root| {
            root.spawn((
                Text::new("Connecting..."),
                TextFont {
                    font_size: 32.0,
                    ..default()
                },
                TextColor(Color::srgba(0.9, 0.9, 0.95, 1.0)),
            ));
            root.spawn((
                Text::new("Establishing secure connection to server"),
                TextFont {
                    font_size: 14.0,
                    ..default()
                },
                TextColor(Color::srgba(0.6, 0.6, 0.65, 1.0)),
                Node {
                    margin: UiRect::top(Val::Px(12.0)),
                    ..default()
                },
            ));
        });
}

/// If the connection timer expires, abort and return to Title.
fn tick_connect_timeout(
    time: Res<Time>,
    mut timer: ResMut<ConnectTimer>,
    mut next_phase: ResMut<NextState<GamePhase>>,
) {
    timer.0.tick(time.delta());
    if timer.0.just_finished() {
        warn!("[phase] connection timed out after {CONNECT_TIMEOUT_SECS}s — returning to title");
        super::telemetry::report_error("connection timed out — returning to title screen");
        next_phase.set(GamePhase::Title);
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
