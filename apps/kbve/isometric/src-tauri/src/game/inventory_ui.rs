//! Native Bevy UI for the inventory bag — replaces React Inventory.tsx.
//!
//! Reads `Inventory<ItemKind>` resource directly (no JSON polling).
//! Toggled via KeyCode::KeyI. Displays a 4x4 grid with item icons
//! and quantities. Clicking a populated slot opens a context menu with
//! Use / Equip / Inspect actions keyed off the item's proto flags.

use bevy::prelude::*;

use super::inventory::ItemKind;
use super::net::{EquipRequestEvent, UseItemRequestEvent};
use super::pause_menu::UiOverlay;
use super::phase::GamePhase;
use super::ui_color;

const GRID_COLS: usize = 4;
const GRID_ROWS: usize = 4;
const TOTAL_SLOTS: usize = GRID_COLS * GRID_ROWS;
const SLOT_SIZE: f32 = 44.0;
const SLOT_GAP: f32 = 2.0;

const INVENTORY_BG: Color = Color::srgba(0.10, 0.08, 0.05, 0.95);
const SLOT_BG: Color = Color::srgba(0.15, 0.10, 0.04, 1.0);
const SLOT_BORDER: Color = Color::srgba(0.24, 0.17, 0.08, 1.0);
const GOLD_TEXT: Color = Color::srgba(0.78, 0.66, 0.20, 1.0);

#[derive(Component)]
struct InventoryRoot;

#[derive(Component)]
struct InventoryToggleBtn;

#[derive(Component)]
struct InventoryGrid;

#[derive(Component)]
struct InventorySlot {
    index: usize,
}

#[derive(Component)]
struct SlotIcon {
    index: usize,
}

#[derive(Component)]
struct SlotName {
    index: usize,
}

#[derive(Component)]
struct SlotQty {
    index: usize,
}

#[derive(Component)]
struct ToggleBtnLabel;

/// Resource tracking open/close state.
#[derive(Resource, Default)]
struct InventoryUiState {
    open: bool,
    /// Currently selected slot index (for context menu).
    selected_slot: Option<usize>,
}

#[derive(Component)]
struct SlotContextMenu;

#[derive(Component)]
struct InspectModal;

#[derive(Component, Clone, Copy)]
enum SlotAction {
    Use { slot: u32 },
    Equip { slot: u32 },
    Inspect { slot: u32 },
    Close,
    CloseInspect,
}

pub struct InventoryUiPlugin;

impl Plugin for InventoryUiPlugin {
    fn build(&self, app: &mut App) {
        app.init_resource::<InventoryUiState>();
        app.add_systems(OnEnter(GamePhase::Playing), spawn_inventory_ui);
        app.add_systems(
            Update,
            (
                toggle_inventory,
                update_inventory_slots,
                handle_slot_clicks,
                handle_slot_actions,
                close_menu_on_inventory_close,
            )
                .run_if(in_state(GamePhase::Playing)),
        );
    }
}

/// Map display name to emoji icon.
fn slot_icon(stack: &bevy_inventory::ItemStack<ItemKind>) -> String {
    stack
        .kind
        .item()
        .and_then(|i| i.emoji.as_deref())
        .unwrap_or("?")
        .to_string()
}

fn slot_short_name(stack: &bevy_inventory::ItemStack<ItemKind>) -> String {
    let name = stack.kind.item().map(|i| i.name.as_str()).unwrap_or("???");
    name.chars().take(3).collect()
}

