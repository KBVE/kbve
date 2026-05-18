//! Equipment slot panel — server-authoritative gear display.
//!
//! Toggled with `V`. Renders a grid of every proto `EquipSlot` showing the
//! current item's emoji (or a placeholder) and dispatches `UnequipRequestEvent`
//! when a populated slot is clicked. Equipped contents come from the
//! `LocalPlayerEquipment` resource, which is filled by `EquipmentSync` and
//! `EquipmentUpdate` messages from the server.

use bevy::prelude::*;

use super::inventory::ItemKind;
use super::net::UnequipRequestEvent;
use super::pause_menu::UiOverlay;
use super::phase::GamePhase;
use super::ui_color;

const PANEL_WIDTH: f32 = 240.0;
const SLOT_SIZE: f32 = 44.0;
const GRID_COLS: usize = 4;
const ROOT_PANEL_BG: Color = Color::srgba(0.08, 0.08, 0.10, 0.95);
const SLOT_BG: Color = Color::srgba(0.14, 0.14, 0.18, 1.0);
const GOLD_TEXT: Color = Color::srgba(0.78, 0.66, 0.20, 1.0);

const EQUIP_SLOTS: &[(i32, &str)] = &[
    (1, "Head"),
    (2, "Chest"),
    (3, "Legs"),
    (4, "Feet"),
    (5, "Hands"),
    (6, "Main"),
    (7, "Off"),
    (8, "Neck"),
    (9, "Ring"),
    (10, "Back"),
    (11, "2H"),
    (12, "Ammo"),
];

#[derive(Resource, Default)]
struct EquipmentUiState {
    open: bool,
}

#[derive(Component)]
struct EquipmentRoot;

#[derive(Component)]
struct EquipmentSlot {
    equip_slot: i32,
}

#[derive(Component)]
struct EquipmentSlotIcon {
    equip_slot: i32,
}

#[derive(Component)]
struct EquipmentSlotLabel {
    equip_slot: i32,
}

pub struct EquipmentUiPlugin;

impl Plugin for EquipmentUiPlugin {
    fn build(&self, app: &mut App) {
        app.init_resource::<EquipmentUiState>();
        app.add_systems(OnEnter(GamePhase::Playing), spawn_equipment_panel);
        app.add_systems(
            Update,
            (
                toggle_equipment_panel,
                refresh_equipment_slots,
                click_unequip,
            )
                .run_if(in_state(GamePhase::Playing)),
        );
    }
}

fn spawn_equipment_panel(mut commands: Commands) {
    commands
        .spawn((
            Node {
                position_type: PositionType::Absolute,
                top: Val::Px(80.0),
                right: Val::Px(16.0),
                width: Val::Px(PANEL_WIDTH),
                padding: UiRect::all(Val::Px(8.0)),
                flex_direction: FlexDirection::Column,
                row_gap: Val::Px(6.0),
                border_radius: BorderRadius::all(Val::Px(4.0)),
                ..default()
            },
            BackgroundColor(ROOT_PANEL_BG),
            Visibility::Hidden,
            GlobalZIndex(70),
            DespawnOnExit(GamePhase::Playing),
            EquipmentRoot,
        ))
        .with_children(|panel| {
            panel.spawn((
                Text::new("Equipment (V to toggle)"),
                TextFont {
                    font_size: 11.0,
                    ..default()
                },
                TextColor(GOLD_TEXT),
                Node {
                    align_self: AlignSelf::Center,
                    ..default()
                },
            ));
            panel
                .spawn(Node {
                    display: Display::Grid,
                    grid_template_columns: vec![GridTrack::px(SLOT_SIZE); GRID_COLS],
                    column_gap: Val::Px(4.0),
                    row_gap: Val::Px(4.0),
                    ..default()
                })
                .with_children(|grid| {
                    for (slot, label) in EQUIP_SLOTS {
                        grid.spawn((
                            Node {
                                width: Val::Px(SLOT_SIZE),
                                height: Val::Px(SLOT_SIZE),
                                flex_direction: FlexDirection::Column,
                                justify_content: JustifyContent::Center,
                                align_items: AlignItems::Center,
                                border_radius: BorderRadius::all(Val::Px(2.0)),
                                ..default()
                            },
                            BackgroundColor(SLOT_BG),
                            Interaction::default(),
                            EquipmentSlot { equip_slot: *slot },
                        ))
                        .with_children(|slot_node| {
                            slot_node.spawn((
                                Text::new(""),
                                TextFont {
                                    font_size: 16.0,
                                    ..default()
                                },
                                TextColor(ui_color::TEXT_PRIMARY),
                                EquipmentSlotIcon { equip_slot: *slot },
                            ));
                            slot_node.spawn((
                                Text::new(*label),
                                TextFont {
                                    font_size: 8.0,
                                    ..default()
                                },
                                TextColor(ui_color::TEXT_SECONDARY),
                                EquipmentSlotLabel { equip_slot: *slot },
                            ));
                        });
                    }
                });
        });
}

fn toggle_equipment_panel(
    keys: Res<ButtonInput<KeyCode>>,
    mut state: ResMut<EquipmentUiState>,
    mut overlay: ResMut<UiOverlay>,
    mut q: Query<&mut Visibility, With<EquipmentRoot>>,
) {
    if !keys.just_pressed(KeyCode::KeyV) {
        return;
    }
    if !state.open && overlay.is_open() && *overlay != UiOverlay::Equipment {
        return;
    }
    state.open = !state.open;
    *overlay = if state.open {
        UiOverlay::Equipment
    } else {
        UiOverlay::None
    };
    for mut vis in &mut q {
        *vis = if state.open {
            Visibility::Visible
        } else {
            Visibility::Hidden
        };
    }
}

fn refresh_equipment_slots(
    state: Res<EquipmentUiState>,
    equipment: Res<super::net::LocalPlayerEquipment>,
    mut icon_q: Query<(&EquipmentSlotIcon, &mut Text)>,
) {
    if !state.open || (!equipment.is_changed() && !state.is_changed()) {
        return;
    }
    for (slot, mut txt) in &mut icon_q {
        let glyph = equipment
            .slots
            .get(&slot.equip_slot)
            .and_then(|item_ref| {
                let kind = ItemKind::from_ref(item_ref);
                kind.item().and_then(|i| i.emoji.clone())
            })
            .unwrap_or_default();
        **txt = glyph;
    }
}

fn click_unequip(
    state: Res<EquipmentUiState>,
    equipment: Res<super::net::LocalPlayerEquipment>,
    mut writer: MessageWriter<UnequipRequestEvent>,
    q: Query<(&Interaction, &EquipmentSlot), Changed<Interaction>>,
) {
    if !state.open {
        return;
    }
    for (interaction, slot) in &q {
        if *interaction != Interaction::Pressed {
            continue;
        }
        if !equipment.slots.contains_key(&slot.equip_slot) {
            continue;
        }
        writer.write(UnequipRequestEvent {
            equip_slot: slot.equip_slot,
        });
    }
}
