//! Native Bevy pause menu — replaces React PauseMenu.tsx.
//!
//! Toggled via Escape key. Full-screen overlay with settings categories
//! (General, Audio, Video, Controls) and a Resume button.
//! Blocks player input while open via the `UiOverlay` resource.

use bevy::prelude::*;

use super::phase::GamePhase;
use super::ui_color;

// ---------------------------------------------------------------------------
// Shared overlay exclusivity resource
// ---------------------------------------------------------------------------

/// Tracks which UI overlay is currently active during gameplay.
/// Only one overlay can be open at a time. Input bridge and player
/// systems can check this to block game input while overlays are open.
#[derive(Resource, Default, Debug, Clone, Copy, PartialEq, Eq)]
pub enum UiOverlay {
    #[default]
    None,
    PauseMenu,
    Inventory,
    Interaction,
}

impl UiOverlay {
    pub fn is_open(self) -> bool {
        self != Self::None
    }
}

// ---------------------------------------------------------------------------
// Settings category
// ---------------------------------------------------------------------------

#[derive(Clone, Copy, PartialEq, Eq, Default)]
enum SettingsCategory {
    #[default]
    General,
    Audio,
    Video,
    Controls,
}

const CATEGORIES: &[(SettingsCategory, &str)] = &[
    (SettingsCategory::General, "General"),
    (SettingsCategory::Audio, "Audio"),
    (SettingsCategory::Video, "Video"),
    (SettingsCategory::Controls, "Controls"),
];

// ---------------------------------------------------------------------------
// Components
// ---------------------------------------------------------------------------

#[derive(Component)]
struct PauseMenuRoot;

#[derive(Component)]
struct PauseMenuPanel;

#[derive(Component)]
struct CategoryBtn {
    category: SettingsCategory,
}

#[derive(Component)]
struct CategoryContent;

#[derive(Component)]
struct ResumeBtn;

/// Resource tracking active category.
#[derive(Resource, Default)]
struct PauseMenuState {
    category: SettingsCategory,
}

// ---------------------------------------------------------------------------
// Plugin
// ---------------------------------------------------------------------------

pub struct PauseMenuPlugin;

impl Plugin for PauseMenuPlugin {
    fn build(&self, app: &mut App) {
        app.init_resource::<UiOverlay>();
        app.init_resource::<PauseMenuState>();
        app.add_systems(OnEnter(GamePhase::Playing), spawn_pause_menu);
        app.add_systems(
            Update,
            (
                toggle_pause_menu,
                handle_category_buttons,
                handle_resume_button,
            )
                .run_if(in_state(GamePhase::Playing)),
        );
    }
}

// ---------------------------------------------------------------------------
// Content text for each category
// ---------------------------------------------------------------------------

fn category_text(cat: SettingsCategory) -> &'static str {
    match cat {
        SettingsCategory::General => "Game settings will be added here.",
        SettingsCategory::Audio => "Volume controls will be added here.",
        SettingsCategory::Video => "Resolution and display options will be added here.",
        SettingsCategory::Controls => {
            "W/A/S/D \u{2014} Move\nSpace \u{2014} Jump\nI \u{2014} Inventory\nEscape \u{2014} Toggle Menu"
        }
    }
}

fn category_title(cat: SettingsCategory) -> &'static str {
    match cat {
        SettingsCategory::General => "General Settings",
        SettingsCategory::Audio => "Audio Settings",
        SettingsCategory::Video => "Video Settings",
        SettingsCategory::Controls => "Controls",
    }
}

// ---------------------------------------------------------------------------
// Spawn (hidden overlay)
// ---------------------------------------------------------------------------