fn spawn_inventory_ui(mut commands: Commands) {
    commands
        .spawn((
            Node {
                position_type: PositionType::Absolute,
                bottom: Val::Px(160.0),
                right: Val::Px(16.0),
                flex_direction: FlexDirection::Column,
                align_items: AlignItems::FlexEnd,
                row_gap: Val::Px(4.0),
                ..default()
            },
            GlobalZIndex(70),
            DespawnOnExit(GamePhase::Playing),
            InventoryRoot,
        ))
        .with_children(|root| {
            root.spawn((
                Node {
                    width: Val::Px(50.0),
                    height: Val::Px(24.0),
                    justify_content: JustifyContent::Center,
                    align_items: AlignItems::Center,
                    border_radius: BorderRadius::all(Val::Px(3.0)),
                    ..default()
                },
                BackgroundColor(ui_color::PANEL),
                Interaction::default(),
                bevy::ui::FocusPolicy::Block,
                InventoryToggleBtn,
            ))
            .with_child((
                Text::new("Bag"),
                TextFont {
                    font_size: 11.0,
                    ..default()
                },
                TextColor(GOLD_TEXT),
                bevy::ui::FocusPolicy::Pass,
                bevy::picking::Pickable::IGNORE,
                ToggleBtnLabel,
            ));

            root.spawn((
                Node {
                    flex_direction: FlexDirection::Column,
                    padding: UiRect::all(Val::Px(8.0)),
                    row_gap: Val::Px(4.0),
                    border_radius: BorderRadius::all(Val::Px(4.0)),
                    ..default()
                },
                BackgroundColor(INVENTORY_BG),
                Visibility::Hidden,
                InventoryGrid,
            ))
            .with_children(|grid_container| {
                grid_container.spawn((
                    Text::new("Inventory"),
                    TextFont {
                        font_size: 11.0,
                        ..default()
                    },
                    TextColor(GOLD_TEXT),
                    Node {
                        margin: UiRect::bottom(Val::Px(4.0)),
                        align_self: AlignSelf::Center,
                        ..default()
                    },
                ));

                grid_container
                    .spawn(Node {
                        display: Display::Grid,
                        grid_template_columns: vec![GridTrack::px(SLOT_SIZE); GRID_COLS],
                        grid_template_rows: vec![GridTrack::px(SLOT_SIZE); GRID_ROWS],
                        row_gap: Val::Px(SLOT_GAP),
                        column_gap: Val::Px(SLOT_GAP),
                        ..default()
                    })
                    .with_children(|grid| {
                        for i in 0..TOTAL_SLOTS {
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
                                bevy::ui::FocusPolicy::Block,
                                InventorySlot { index: i },
                            ))
                            .with_children(|slot| {
                                slot.spawn((
                                    Text::new(""),
                                    TextFont {
                                        font_size: 16.0,
                                        ..default()
                                    },
                                    TextColor(ui_color::TEXT_PRIMARY),
                                    bevy::ui::FocusPolicy::Pass,
                                    bevy::picking::Pickable::IGNORE,
                                    SlotIcon { index: i },
                                ));
                                slot.spawn((
                                    Text::new(""),
                                    TextFont {
                                        font_size: 8.0,
                                        ..default()
                                    },
                                    TextColor(ui_color::TEXT_SECONDARY),
                                    bevy::ui::FocusPolicy::Pass,
                                    bevy::picking::Pickable::IGNORE,
                                    SlotName { index: i },
                                ));
                                slot.spawn((
                                    Text::new(""),
                                    TextFont {
                                        font_size: 8.0,
                                        ..default()
                                    },
                                    TextColor(GOLD_TEXT),
                                    bevy::ui::FocusPolicy::Pass,
                                    bevy::picking::Pickable::IGNORE,
                                    SlotQty { index: i },
                                ));
                            });
                        }
                    });
            });
        });
}

fn toggle_inventory(
    keys: Res<ButtonInput<KeyCode>>,
    mut state: ResMut<InventoryUiState>,
    mut overlay: ResMut<UiOverlay>,
    mut grid_q: Query<&mut Visibility, With<InventoryGrid>>,
    mut label_q: Query<&mut Text, With<ToggleBtnLabel>>,
    btn_q: Query<&Interaction, (Changed<Interaction>, With<InventoryToggleBtn>)>,
) {
    let mut toggle = false;

    if keys.just_pressed(KeyCode::KeyI) {
        toggle = true;
    }

    for interaction in &btn_q {
        if *interaction == Interaction::Pressed {
            toggle = true;
        }
    }

    if !toggle {
        return;
    }

    if !state.open && overlay.is_open() && *overlay != UiOverlay::Inventory {
        return;
    }

    state.open = !state.open;
    *overlay = if state.open {
        UiOverlay::Inventory
    } else {
        UiOverlay::None
    };
    for mut vis in &mut grid_q {
        *vis = if state.open {
            Visibility::Visible
        } else {
            Visibility::Hidden
        };
    }
    for mut txt in &mut label_q {
        **txt = if state.open { "Close" } else { "Bag" }.to_string();
    }
}

fn handle_slot_clicks(
    mut commands: Commands,
    mut state: ResMut<InventoryUiState>,
    inventory: Res<bevy_inventory::Inventory<ItemKind>>,
    existing_menu: Query<Entity, With<SlotContextMenu>>,
    slot_q: Query<(&Interaction, &InventorySlot), Changed<Interaction>>,
) {
    for (interaction, slot) in &slot_q {
        if *interaction != Interaction::Pressed {
            continue;
        }
        let Some(stack) = inventory.items.get(slot.index) else {
            continue;
        };
        if stack.kind.item().is_none() {
            continue;
        }
        // Toggle: clicking the same slot a second time closes the menu.
        if state.selected_slot == Some(slot.index) {
            state.selected_slot = None;
            for e in &existing_menu {
                commands.entity(e).despawn();
            }
            continue;
        }
        state.selected_slot = Some(slot.index);
        for e in &existing_menu {
            commands.entity(e).despawn();
        }
        spawn_slot_context_menu(&mut commands, slot.index, &inventory);
    }
}

