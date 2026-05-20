//! Full-screen Bevy UI title screen overlay.
//!
//! Spawns during `GamePhase::Title` and auto-despawns via `DespawnOnExit`
//! when the phase transitions to `Playing`.
//!
//! Layout:
//! ```text
//! ┌─────────────────────────────────────┐
//! │          KBVE ISOMETRIC             │
//! │                                     │
//! │       [transport badge]             │
//! │       [auth status]                 │
//! │                                     │
//! │       [ Play Online  ]              │
//! │       [ Play Offline ]              │
//! │       [ Settings     ]              │
//! └─────────────────────────────────────┘
//! ```

use bevy::prelude::*;

use super::phase::{GamePhase, PlayMode, PreFlight, TransportKind};
use super::ui::{self, ButtonKind, UiButtonConfig};
use super::ui_color;

// ---------------------------------------------------------------------------
// Marker components
// ---------------------------------------------------------------------------

/// Root node of the entire title screen overlay.
#[derive(Component)]
struct TitleScreenRoot;

/// The transport status text node.
#[derive(Component)]
struct TransportLabel;

/// The auth status text node.
#[derive(Component)]
struct AuthLabel;

/// "Play Online" button.
#[derive(Component)]
struct PlayOnlineBtn;

/// "Play Offline" button.
#[derive(Component)]
struct PlayOfflineBtn;

/// "Settings" button.
#[derive(Component)]
struct SettingsBtn;

