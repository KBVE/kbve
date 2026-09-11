use bevy::prelude::*;
use bevy::ui::FocusPolicy;

use crate::game::ui_color;

pub struct PanelConfig {
    pub width: Val,
    pub padding: UiRect,
    pub row_gap: Val,
    pub border_radius: f32,
    pub bg: Color,
}

impl Default for PanelConfig {
    fn default() -> Self {
        Self {
            width: Val::Px(280.0),
            padding: UiRect::all(Val::Px(10.0)),
            row_gap: Val::Px(8.0),
            border_radius: 6.0,
            bg: ui_color::PANEL,
        }
    }
}

pub fn spawn_panel<'a>(
    commands: &'a mut Commands,
    cfg: PanelConfig,
    extra: impl Bundle,
) -> EntityCommands<'a> {
    commands.spawn((
        Node {
            flex_direction: FlexDirection::Column,
            width: cfg.width,
            padding: cfg.padding,
            row_gap: cfg.row_gap,
            border_radius: BorderRadius::all(Val::Px(cfg.border_radius)),
            ..default()
        },
        BackgroundColor(cfg.bg),
        FocusPolicy::Block,
        extra,
    ))
}
