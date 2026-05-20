use bevy::picking::Pickable;
use bevy::prelude::*;
use bevy::ui::FocusPolicy;

use crate::game::ui_color;

#[derive(Component, Clone, Copy, PartialEq, Eq)]
pub enum ButtonKind {
    Primary,
    Secondary,
    Ghost,
    Danger,
}

impl ButtonKind {
    fn base(self) -> Color {
        match self {
            ButtonKind::Primary => ui_color::BTN_PRIMARY,
            ButtonKind::Secondary => ui_color::BTN_SECONDARY,
            ButtonKind::Ghost => Color::NONE,
            ButtonKind::Danger => Color::srgba(0.7, 0.2, 0.2, 1.0),
        }
    }

    fn hover(self) -> Color {
        match self {
            ButtonKind::Primary => ui_color::BTN_PRIMARY_HOVER,
            ButtonKind::Secondary => ui_color::BTN_SECONDARY_HOVER,
            ButtonKind::Ghost => Color::srgba(1.0, 1.0, 1.0, 0.08),
            ButtonKind::Danger => Color::srgba(0.85, 0.3, 0.3, 1.0),
        }
    }

    fn pressed(self) -> Color {
        match self {
            ButtonKind::Primary => ui_color::BTN_PRIMARY_PRESSED,
            ButtonKind::Secondary => ui_color::BTN_SECONDARY_PRESSED,
            ButtonKind::Ghost => Color::srgba(1.0, 1.0, 1.0, 0.15),
            ButtonKind::Danger => Color::srgba(0.55, 0.15, 0.15, 1.0),
        }
    }
}

pub struct UiButtonConfig {
    pub width: Val,
    pub height: Val,
    pub font_size: f32,
    pub border_radius: f32,
    pub kind: ButtonKind,
}

impl Default for UiButtonConfig {
    fn default() -> Self {
        Self {
            width: Val::Px(220.0),
            height: Val::Px(40.0),
            font_size: 16.0,
            border_radius: 6.0,
            kind: ButtonKind::Primary,
        }
    }
}

pub fn spawn(
    parent: &mut ChildSpawnerCommands,
    label: &str,
    cfg: UiButtonConfig,
    marker: impl Component,
) -> Entity {
    spawn_with_label_marker(parent, label, cfg, marker, ())
}

pub fn spawn_with_label_marker(
    parent: &mut ChildSpawnerCommands,
    label: &str,
    cfg: UiButtonConfig,
    marker: impl Component,
    label_marker: impl Bundle,
) -> Entity {
    let bg = cfg.kind.base();
    parent
        .spawn((
            Node {
                width: cfg.width,
                height: cfg.height,
                justify_content: JustifyContent::Center,
                align_items: AlignItems::Center,
                border_radius: BorderRadius::all(Val::Px(cfg.border_radius)),
                ..default()
            },
            BackgroundColor(bg),
            Interaction::default(),
            FocusPolicy::Block,
            cfg.kind,
            marker,
        ))
        .with_child((
            Text::new(label.to_string()),
            TextFont {
                font_size: cfg.font_size,
                ..default()
            },
            TextColor(ui_color::BTN_TEXT),
            FocusPolicy::Pass,
            Pickable::IGNORE,
            label_marker,
        ))
        .id()
}

pub struct ButtonPlugin;

impl Plugin for ButtonPlugin {
    fn build(&self, app: &mut App) {
        app.add_systems(Update, update_visuals);
    }
}

fn update_visuals(
    mut q: Query<(&Interaction, &ButtonKind, &mut BackgroundColor), Changed<Interaction>>,
) {
    for (interaction, kind, mut bg) in &mut q {
        *bg = match interaction {
            Interaction::Pressed => kind.pressed().into(),
            Interaction::Hovered => kind.hover().into(),
            Interaction::None => kind.base().into(),
        };
    }
}