/// OAuth sign-in buttons — provider identifier stored on the component so
/// one handler can dispatch them.
#[derive(Component, Clone)]
struct OAuthBtn(&'static str);

// ---------------------------------------------------------------------------
// Plugin
// ---------------------------------------------------------------------------

pub struct TitleScreenPlugin;

impl Plugin for TitleScreenPlugin {
    fn build(&self, app: &mut App) {
        app.add_systems(OnEnter(GamePhase::Title), spawn_title_screen);
        app.add_systems(
            Update,
            (
                update_transport_label,
                update_auth_label,
                handle_title_buttons,
                handle_oauth_buttons,
            )
                .run_if(in_state(GamePhase::Title)),
        );
    }
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const TITLE_FONT_SIZE: f32 = 32.0;
const SUBTITLE_FONT_SIZE: f32 = 13.0;
const BTN_FONT_SIZE: f32 = 16.0;
const BADGE_FONT_SIZE: f32 = 12.0;
const BTN_WIDTH: f32 = 220.0;
const BTN_HEIGHT: f32 = 40.0;
const BTN_GAP: f32 = 10.0;

// ---------------------------------------------------------------------------
// Spawn
// ---------------------------------------------------------------------------

fn spawn_title_screen(mut commands: Commands) {
    commands
        .spawn((
            // Full-screen overlay
            Node {
                width: Val::Percent(100.0),
                height: Val::Percent(100.0),
                position_type: PositionType::Absolute,
                flex_direction: FlexDirection::Column,
                justify_content: JustifyContent::Center,
                align_items: AlignItems::Center,
                ..default()
            },
            BackgroundColor(ui_color::BACKDROP),
            GlobalZIndex(100),
            // Auto-despawn when exiting Title state
            DespawnOnExit(GamePhase::Title),
            TitleScreenRoot,
        ))
        .with_children(|root| {
            // ── Title text ──
            root.spawn((
                Text::new("KBVE ISOMETRIC"),
                TextFont {
                    font_size: TITLE_FONT_SIZE,
                    ..default()
                },
                TextColor(ui_color::TEXT_PRIMARY),
                Node {
                    margin: UiRect::bottom(Val::Px(8.0)),
                    ..default()
                },
            ));

            // ── Subtitle ──
            root.spawn((
                Text::new("a multiplayer sandbox"),
                TextFont {
                    font_size: SUBTITLE_FONT_SIZE,
                    ..default()
                },
                TextColor(ui_color::TEXT_SECONDARY),
                Node {
                    margin: UiRect::bottom(Val::Px(16.0)),
                    ..default()
                },
            ));

            // ── Status badges container ──
            root.spawn(Node {
                flex_direction: FlexDirection::Column,
                align_items: AlignItems::Center,
                row_gap: Val::Px(6.0),
                margin: UiRect::bottom(Val::Px(16.0)),
                ..default()
            })
            .with_children(|badges| {
                // Transport badge
                badges.spawn((
                    Text::new("Transport: detecting..."),
                    TextFont {
                        font_size: BADGE_FONT_SIZE,
                        ..default()
                    },
                    TextColor(ui_color::BADGE_LOADING),
                    TransportLabel,
                ));

                // Auth badge
                badges.spawn((
                    Text::new("Auth: checking..."),
                    TextFont {
                        font_size: BADGE_FONT_SIZE,
                        ..default()
                    },
                    TextColor(ui_color::BADGE_LOADING),
                    AuthLabel,
                ));
            });

            // ── Button column ──
            root.spawn(Node {
                flex_direction: FlexDirection::Column,
                align_items: AlignItems::Center,
                row_gap: Val::Px(BTN_GAP),
                ..default()
            })
            .with_children(|col| {
                // OAuth sign-in row (Sign in with GitHub / Discord / Twitch)
                col.spawn(Node {
                    flex_direction: FlexDirection::Row,
                    align_items: AlignItems::Center,
                    column_gap: Val::Px(BTN_GAP),
                    margin: UiRect::bottom(Val::Px(8.0)),
                    ..default()
                })
                .with_children(|row| {
                    ui::spawn_button(
                        row,
                        "GitHub",
                        UiButtonConfig {
                            width: Val::Px(95.0),
                            height: Val::Px(BTN_HEIGHT),
                            font_size: BTN_FONT_SIZE,
                            kind: ButtonKind::Secondary,
                            ..default()
                        },
                        OAuthBtn("github"),
                    );
                    ui::spawn_button(
                        row,
                        "Discord",
                        UiButtonConfig {
                            width: Val::Px(95.0),
                            height: Val::Px(BTN_HEIGHT),
                            font_size: BTN_FONT_SIZE,
                            kind: ButtonKind::Secondary,
                            ..default()
                        },
                        OAuthBtn("discord"),
                    );
                    ui::spawn_button(
                        row,
                        "Twitch",
                        UiButtonConfig {
                            width: Val::Px(95.0),
                            height: Val::Px(BTN_HEIGHT),
                            font_size: BTN_FONT_SIZE,
                            kind: ButtonKind::Secondary,
                            ..default()
                        },
                        OAuthBtn("twitch"),
                    );
                    ui::spawn_button(
                        row,
                        "Steam",
                        UiButtonConfig {
                            width: Val::Px(95.0),
                            height: Val::Px(BTN_HEIGHT),
                            font_size: BTN_FONT_SIZE,
                            kind: ButtonKind::Secondary,
                            ..default()
                        },
                        OAuthBtn("steam"),
                    );
                });

                ui::spawn_button(
                    col,
                    "Play Online",
                    UiButtonConfig {
                        width: Val::Px(BTN_WIDTH),
                        height: Val::Px(BTN_HEIGHT),
                        font_size: BTN_FONT_SIZE,
                        kind: ButtonKind::Primary,
                        ..default()
                    },
                    PlayOnlineBtn,
                );
                ui::spawn_button(
                    col,
                    "Play Offline",
                    UiButtonConfig {
                        width: Val::Px(BTN_WIDTH),
                        height: Val::Px(BTN_HEIGHT),
                        font_size: BTN_FONT_SIZE,
                        kind: ButtonKind::Secondary,
                        ..default()
                    },
                    PlayOfflineBtn,
                );
                ui::spawn_button(
                    col,
                    "Settings",
                    UiButtonConfig {
                        width: Val::Px(BTN_WIDTH),
                        height: Val::Px(BTN_HEIGHT),
                        font_size: BTN_FONT_SIZE,
                        kind: ButtonKind::Secondary,
                        ..default()
                    },
                    SettingsBtn,
                );
            });

            // ── Version / footer ──
            root.spawn((
                Text::new("v0.1 — dev build"),
                TextFont {
                    font_size: 12.0,
                    ..default()
                },
                TextColor(ui_color::TEXT_SECONDARY),
                Node {
                    margin: UiRect::top(Val::Px(20.0)),
                    ..default()
                },
            ));
        });
}

// ---------------------------------------------------------------------------
// Live-update badge labels
// ---------------------------------------------------------------------------

fn update_transport_label(
    preflight: Res<PreFlight>,
    mut query: Query<(&mut Text, &mut TextColor), With<TransportLabel>>,
) {
    if !preflight.is_changed() {
        return;
    }
    for (mut text, mut color) in &mut query {
        match preflight.transport {
            TransportKind::Unknown => {
                **text = "Transport: detecting...".into();
                color.0 = ui_color::BADGE_LOADING;
            }
            TransportKind::WebTransport => {
                **text = "Transport: WebTransport (UDP)".into();
                color.0 = ui_color::BADGE_WT;
            }
            TransportKind::WebSocket => {
                **text = "Transport: WebSocket (TCP)".into();
                color.0 = ui_color::BADGE_WS;
            }
        }
    }
}

fn update_auth_label(
    preflight: Res<PreFlight>,
    mut query: Query<(&mut Text, &mut TextColor), With<AuthLabel>>,
) {
    if !preflight.is_changed() {
        return;
    }
    for (mut text, mut color) in &mut query {
        match (&preflight.jwt_valid, &preflight.username) {
            (Some(true), Some(name)) => {
                **text = format!("Signed in as {name}");
                color.0 = ui_color::TEXT_SUCCESS;
            }
            (Some(true), None) => {
                **text = "Authenticated".into();
                color.0 = ui_color::TEXT_SUCCESS;
            }
            (Some(false), _) => {
                **text = "Session expired — will join as guest".into();
                color.0 = ui_color::TEXT_WARNING;
            }
            (None, _) => {
                **text = "Not signed in — guest mode".into();
                color.0 = ui_color::TEXT_SECONDARY;
            }
        }
    }
}

// ---------------------------------------------------------------------------
// Button interactions
// ---------------------------------------------------------------------------

fn handle_title_buttons(
    mut next_phase: ResMut<NextState<GamePhase>>,
    mut play_mode: ResMut<PlayMode>,
    online_q: Query<&Interaction, (Changed<Interaction>, With<PlayOnlineBtn>)>,
    offline_q: Query<
        &Interaction,
        (
            Changed<Interaction>,
            With<PlayOfflineBtn>,
            Without<PlayOnlineBtn>,
        ),
    >,
    settings_q: Query<
        &Interaction,
        (
            Changed<Interaction>,
            With<SettingsBtn>,
            Without<PlayOnlineBtn>,
            Without<PlayOfflineBtn>,
        ),
    >,
) {
    // Play Online — transition to Connecting, triggers go-online flow
    for interaction in &online_q {
        if *interaction == Interaction::Pressed {
            info!("[title] Play Online pressed — transitioning to Connecting");
            *play_mode = PlayMode::Online;
            super::net::request_go_online("", "");
            next_phase.set(GamePhase::Connecting);
        }
    }

    // Play Offline — transition to Playing without connecting
    for interaction in &offline_q {
        if *interaction == Interaction::Pressed {
            info!("[title] Play Offline pressed — transitioning to Playing");
            *play_mode = PlayMode::Offline;
            next_phase.set(GamePhase::Playing);
        }
    }

    // Settings — TODO: open settings panel
    for interaction in &settings_q {
        if *interaction == Interaction::Pressed {
            info!("[title] Settings pressed — not yet implemented");
        }
    }
}

#[cfg(not(target_arch = "wasm32"))]
fn handle_oauth_buttons(
    handle: NonSend<tauri::AppHandle>,
    btn_q: Query<(&Interaction, &OAuthBtn), Changed<Interaction>>,
) {
    use tauri_plugin_opener::OpenerExt;
    for (interaction, OAuthBtn(provider)) in &btn_q {
        if *interaction != Interaction::Pressed {
            continue;
        }
        let redirect = crate::auth::build_redirect_url();
        let url = format!(
            "https://kbve.com/auth/desktop?provider={provider}&redirect={}",
            urlencoding::encode(&redirect),
        );
        info!("[title] OAuth sign-in pressed: provider={provider} url={url}");
        if let Err(e) = handle.opener().open_url(url, None::<&str>) {
            error!("[title] failed to open OAuth url: {e}");
        }
    }
}

#[cfg(target_arch = "wasm32")]
fn handle_oauth_buttons(btn_q: Query<(&Interaction, &OAuthBtn), Changed<Interaction>>) {
    for (interaction, OAuthBtn(provider)) in &btn_q {
        if *interaction == Interaction::Pressed {
            info!("[title] OAuth sign-in pressed (wasm): provider={provider}");
        }
    }
}
