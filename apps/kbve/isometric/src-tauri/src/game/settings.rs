use bevy::prelude::*;
use bevy_db::{Db, DbRequest};
use serde::{Deserialize, Serialize};

use super::phase::{GamePhase, TransportKind};
use super::ui::{self, ButtonKind, UiButtonConfig};
use super::ui_color;

const TABLE_SETTINGS: &str = "settings";
const KEY_SETTINGS: &str = "game_settings";

/// Persistent user settings. Loaded at startup from `bevy_db`, saved on
/// change. Defaults match the previous hard-coded behavior so first-run
/// users see no surprises.
#[derive(Resource, Clone, Serialize, Deserialize, Debug, PartialEq)]
pub struct GameSettings {
    pub master_volume: u8,
    pub music_volume: u8,
    pub sfx_volume: u8,
    pub transport_override: Option<TransportKind>,
    pub vsync: bool,
}

impl Default for GameSettings {
    fn default() -> Self {
        Self {
            master_volume: 80,
            music_volume: 70,
            sfx_volume: 80,
            transport_override: None,
            vsync: true,
        }
    }
}

#[derive(Resource, Default)]
struct SettingsLoad {
    pending: Option<DbRequest<Option<GameSettings>>>,
    loaded: bool,
}

#[derive(Resource, Default)]
pub struct SettingsModalState {
    pub open: bool,
}

#[derive(Component)]
struct SettingsModalRoot;

#[derive(Component, Clone, Copy)]
enum SettingsAction {
    MasterDown,
    MasterUp,
    MusicDown,
    MusicUp,
    SfxDown,
    SfxUp,
    TransportAuto,
    TransportWebSocket,
    TransportWebTransport,
    Close,
}

#[derive(Component)]
struct VolumeReadout(VolumeKind);

#[derive(Clone, Copy)]
enum VolumeKind {
    Master,
    Music,
    Sfx,
    Transport,
}

pub struct SettingsPlugin;

impl Plugin for SettingsPlugin {
    fn build(&self, app: &mut App) {
        app.init_resource::<GameSettings>();
        app.init_resource::<SettingsLoad>();
        app.init_resource::<SettingsModalState>();
        app.add_systems(Startup, kick_off_settings_load);
        app.add_systems(
            Update,
            (
                apply_loaded_settings,
                apply_transport_override,
                persist_settings_on_change,
                toggle_settings_modal,
                handle_settings_actions,
                update_settings_readouts,
            ),
        );
    }
}

/// Mirror `GameSettings.transport_override` onto `ClientProfile.has_webtransport`
/// so the existing `request_go_online` path consults a single source of
/// truth. Auto = leave the probed value alone; WebSocket = force false;
/// WebTransport = force true only when the platform can actually do it.
fn apply_transport_override(
    settings: Res<GameSettings>,
    mut profile: ResMut<super::client_profile::ClientProfile>,
) {
    if !settings.is_changed() {
        return;
    }
    match settings.transport_override {
        None | Some(TransportKind::Unknown) => {
            // Auto — leave whatever the platform probe wrote.
        }
        Some(TransportKind::WebSocket) => {
            if profile.has_webtransport {
                profile.has_webtransport = false;
            }
        }
        Some(TransportKind::WebTransport) => {
            // Only honor if the platform actually advertised WT during the
            // initial probe; otherwise the override is silently ignored.
            #[cfg(not(target_arch = "wasm32"))]
            {
                profile.has_webtransport = true;
            }
        }
    }
}

pub fn open_settings_modal(state: &mut SettingsModalState) {
    state.open = true;
}

pub fn request_open(world: &mut World) {
    if let Some(mut s) = world.get_resource_mut::<SettingsModalState>() {
        s.open = true;
    }
}

fn kick_off_settings_load(db: Res<Db>, mut load: ResMut<SettingsLoad>) {
    load.pending = Some(db.get::<GameSettings>(TABLE_SETTINGS, KEY_SETTINGS));
}

fn apply_loaded_settings(mut load: ResMut<SettingsLoad>, mut settings: ResMut<GameSettings>) {
    if load.loaded {
        return;
    }
    let Some(req) = load.pending.as_ref() else {
        return;
    };
    let Some(result) = req.try_recv() else {
        return;
    };
    load.pending = None;
    load.loaded = true;
    if let Ok(Some(stored)) = result {
        *settings = stored;
        info!("[settings] loaded from bevy_db");
    } else {
        info!("[settings] no stored settings — using defaults");
    }
}

fn persist_settings_on_change(db: Res<Db>, settings: Res<GameSettings>) {
    if !settings.is_changed() {
        return;
    }
    let _ = db.put(TABLE_SETTINGS, KEY_SETTINGS, &*settings);
}

fn toggle_settings_modal(
    mut commands: Commands,
    mut state: ResMut<SettingsModalState>,
    settings: Res<GameSettings>,
    existing: Query<Entity, With<SettingsModalRoot>>,
) {
    if state.is_changed() && state.open && existing.is_empty() {
        spawn_settings_modal(&mut commands, &settings);
    }
    if state.is_changed() && !state.open {
        for e in &existing {
            commands.entity(e).despawn();
        }
    }
}

