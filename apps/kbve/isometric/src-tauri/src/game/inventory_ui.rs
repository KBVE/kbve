//! Native Bevy UI for the inventory bag — replaces React Inventory.tsx.
//!
//! Reads `Inventory<ItemKind>` resource directly (no JSON polling).
//! Toggled via KeyCode::KeyI. Displays a 4x4 grid with item icons
//! and quantities.

use bevy::prelude::*;
use bevy_inventory::ItemKind as ItemKindTrait;

use super::inventory::ItemKind;
use super::phase::GamePhase;
use super::ui_color;

const GRID_COLS: usize = 4;
const GRID_ROWS: usize = 4;
const TOTAL_SLOTS: usize = GRID_COLS * GRID_ROWS;
const SLOT_SIZE: f32 = 44.0;
const SLOT_GAP: f32 = 2.0;

// ---------------------------------------------------------------------------
// Colors
// ---------------------------------------------------------------------------

const INVENTORY_BG: Color = Color::srgba(0.10, 0.08, 0.05, 0.95);
const SLOT_BG: Color = Color::srgba(0.15, 0.10, 0.04, 1.0);
const SLOT_BORDER: Color = Color::srgba(0.24, 0.17, 0.08, 1.0);
const GOLD_TEXT: Color = Color::srgba(0.78, 0.66, 0.20, 1.0);

// ---------------------------------------------------------------------------
// Components
// ---------------------------------------------------------------------------

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
}

// ---------------------------------------------------------------------------
// Plugin
// ---------------------------------------------------------------------------

pub struct InventoryUiPlugin;

impl Plugin for InventoryUiPlugin {
    fn build(&self, app: &mut App) {
        app.init_resource::<InventoryUiState>();
        app.add_systems(OnEnter(GamePhase::Playing), spawn_inventory_ui);
        app.add_systems(
            Update,
            (toggle_inventory, update_inventory_slots).run_if(in_state(GamePhase::Playing)),
        );
    }
}

// ---------------------------------------------------------------------------
// Item display helpers
// ---------------------------------------------------------------------------

/// Map display name to emoji icon.
fn item_icon(display_name: &str) -> &'static str {
    match display_name {
        "Log" => "\u{1fab5}",
        "Stone" | "Mossy Stone" => "\u{1faa8}",
        "Copper Ore" => "\u{1f7e4}",
        "Iron Ore" => "\u{2b1b}",
        "Crystal Ore" => "\u{1f7e3}",
        "Tulip" => "\u{1f337}",
        "Daisy" => "\u{1f33c}",
        "Lavender" => "\u{1f49c}",
        "Bellflower" => "\u{1f514}",
        "Wildflower" | "Sunflower" => "\u{1f33b}",
        "Rose" => "\u{1f339}",
        "Cornflower" => "\u{1f499}",
        "Allium" => "\u{1f7e3}",
        "Blue Orchid" => "\u{1f48e}",
        "Porcini" | "Chanterelle" | "Fly Agaric" => "\u{1f344}",
        _ => "?",
    }
}

/// Abbreviate display name for slot label.
fn item_short_name(display_name: &str) -> &'static str {
    match display_name {
        "Log" => "Log",
        "Stone" => "Stn",
        "Mossy Stone" => "Mss",
        "Copper Ore" => "Cu",
        "Iron Ore" => "Fe",
        "Crystal Ore" => "Cry",
        "Tulip" => "Tlp",
        "Daisy" => "Dsy",
        "Lavender" => "Lvn",
        "Bellflower" => "Bel",
        "Wildflower" => "Wld",
        "Sunflower" => "Sun",
        "Rose" => "Rse",
        "Cornflower" => "Crn",
        "Allium" => "All",
        "Blue Orchid" => "Orc",
        "Porcini" => "Por",
        "Chanterelle" => "Chn",
        "Fly Agaric" => "Fly",
        _ => "???",
    }
}

// ---------------------------------------------------------------------------
// Spawn UI
// ---------------------------------------------------------------------------

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
            // Toggle button
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
                InventoryToggleBtn,
            ))
            .with_child((
                Text::new("Bag"),
                TextFont {
                    font_size: 11.0,
                    ..default()
                },
                TextColor(GOLD_TEXT),
                ToggleBtnLabel,
            ));

            // Grid container (hidden by default)
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
                // Title
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

                // 4x4 grid
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
                                InventorySlot { index: i },
                            ))
                            .with_children(|slot| {
                                // Icon
                                slot.spawn((
                                    Text::new(""),
                                    TextFont {
                                        font_size: 16.0,
                                        ..default()
                                    },
                                    TextColor(ui_color::TEXT_PRIMARY),
                                    SlotIcon { index: i },
                                ));
                                // Short name
                                slot.spawn((
                                    Text::new(""),
                                    TextFont {
                                        font_size: 8.0,
                                        ..default()
                                    },
                                    TextColor(ui_color::TEXT_SECONDARY),
                                    SlotName { index: i },
                                ));
                                // Quantity
                                slot.spawn((
                                    Text::new(""),
                                    TextFont {
                                        font_size: 8.0,
                                        ..default()
                                    },
                                    TextColor(GOLD_TEXT),
                                    SlotQty { index: i },
                                ));
                            });
                        }
                    });
            });
        });
}

// ---------------------------------------------------------------------------
// Systems
// ---------------------------------------------------------------------------

fn toggle_inventory(
    keys: Res<ButtonInput<KeyCode>>,
    mut state: ResMut<InventoryUiState>,
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

    if toggle {
        state.open = !state.open;
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
}

fn update_inventory_slots(
    state: Res<InventoryUiState>,
    inventory: Res<bevy_inventory::Inventory<ItemKind>>,
    mut icon_q: Query<(&SlotIcon, &mut Text), (Without<SlotName>, Without<SlotQty>)>,
    mut name_q: Query<(&SlotName, &mut Text), (Without<SlotIcon>, Without<SlotQty>)>,
    mut qty_q: Query<(&SlotQty, &mut Text), (Without<SlotIcon>, Without<SlotName>)>,
) {
    if !state.open || !inventory.is_changed() {
        return;
    }

    for (slot, mut txt) in &mut icon_q {
        if let Some(stack) = inventory.items.get(slot.index) {
            let name = stack.kind.display_name();
            **txt = item_icon(name).to_string();
        } else {
            **txt = String::new();
        }
    }

    for (slot, mut txt) in &mut name_q {
        if let Some(stack) = inventory.items.get(slot.index) {
            let name = stack.kind.display_name();
            **txt = item_short_name(name).to_string();
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
