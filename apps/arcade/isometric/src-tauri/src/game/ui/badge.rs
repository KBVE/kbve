use bevy::picking::Pickable;
use bevy::prelude::*;
use bevy::ui::FocusPolicy;

use crate::game::ui_color;

#[derive(Component, Clone, Copy, PartialEq, Eq)]
pub enum BadgeKind {
    Loading,
    Success,
    Info,
    Warning,
    WebTransport,
    WebSocket,
    Offline,
}

impl BadgeKind {
    fn color(self) -> Color {
        match self {
            BadgeKind::Loading => ui_color::BADGE_LOADING,
            BadgeKind::Success => ui_color::TEXT_SUCCESS,
            BadgeKind::Info => ui_color::TEXT_ACCENT,
            BadgeKind::Warning => ui_color::TEXT_WARNING,
            BadgeKind::WebTransport => ui_color::BADGE_WT,
            BadgeKind::WebSocket => ui_color::BADGE_WS,
            BadgeKind::Offline => ui_color::BADGE_OFFLINE,
        }
    }
}

pub fn spawn_badge(
    parent: &mut ChildSpawnerCommands,
    text: &str,
    kind: BadgeKind,
    font_size: f32,
    marker: impl Component,
) -> Entity {
    parent
        .spawn((
            Text::new(text.to_string()),
            TextFont {
                font_size: bevy::text::FontSize::Px(font_size),
                ..default()
            },
            TextColor(kind.color()),
            FocusPolicy::Pass,
            Pickable::IGNORE,
            kind,
            marker,
        ))
        .id()
}