fn spawn_settings_modal(commands: &mut Commands, settings: &GameSettings) {
    let root = commands
        .spawn((
            Node {
                position_type: PositionType::Absolute,
                top: Val::Px(0.0),
                left: Val::Px(0.0),
                width: Val::Percent(100.0),
                height: Val::Percent(100.0),
                justify_content: JustifyContent::Center,
                align_items: AlignItems::Center,
                ..default()
            },
            BackgroundColor(Color::srgba(0.0, 0.0, 0.0, 0.65)),
            GlobalZIndex(150),
            SettingsModalRoot,
        ))
        .id();

    commands.entity(root).with_children(|parent| {
        parent
            .spawn((
                Node {
                    width: Val::Px(340.0),
                    flex_direction: FlexDirection::Column,
                    padding: UiRect::all(Val::Px(16.0)),
                    row_gap: Val::Px(10.0),
                    border_radius: BorderRadius::all(Val::Px(8.0)),
                    ..default()
                },
                BackgroundColor(ui_color::PANEL),
                bevy::ui::FocusPolicy::Block,
            ))
            .with_children(|panel| {
                // Header row
                panel
                    .spawn(Node {
                        flex_direction: FlexDirection::Row,
                        justify_content: JustifyContent::SpaceBetween,
                        align_items: AlignItems::Center,
                        margin: UiRect::bottom(Val::Px(4.0)),
                        ..default()
                    })
                    .with_children(|header| {
                        header.spawn((
                            Text::new("Settings"),
                            TextFont {
                                font_size: 18.0,
                                ..default()
                            },
                            TextColor(ui_color::TEXT_PRIMARY),
                            bevy::ui::FocusPolicy::Pass,
                            bevy::picking::Pickable::IGNORE,
                        ));
                        ui::spawn_button(
                            header,
                            "Close",
                            UiButtonConfig {
                                width: Val::Px(70.0),
                                height: Val::Px(28.0),
                                font_size: 12.0,
                                border_radius: 4.0,
                                kind: ButtonKind::Secondary,
                            },
                            SettingsAction::Close,
                        );
                    });

                volume_row(
                    panel,
                    "Master volume",
                    VolumeKind::Master,
                    settings.master_volume,
                    SettingsAction::MasterDown,
                    SettingsAction::MasterUp,
                );
                volume_row(
                    panel,
                    "Music",
                    VolumeKind::Music,
                    settings.music_volume,
                    SettingsAction::MusicDown,
                    SettingsAction::MusicUp,
                );
                volume_row(
                    panel,
                    "Effects",
                    VolumeKind::Sfx,
                    settings.sfx_volume,
                    SettingsAction::SfxDown,
                    SettingsAction::SfxUp,
                );

                // Transport row
                panel.spawn((
                    Text::new("Transport"),
                    TextFont {
                        font_size: 13.0,
                        ..default()
                    },
                    TextColor(ui_color::TEXT_SECONDARY),
                    bevy::ui::FocusPolicy::Pass,
                    bevy::picking::Pickable::IGNORE,
                ));
                panel
                    .spawn(Node {
                        flex_direction: FlexDirection::Row,
                        column_gap: Val::Px(6.0),
                        align_items: AlignItems::Center,
                        ..default()
                    })
                    .with_children(|row| {
                        ui::spawn_button(
                            row,
                            "Auto",
                            UiButtonConfig {
                                width: Val::Px(80.0),
                                height: Val::Px(28.0),
                                font_size: 11.0,
                                border_radius: 4.0,
                                kind: kind_for(settings.transport_override.is_none()),
                            },
                            SettingsAction::TransportAuto,
                        );
                        ui::spawn_button(
                            row,
                            "WebSocket",
                            UiButtonConfig {
                                width: Val::Px(100.0),
                                height: Val::Px(28.0),
                                font_size: 11.0,
                                border_radius: 4.0,
                                kind: kind_for(
                                    settings.transport_override == Some(TransportKind::WebSocket),
                                ),
                            },
                            SettingsAction::TransportWebSocket,
                        );
                        ui::spawn_button(
                            row,
                            "WebTransport",
                            UiButtonConfig {
                                width: Val::Px(120.0),
                                height: Val::Px(28.0),
                                font_size: 11.0,
                                border_radius: 4.0,
                                kind: kind_for(
                                    settings.transport_override
                                        == Some(TransportKind::WebTransport),
                                ),
                            },
                            SettingsAction::TransportWebTransport,
                        );
                    });
                panel.spawn((
                    Text::new(transport_label(&settings.transport_override)),
                    TextFont {
                        font_size: 11.0,
                        ..default()
                    },
                    TextColor(ui_color::TEXT_SECONDARY),
                    bevy::ui::FocusPolicy::Pass,
                    bevy::picking::Pickable::IGNORE,
                    VolumeReadout(VolumeKind::Transport),
                ));
            });
    });
}