fn spawn_pause_menu(mut commands: Commands) {
    commands
        .spawn((
            // Full-screen backdrop
            Node {
                width: Val::Percent(100.0),
                height: Val::Percent(100.0),
                position_type: PositionType::Absolute,
                justify_content: JustifyContent::Center,
                align_items: AlignItems::Center,
                ..default()
            },
            BackgroundColor(ui_color::BACKDROP),
            GlobalZIndex(95),
            Visibility::Hidden,
            DespawnOnExit(GamePhase::Playing),
            PauseMenuRoot,
        ))
        .with_children(|root| {
            // Central panel
            root.spawn((
                Node {
                    width: Val::Px(480.0),
                    flex_direction: FlexDirection::Column,
                    border_radius: BorderRadius::all(Val::Px(6.0)),
                    overflow: Overflow::clip(),
                    ..default()
                },
                BackgroundColor(ui_color::PANEL),
                PauseMenuPanel,
            ))
            .with_children(|panel| {
                // Header
                panel
                    .spawn((
                        Node {
                            width: Val::Percent(100.0),
                            padding: UiRect::axes(Val::Px(14.0), Val::Px(10.0)),
                            justify_content: JustifyContent::SpaceBetween,
                            align_items: AlignItems::Center,
                            ..default()
                        },
                        BackgroundColor(Color::srgba(0.06, 0.06, 0.09, 1.0)),
                    ))
                    .with_children(|header| {
                        header.spawn((
                            Text::new("Settings"),
                            TextFont {
                                font_size: 16.0,
                                ..default()
                            },
                            TextColor(ui_color::TEXT_PRIMARY),
                        ));
                    });

                // Body: sidebar + content
                panel
                    .spawn(Node {
                        width: Val::Percent(100.0),
                        min_height: Val::Px(240.0),
                        flex_direction: FlexDirection::Row,
                        ..default()
                    })
                    .with_children(|body| {
                        // Sidebar
                        body.spawn((
                            Node {
                                width: Val::Px(120.0),
                                flex_direction: FlexDirection::Column,
                                padding: UiRect::all(Val::Px(8.0)),
                                row_gap: Val::Px(4.0),
                                ..default()
                            },
                            BackgroundColor(Color::srgba(0.05, 0.05, 0.08, 1.0)),
                        ))
                        .with_children(|sidebar| {
                            for &(cat, label) in CATEGORIES {
                                let is_active = cat == SettingsCategory::General;
                                sidebar
                                    .spawn((
                                        Node {
                                            width: Val::Percent(100.0),
                                            padding: UiRect::axes(Val::Px(10.0), Val::Px(6.0)),
                                            border_radius: BorderRadius::all(Val::Px(3.0)),
                                            ..default()
                                        },
                                        BackgroundColor(if is_active {
                                            ui_color::BTN_PRIMARY
                                        } else {
                                            Color::NONE
                                        }),
                                        Interaction::default(),
                                        CategoryBtn { category: cat },
                                    ))
                                    .with_child((
                                        Text::new(label),
                                        TextFont {
                                            font_size: 12.0,
                                            ..default()
                                        },
                                        TextColor(if is_active {
                                            ui_color::TEXT_PRIMARY
                                        } else {
                                            ui_color::TEXT_SECONDARY
                                        }),
                                    ));
                            }
                        });

                        // Content area
                        body.spawn((
                            Node {
                                flex_grow: 1.0,
                                padding: UiRect::all(Val::Px(16.0)),
                                flex_direction: FlexDirection::Column,
                                row_gap: Val::Px(8.0),
                                ..default()
                            },
                            BackgroundColor(Color::srgba(0.05, 0.05, 0.08, 0.5)),
                        ))
                        .with_children(|content| {
                            // Title
                            content.spawn((
                                Text::new(category_title(SettingsCategory::General)),
                                TextFont {
                                    font_size: 14.0,
                                    ..default()
                                },
                                TextColor(ui_color::TEXT_PRIMARY),
                                CategoryContent,
                            ));
                            // Body text
                            content.spawn((
                                Text::new(category_text(SettingsCategory::General)),
                                TextFont {
                                    font_size: 11.0,
                                    ..default()
                                },
                                TextColor(ui_color::TEXT_SECONDARY),
                                CategoryContent,
                            ));
                        });
                    });

                // Footer with Resume button
                panel
                    .spawn(Node {
                        width: Val::Percent(100.0),
                        padding: UiRect::axes(Val::Px(14.0), Val::Px(10.0)),
                        justify_content: JustifyContent::FlexEnd,
                        ..default()
                    })
                    .with_children(|footer| {
                        footer
                            .spawn((
                                Node {
                                    width: Val::Px(90.0),
                                    height: Val::Px(32.0),
                                    justify_content: JustifyContent::Center,
                                    align_items: AlignItems::Center,
                                    border_radius: BorderRadius::all(Val::Px(4.0)),
                                    ..default()
                                },
                                BackgroundColor(ui_color::BTN_PRIMARY),
                                Interaction::default(),
                                ResumeBtn,
                            ))
                            .with_child((
                                Text::new("Resume"),
                                TextFont {
                                    font_size: 12.0,
                                    ..default()
                                },
                                TextColor(ui_color::BTN_TEXT),
                            ));
                    });
            });
        });
}

