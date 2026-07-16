//! Bottom-left chat log overlay.
//!
//! Renders the last `CHAT_HISTORY_MAX` incoming chat messages as a
//! semi-transparent glass panel anchored above the joystick. The React
//! `ChatInput.tsx` component handles the actual text entry — it submits
//! through the `send_chat` Tauri command / wasm-bindgen export which
//! enqueues a `ChatMessage` on the chat outbox.

use bevy::picking::Pickable;
use bevy::prelude::*;
use bevy::ui::FocusPolicy;
use bevy_chat::{IncomingChatEvent, MessageKind};

use super::phase::GamePhase;
use super::ui_color;

const CHAT_HISTORY_MAX: usize = 30;
const PANEL_WIDTH: f32 = 320.0;
const PANEL_MAX_HEIGHT: f32 = 200.0;

#[derive(Resource, Default)]
struct ChatLog {
    /// Ring buffer of recent lines: (display label, body).
    entries: Vec<ChatLogEntry>,
}

#[derive(Clone)]
struct ChatLogEntry {
    sender: String,
    content: String,
    color: Color,
}

#[derive(Component)]
struct ChatOverlayRoot;

#[derive(Component)]
struct ChatLogList;

pub struct ChatUiPlugin;

impl Plugin for ChatUiPlugin {
    fn build(&self, app: &mut App) {
        app.init_resource::<ChatLog>();
        app.add_systems(OnEnter(GamePhase::Playing), spawn_chat_overlay);
        app.add_systems(
            Update,
            (ingest_incoming, render_log).run_if(in_state(GamePhase::Playing)),
        );
    }
}

fn spawn_chat_overlay(mut commands: Commands) {
    commands
        .spawn((
            Node {
                position_type: PositionType::Absolute,
                left: Val::Px(16.0),
                bottom: Val::Px(212.0),
                width: Val::Px(PANEL_WIDTH),
                max_height: Val::Px(PANEL_MAX_HEIGHT),
                flex_direction: FlexDirection::Column,
                padding: UiRect::all(Val::Px(8.0)),
                row_gap: Val::Px(2.0),
                border_radius: BorderRadius::all(Val::Px(6.0)),
                overflow: Overflow::clip(),
                ..default()
            },
            BackgroundColor(Color::srgba(0.05, 0.05, 0.08, 0.75)),
            GlobalZIndex(55),
            FocusPolicy::Pass,
            Pickable::IGNORE,
            DespawnOnExit(GamePhase::Playing),
            ChatOverlayRoot,
        ))
        .with_child((
            Node {
                width: Val::Percent(100.0),
                flex_direction: FlexDirection::Column,
                row_gap: Val::Px(2.0),
                ..default()
            },
            FocusPolicy::Pass,
            Pickable::IGNORE,
            ChatLogList,
        ));
}

fn ingest_incoming(mut events: MessageReader<IncomingChatEvent>, mut log: ResMut<ChatLog>) {
    for IncomingChatEvent(msg) in events.read() {
        // Skip world-events; those already toast.
        if msg.channel == "#world-events" {
            continue;
        }
        let color = color_for_kind(&msg.kind);
        log.entries.push(ChatLogEntry {
            sender: msg.sender.clone(),
            content: msg.content.clone(),
            color,
        });
        if log.entries.len() > CHAT_HISTORY_MAX {
            let excess = log.entries.len() - CHAT_HISTORY_MAX;
            log.entries.drain(0..excess);
        }
    }
}

fn color_for_kind(kind: &MessageKind) -> Color {
    match kind {
        MessageKind::Chat => ui_color::TEXT_PRIMARY,
        MessageKind::System => ui_color::TEXT_SECONDARY,
        _ => ui_color::TEXT_ACCENT,
    }
}

fn render_log(
    mut commands: Commands,
    log: Res<ChatLog>,
    list_q: Query<Entity, With<ChatLogList>>,
    existing: Query<Entity, (With<ChatLogLine>, Without<ChatLogList>)>,
) {
    if !log.is_changed() {
        return;
    }
    for e in &existing {
        commands.entity(e).despawn();
    }
    let Ok(list) = list_q.single() else {
        return;
    };
    let visible = log
        .entries
        .iter()
        .rev()
        .take(CHAT_HISTORY_MAX)
        .collect::<Vec<_>>();
    commands.entity(list).with_children(|list_children| {
        for entry in visible.iter().rev() {
            list_children
                .spawn((
                    Node {
                        flex_direction: FlexDirection::Row,
                        column_gap: Val::Px(4.0),
                        ..default()
                    },
                    FocusPolicy::Pass,
                    Pickable::IGNORE,
                    ChatLogLine,
                ))
                .with_children(|line| {
                    line.spawn((
                        Text::new(format!("{}:", entry.sender)),
                        TextFont {
                            font_size: bevy::text::FontSize::Px(11.0),
                            ..default()
                        },
                        TextColor(entry.color),
                        FocusPolicy::Pass,
                        Pickable::IGNORE,
                    ));
                    line.spawn((
                        Text::new(entry.content.clone()),
                        TextFont {
                            font_size: bevy::text::FontSize::Px(11.0),
                            ..default()
                        },
                        TextColor(ui_color::TEXT_PRIMARY),
                        FocusPolicy::Pass,
                        Pickable::IGNORE,
                    ));
                });
        }
    });
}

#[derive(Component)]
struct ChatLogLine;