fn spawn_slot_context_menu(
    commands: &mut Commands,
    slot_index: usize,
    inventory: &bevy_inventory::Inventory<ItemKind>,
) {
    let stack = match inventory.items.get(slot_index) {
        Some(s) => s,
        None => return,
    };
    let item = match stack.kind.item() {
        Some(i) => i,
        None => return,
    };
    let is_consumable = item.consumable.unwrap_or(false);
    let is_equipment = item.equipment.is_some();
    let item_name = item.name.clone();
    let slot32 = slot_index as u32;

    commands
        .spawn((
            Node {
                position_type: PositionType::Absolute,
                bottom: Val::Px(160.0),
                right: Val::Px(220.0),
                flex_direction: FlexDirection::Column,
                padding: UiRect::all(Val::Px(8.0)),
                row_gap: Val::Px(4.0),
                border_radius: BorderRadius::all(Val::Px(4.0)),
                min_width: Val::Px(120.0),
                ..default()
            },
            BackgroundColor(ui_color::PANEL),
            GlobalZIndex(120),
            bevy::ui::FocusPolicy::Block,
            SlotContextMenu,
        ))
        .with_children(|menu| {
            menu.spawn((
                Text::new(item_name),
                TextFont {
                    font_size: 12.0,
                    ..default()
                },
                TextColor(GOLD_TEXT),
                bevy::ui::FocusPolicy::Pass,
                bevy::picking::Pickable::IGNORE,
            ));

            if is_consumable {
                spawn_action_button(menu, "Use", SlotAction::Use { slot: slot32 });
            }
            if is_equipment {
                spawn_action_button(menu, "Equip", SlotAction::Equip { slot: slot32 });
            }
            spawn_action_button(menu, "Inspect", SlotAction::Inspect { slot: slot32 });
            spawn_action_button(menu, "Close", SlotAction::Close);
        });
}

fn spawn_action_button(parent: &mut ChildSpawnerCommands, label: &str, action: SlotAction) {
    parent
        .spawn((
            Node {
                width: Val::Percent(100.0),
                height: Val::Px(24.0),
                justify_content: JustifyContent::Center,
                align_items: AlignItems::Center,
                border_radius: BorderRadius::all(Val::Px(3.0)),
                ..default()
            },
            BackgroundColor(SLOT_BG),
            Interaction::default(),
            bevy::ui::FocusPolicy::Block,
            action,
        ))
        .with_child((
            Text::new(label.to_string()),
            TextFont {
                font_size: 11.0,
                ..default()
            },
            TextColor(ui_color::TEXT_PRIMARY),
            bevy::ui::FocusPolicy::Pass,
            bevy::picking::Pickable::IGNORE,
        ));
}

fn handle_slot_actions(
    mut commands: Commands,
    mut state: ResMut<InventoryUiState>,
    inventory: Res<bevy_inventory::Inventory<ItemKind>>,
    mut use_writer: MessageWriter<UseItemRequestEvent>,
    mut equip_writer: MessageWriter<EquipRequestEvent>,
    existing_menu: Query<Entity, With<SlotContextMenu>>,
    existing_inspect: Query<Entity, With<InspectModal>>,
    btn_q: Query<(&Interaction, &SlotAction), Changed<Interaction>>,
) {
    for (interaction, action) in &btn_q {
        if *interaction != Interaction::Pressed {
            continue;
        }
        match *action {
            SlotAction::Use { slot } => {
                use_writer.write(UseItemRequestEvent {
                    inventory_slot: slot,
                });
                state.selected_slot = None;
                for e in &existing_menu {
                    commands.entity(e).despawn();
                }
            }
            SlotAction::Equip { slot } => {
                equip_writer.write(EquipRequestEvent {
                    inventory_slot: slot,
                });
                state.selected_slot = None;
                for e in &existing_menu {
                    commands.entity(e).despawn();
                }
            }
            SlotAction::Inspect { slot } => {
                for e in &existing_inspect {
                    commands.entity(e).despawn();
                }
                spawn_inspect_modal(&mut commands, slot as usize, &inventory);
            }
            SlotAction::Close => {
                state.selected_slot = None;
                for e in &existing_menu {
                    commands.entity(e).despawn();
                }
            }
            SlotAction::CloseInspect => {
                for e in &existing_inspect {
                    commands.entity(e).despawn();
                }
            }
        }
    }
}