// ---------------------------------------------------------------------------
// Systems
// ---------------------------------------------------------------------------

fn toggle_pause_menu(
    keys: Res<ButtonInput<KeyCode>>,
    mut overlay: ResMut<UiOverlay>,
    mut menu_q: Query<&mut Visibility, With<PauseMenuRoot>>,
) {
    if !keys.just_pressed(KeyCode::Escape) {
        return;
    }

    match *overlay {
        UiOverlay::PauseMenu => {
            // Close
            *overlay = UiOverlay::None;
            for mut vis in &mut menu_q {
                *vis = Visibility::Hidden;
            }
        }
        UiOverlay::None => {
            // Open
            *overlay = UiOverlay::PauseMenu;
            for mut vis in &mut menu_q {
                *vis = Visibility::Visible;
            }
        }
        _ => {
            // Another overlay is open — close it first (Escape as universal close)
            *overlay = UiOverlay::None;
            for mut vis in &mut menu_q {
                *vis = Visibility::Hidden;
            }
        }
    }
}

fn handle_category_buttons(
    mut state: ResMut<PauseMenuState>,
    btn_q: Query<(&Interaction, &CategoryBtn), Changed<Interaction>>,
    mut all_btns: Query<(&CategoryBtn, &mut BackgroundColor, &Children)>,
    mut text_colors: Query<&mut TextColor>,
    mut content_q: Query<&mut Text, With<CategoryContent>>,
) {
    for (interaction, clicked) in &btn_q {
        if *interaction != Interaction::Pressed {
            continue;
        }
        if state.category == clicked.category {
            continue;
        }
        state.category = clicked.category;

        // Update button highlights
        for (btn, mut bg, children) in &mut all_btns {
            let is_active = btn.category == state.category;
            *bg = if is_active {
                ui_color::BTN_PRIMARY.into()
            } else {
                Color::NONE.into()
            };
            for child in children.iter() {
                if let Ok(mut tc) = text_colors.get_mut(child) {
                    tc.0 = if is_active {
                        ui_color::TEXT_PRIMARY
                    } else {
                        ui_color::TEXT_SECONDARY
                    };
                }
            }
        }

        // Update content text
        let mut iter = content_q.iter_mut();
        if let Some(mut title) = iter.next() {
            **title = category_title(state.category).to_string();
        }
        if let Some(mut body) = iter.next() {
            **body = category_text(state.category).to_string();
        }
    }
}

fn handle_resume_button(
    mut overlay: ResMut<UiOverlay>,
    mut menu_q: Query<&mut Visibility, With<PauseMenuRoot>>,
    btn_q: Query<&Interaction, (Changed<Interaction>, With<ResumeBtn>)>,
) {
    for interaction in &btn_q {
        if *interaction == Interaction::Pressed {
            *overlay = UiOverlay::None;
            for mut vis in &mut menu_q {
                *vis = Visibility::Hidden;
            }
        }
    }
}