fn kind_for(active: bool) -> ButtonKind {
    if active {
        ButtonKind::Primary
    } else {
        ButtonKind::Secondary
    }
}

fn volume_row(
    parent: &mut ChildSpawnerCommands,
    label: &str,
    kind: VolumeKind,
    value: u8,
    down: SettingsAction,
    up: SettingsAction,
) {
    parent
        .spawn(Node {
            flex_direction: FlexDirection::Row,
            justify_content: JustifyContent::SpaceBetween,
            align_items: AlignItems::Center,
            column_gap: Val::Px(8.0),
            ..default()
        })
        .with_children(|row| {
            row.spawn((
                Text::new(label.to_string()),
                TextFont {
                    font_size: 13.0,
                    ..default()
                },
                TextColor(ui_color::TEXT_SECONDARY),
                bevy::ui::FocusPolicy::Pass,
                bevy::picking::Pickable::IGNORE,
            ));
            row.spawn(Node {
                flex_direction: FlexDirection::Row,
                align_items: AlignItems::Center,
                column_gap: Val::Px(6.0),
                ..default()
            })
            .with_children(|controls| {
                ui::spawn_button(
                    controls,
                    "-",
                    UiButtonConfig {
                        width: Val::Px(28.0),
                        height: Val::Px(24.0),
                        font_size: 14.0,
                        border_radius: 4.0,
                        kind: ButtonKind::Secondary,
                    },
                    down,
                );
                controls.spawn((
                    Text::new(format!("{value:>3}%")),
                    TextFont {
                        font_size: 12.0,
                        ..default()
                    },
                    TextColor(ui_color::TEXT_PRIMARY),
                    bevy::ui::FocusPolicy::Pass,
                    bevy::picking::Pickable::IGNORE,
                    VolumeReadout(kind),
                ));
                ui::spawn_button(
                    controls,
                    "+",
                    UiButtonConfig {
                        width: Val::Px(28.0),
                        height: Val::Px(24.0),
                        font_size: 14.0,
                        border_radius: 4.0,
                        kind: ButtonKind::Secondary,
                    },
                    up,
                );
            });
        });
}

fn handle_settings_actions(
    mut settings: ResMut<GameSettings>,
    mut state: ResMut<SettingsModalState>,
    q: Query<(&Interaction, &SettingsAction), Changed<Interaction>>,
) {
    for (interaction, action) in &q {
        if *interaction != Interaction::Pressed {
            continue;
        }
        match action {
            SettingsAction::MasterDown => {
                settings.master_volume = settings.master_volume.saturating_sub(5)
            }
            SettingsAction::MasterUp => {
                settings.master_volume = (settings.master_volume + 5).min(100)
            }
            SettingsAction::MusicDown => {
                settings.music_volume = settings.music_volume.saturating_sub(5)
            }
            SettingsAction::MusicUp => settings.music_volume = (settings.music_volume + 5).min(100),
            SettingsAction::SfxDown => settings.sfx_volume = settings.sfx_volume.saturating_sub(5),
            SettingsAction::SfxUp => settings.sfx_volume = (settings.sfx_volume + 5).min(100),
            SettingsAction::TransportAuto => settings.transport_override = None,
            SettingsAction::TransportWebSocket => {
                settings.transport_override = Some(TransportKind::WebSocket)
            }
            SettingsAction::TransportWebTransport => {
                settings.transport_override = Some(TransportKind::WebTransport)
            }
            SettingsAction::Close => state.open = false,
        }
    }
}

fn update_settings_readouts(
    settings: Res<GameSettings>,
    mut q: Query<(&mut Text, &VolumeReadout)>,
) {
    if !settings.is_changed() {
        return;
    }
    for (mut text, readout) in &mut q {
        let s = match readout.0 {
            VolumeKind::Master => format!("{:>3}%", settings.master_volume),
            VolumeKind::Music => format!("{:>3}%", settings.music_volume),
            VolumeKind::Sfx => format!("{:>3}%", settings.sfx_volume),
            VolumeKind::Transport => transport_label(&settings.transport_override).into(),
        };
        **text = s;
    }
}

fn transport_label(override_: &Option<TransportKind>) -> &'static str {
    match override_ {
        None => "Auto — picks WebTransport when available.",
        Some(TransportKind::WebSocket) => "Forced WebSocket (TCP).",
        Some(TransportKind::WebTransport) => "Forced WebTransport (UDP).",
        Some(TransportKind::Unknown) => "Auto — picks WebTransport when available.",
    }
}

#[allow(dead_code)]
pub fn current_settings(world: &World) -> GameSettings {
    world
        .get_resource::<GameSettings>()
        .cloned()
        .unwrap_or_default()
}

pub fn open_settings(world: &mut World) {
    if let Some(mut s) = world.get_resource_mut::<SettingsModalState>() {
        s.open = true;
    } else {
        let _ = GamePhase::Title;
    }
}
