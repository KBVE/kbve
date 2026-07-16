use bevy::picking::Pickable;
use bevy::prelude::*;
use bevy::ui::FocusPolicy;

use super::button::{ButtonKind, UiButtonConfig};
use crate::game::ui_color;

/// Marker for any modal root entity.
#[derive(Component)]
pub struct ModalRoot;

/// Marker on the close-X button child of a modal — pressing it triggers
/// `ModalCloseEvent` carrying the modal root Entity.
#[derive(Component)]
pub struct ModalCloseBtn(pub Entity);

#[derive(Message)]
pub struct ModalCloseEvent(pub Entity);

pub struct ModalConfig {
    pub title: Option<String>,
    pub width: Val,
    pub padding: UiRect,
    pub bg: Color,
    pub z: i32,
    /// Position panel absolutely; pass None to leave the modal in normal flow.
    pub position: Option<ModalPosition>,
}

pub struct ModalPosition {
    pub bottom: Option<Val>,
    pub top: Option<Val>,
    pub left: Option<Val>,
    pub margin: UiRect,
}

impl Default for ModalConfig {
    fn default() -> Self {
        Self {
            title: None,
            width: Val::Px(280.0),
            padding: UiRect::all(Val::Px(10.0)),
            bg: ui_color::PANEL,
            z: 80,
            position: None,
        }
    }
}

/// Spawn a reusable modal root. Returns the root entity so the caller can
/// attach a marker and fill in body content via `commands.entity(root).with_children(..)`.
pub fn spawn_modal(commands: &mut Commands, cfg: ModalConfig, marker: impl Component) -> Entity {
    let mut root_node = Node {
        flex_direction: FlexDirection::Column,
        width: cfg.width,
        padding: cfg.padding,
        row_gap: Val::Px(8.0),
        border_radius: BorderRadius::all(Val::Px(6.0)),
        ..default()
    };
    if let Some(pos) = cfg.position {
        root_node.position_type = PositionType::Absolute;
        if let Some(b) = pos.bottom {
            root_node.bottom = b;
        }
        if let Some(t) = pos.top {
            root_node.top = t;
        }
        if let Some(l) = pos.left {
            root_node.left = l;
        }
        root_node.margin = pos.margin;
    }

    let root = commands
        .spawn((
            root_node,
            BackgroundColor(cfg.bg),
            GlobalZIndex(cfg.z),
            FocusPolicy::Block,
            ModalRoot,
            marker,
        ))
        .id();

    // Header row: optional title + close X
    let header = commands
        .spawn((
            Node {
                flex_direction: FlexDirection::Row,
                justify_content: JustifyContent::SpaceBetween,
                align_items: AlignItems::Center,
                ..default()
            },
            FocusPolicy::Pass,
        ))
        .id();
    commands.entity(root).add_child(header);

    if let Some(title) = cfg.title {
        let title_entity = commands
            .spawn((
                Text::new(title),
                TextFont {
                    font_size: bevy::text::FontSize::Px(14.0),
                    ..default()
                },
                TextColor(ui_color::TEXT_PRIMARY),
                FocusPolicy::Pass,
                Pickable::IGNORE,
            ))
            .id();
        commands.entity(header).add_child(title_entity);
    } else {
        // Spacer keeps close-X anchored right when no title is present.
        let spacer = commands.spawn(Node::default()).id();
        commands.entity(header).add_child(spacer);
    }

    let close = commands
        .spawn((
            Node {
                width: Val::Px(20.0),
                height: Val::Px(20.0),
                justify_content: JustifyContent::Center,
                align_items: AlignItems::Center,
                border_radius: BorderRadius::all(Val::Px(3.0)),
                ..default()
            },
            BackgroundColor(Color::NONE),
            Interaction::default(),
            FocusPolicy::Block,
            ButtonKind::Ghost,
            ModalCloseBtn(root),
        ))
        .with_child((
            Text::new("✕"),
            TextFont {
                font_size: bevy::text::FontSize::Px(12.0),
                ..default()
            },
            TextColor(ui_color::TEXT_SECONDARY),
            FocusPolicy::Pass,
            Pickable::IGNORE,
        ))
        .id();
    commands.entity(header).add_child(close);

    // Discard the unused config so the API matches `spawn_button` flow.
    let _ = UiButtonConfig::default();

    root
}

pub struct ModalPlugin;

impl Plugin for ModalPlugin {
    fn build(&self, app: &mut App) {
        app.add_message::<ModalCloseEvent>();
        app.add_systems(Update, dispatch_close);
    }
}

fn dispatch_close(
    q: Query<(&Interaction, &ModalCloseBtn), Changed<Interaction>>,
    mut writer: MessageWriter<ModalCloseEvent>,
) {
    for (interaction, btn) in &q {
        if *interaction == Interaction::Pressed {
            writer.write(ModalCloseEvent(btn.0));
        }
    }
}
