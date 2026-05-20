use bevy::picking::Pickable;
use bevy::prelude::*;
use bevy::ui::FocusPolicy;

use crate::game::ui_color;

#[derive(Clone, Copy)]
pub enum LabelKind {
    Heading,
    Body,
    Muted,
    Success,
    Warning,
    Error,
}

impl LabelKind {
    fn color(self) -> Color {
        match self {
            LabelKind::Heading => ui_color::TEXT_PRIMARY,
            LabelKind::Body => ui_color::TEXT_PRIMARY,
            LabelKind::Muted => ui_color::TEXT_SECONDARY,
            LabelKind::Success => ui_color::TEXT_SUCCESS,
            LabelKind::Warning => ui_color::TEXT_WARNING,
            LabelKind::Error => ui_color::TEXT_ERROR,
        }
    }
}

pub fn spawn_label(
    parent: &mut ChildSpawnerCommands,
    text: &str,
    kind: LabelKind,
    font_size: f32,
    marker: impl Bundle,
) -> Entity {
    parent
        .spawn((
            Text::new(text.to_string()),
            TextFont {
                font_size,
                ..default()
            },
            TextColor(kind.color()),
            FocusPolicy::Pass,
            Pickable::IGNORE,
            marker,
        ))
        .id()
}