fn spawn_inspect_modal(
    commands: &mut Commands,
    slot_index: usize,
    inventory: &bevy_inventory::Inventory<ItemKind>,
) {
    let stack = match inventory.items.get(slot_index) {
        Some(s) => s,
        None => return,
    };
    let item = match stack.kind.item() {
        Some(i) => i,
        None => return,
    };
    let name = item.name.clone();
    let description = item.description.clone().unwrap_or_default();
    let lore = item.lore.clone().unwrap_or_default();
    let emoji = item.emoji.clone().unwrap_or_default();

    commands
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
            BackgroundColor(Color::srgba(0.0, 0.0, 0.0, 0.6)),
            GlobalZIndex(140),
            InspectModal,
        ))
        .with_children(|root| {
            root.spawn((
                Node {
                    width: Val::Px(320.0),
                    flex_direction: FlexDirection::Column,
                    padding: UiRect::all(Val::Px(14.0)),
                    row_gap: Val::Px(8.0),
                    border_radius: BorderRadius::all(Val::Px(6.0)),
                    ..default()
                },
                BackgroundColor(ui_color::PANEL),
                bevy::ui::FocusPolicy::Block,
            ))
            .with_children(|panel| {
                panel
                    .spawn(Node {
                        flex_direction: FlexDirection::Row,
                        column_gap: Val::Px(8.0),
                        align_items: AlignItems::Center,
                        ..default()
                    })
                    .with_children(|header| {
                        if !emoji.is_empty() {
                            header.spawn((
                                Text::new(emoji),
                                TextFont {
                                    font_size: 22.0,
                                    ..default()
                                },
                                TextColor(ui_color::TEXT_PRIMARY),
                                bevy::ui::FocusPolicy::Pass,
                                bevy::picking::Pickable::IGNORE,
                            ));
                        }
                        header.spawn((
                            Text::new(name),
                            TextFont {
                                font_size: 16.0,
                                ..default()
                            },
                            TextColor(GOLD_TEXT),
                            bevy::ui::FocusPolicy::Pass,
                            bevy::picking::Pickable::IGNORE,
                        ));
                    });
                if !description.is_empty() {
                    panel.spawn((
                        Text::new(description),
                        TextFont {
                            font_size: 12.0,
                            ..default()
                        },
                        TextColor(ui_color::TEXT_PRIMARY),
                        bevy::ui::FocusPolicy::Pass,
                        bevy::picking::Pickable::IGNORE,
                    ));
                }
                if !lore.is_empty() {
                    panel.spawn((
                        Text::new(lore),
                        TextFont {
                            font_size: 11.0,
                            ..default()
                        },
                        TextColor(ui_color::TEXT_SECONDARY),
                        bevy::ui::FocusPolicy::Pass,
                        bevy::picking::Pickable::IGNORE,
                    ));
                }
                spawn_action_button(panel, "Close", SlotAction::CloseInspect);
            });
        });
}

fn close_menu_on_inventory_close(
    mut commands: Commands,
    mut state: ResMut<InventoryUiState>,
    existing_menu: Query<Entity, With<SlotContextMenu>>,
    existing_inspect: Query<Entity, With<InspectModal>>,
) {
    if state.open {
        return;
    }
    if state.selected_slot.is_some() {
        state.selected_slot = None;
    }
    for e in &existing_menu {
        commands.entity(e).despawn();
    }
    for e in &existing_inspect {
        commands.entity(e).despawn();
    }
}

fn update_inventory_slots(
    state: Res<InventoryUiState>,
    inventory: Res<bevy_inventory::Inventory<ItemKind>>,
    mut icon_q: Query<(&SlotIcon, &mut Text), (Without<SlotName>, Without<SlotQty>)>,
    mut name_q: Query<(&SlotName, &mut Text), (Without<SlotIcon>, Without<SlotQty>)>,
    mut qty_q: Query<(&SlotQty, &mut Text), (Without<SlotIcon>, Without<SlotName>)>,
) {
    if !state.open || (!inventory.is_changed() && !state.is_changed()) {
        return;
    }

    for (slot, mut txt) in &mut icon_q {
        if let Some(stack) = inventory.items.get(slot.index) {
            **txt = slot_icon(stack);
        } else {
            **txt = String::new();
        }
    }

    for (slot, mut txt) in &mut name_q {
        if let Some(stack) = inventory.items.get(slot.index) {
            **txt = slot_short_name(stack);
        } else {
            **txt = String::new();
        }
    }

    for (slot, mut txt) in &mut qty_q {
        if let Some(stack) = inventory.items.get(slot.index) {
            if stack.quantity > 1 {
                **txt = format!("{}", stack.quantity);
            } else {
                **txt = String::new();
            }
        } else {
            **txt = String::new();
        }
    }
}
