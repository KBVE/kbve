//! Quickbar — 9 slots mirroring inventory slots 0..9 so 1..9 keybinds and a
//! row of icon buttons fire `UseItemRequestEvent` for the matching slot. The
//! server validates that the item is consumable and applies UseEffects.

use bevy::prelude::*;
use bevy_inventory::Inventory;

use super::inventory::ItemKind;
use super::net::UseItemRequestEvent;
use super::phase::GamePhase;

const SLOT_SIZE: f32 = 40.0;
const SLOT_GAP: f32 = 4.0;
const SLOT_BG: Color = Color::srgba(0.10, 0.10, 0.12, 0.90);
const GOLD_TEXT: Color = Color::srgba(0.78, 0.66, 0.20, 1.0);
const HOTBAR_SLOTS: usize = 9;

#[derive(Component)]
struct HotbarRoot;

#[derive(Component)]
struct HotbarSlotIcon {
    slot: usize,
}

#[derive(Component)]
struct HotbarSlotQty {
    slot: usize,
}

#[derive(Component)]
struct HotbarSlotKey {
    slot: usize,
}

pub struct HotbarUiPlugin;

impl Plugin for HotbarUiPlugin {
    fn build(&self, app: &mut App) {
        app.add_systems(OnEnter(GamePhase::Playing), spawn_hotbar);
        app.add_systems(
            Update,
            (refresh_hotbar_slots, dispatch_hotbar_keys).run_if(in_state(GamePhase::Playing)),
        );
    }
}

fn spawn_hotbar(mut commands: Commands) {
    commands
        .spawn((
            Node {
                position_type: PositionType::Absolute,
                bottom: Val::Px(16.0),
                left: Val::Percent(50.0),
                margin: UiRect::left(Val::Px(
                    -((HOTBAR_SLOTS as f32 * (SLOT_SIZE + SLOT_GAP)) / 2.0),
                )),
                flex_direction: FlexDirection::Row,
                column_gap: Val::Px(SLOT_GAP),
                ..default()
            },
            GlobalZIndex(65),
            DespawnOnExit(GamePhase::Playing),
            HotbarRoot,
        ))
        .with_children(|root| {
            for i in 0..HOTBAR_SLOTS {
                root.spawn((
                    Node {
                        width: Val::Px(SLOT_SIZE),
                        height: Val::Px(SLOT_SIZE),
                        flex_direction: FlexDirection::Column,
                        justify_content: JustifyContent::Center,
                        align_items: AlignItems::Center,
                        border_radius: BorderRadius::all(Val::Px(3.0)),
                        ..default()
                    },
                    BackgroundColor(SLOT_BG),
                ))
                .with_children(|slot| {
                    slot.spawn((
                        Text::new(""),
                        TextFont {
                            font_size: 18.0,
                            ..default()
                        },
                        HotbarSlotIcon { slot: i },
                    ));
                    slot.spawn((
                        Text::new(format!("{}", i + 1)),
                        TextFont {
                            font_size: 8.0,
                            ..default()
                        },
                        TextColor(GOLD_TEXT),
                        Node {
                            position_type: PositionType::Absolute,
                            top: Val::Px(2.0),
                            left: Val::Px(3.0),
                            ..default()
                        },
                        HotbarSlotKey { slot: i },
                    ));
                    slot.spawn((
                        Text::new(""),
                        TextFont {
                            font_size: 9.0,
                            ..default()
                        },
                        TextColor(GOLD_TEXT),
                        Node {
                            position_type: PositionType::Absolute,
                            bottom: Val::Px(2.0),
                            right: Val::Px(3.0),
                            ..default()
                        },
                        HotbarSlotQty { slot: i },
                    ));
                });
            }
        });
}

fn refresh_hotbar_slots(
    inventory: Res<Inventory<ItemKind>>,
    mut icon_q: Query<
        (&HotbarSlotIcon, &mut Text),
        (Without<HotbarSlotQty>, Without<HotbarSlotKey>),
    >,
    mut qty_q: Query<
        (&HotbarSlotQty, &mut Text),
        (Without<HotbarSlotIcon>, Without<HotbarSlotKey>),
    >,
) {
    if !inventory.is_changed() {
        return;
    }
    for (slot, mut txt) in &mut icon_q {
        let glyph = inventory
            .items
            .get(slot.slot)
            .and_then(|s| s.kind.item().and_then(|i| i.emoji.clone()))
            .unwrap_or_default();
        **txt = glyph;
    }
    for (slot, mut txt) in &mut qty_q {
        let qty = inventory
            .items
            .get(slot.slot)
            .map(|s| s.quantity)
            .unwrap_or(0);
        **txt = if qty > 1 {
            format!("{qty}")
        } else {
            String::new()
        };
    }
}

fn dispatch_hotbar_keys(
    keys: Res<ButtonInput<KeyCode>>,
    inventory: Res<Inventory<ItemKind>>,
    mut writer: MessageWriter<UseItemRequestEvent>,
) {
    let digits = [
        KeyCode::Digit1,
        KeyCode::Digit2,
        KeyCode::Digit3,
        KeyCode::Digit4,
        KeyCode::Digit5,
        KeyCode::Digit6,
        KeyCode::Digit7,
        KeyCode::Digit8,
        KeyCode::Digit9,
    ];
    for (idx, key) in digits.iter().enumerate() {
        if !keys.just_pressed(*key) {
            continue;
        }
        // Only fire when the slot holds a consumable — server still validates,
        // but pre-filtering keeps the network quiet for non-usable items.
        let Some(stack) = inventory.items.get(idx) else {
            continue;
        };
        let Some(item) = stack.kind.item() else {
            continue;
        };
        if !item.consumable.unwrap_or(false) {
            continue;
        }
        writer.write(UseItemRequestEvent {
            inventory_slot: idx as u32,
        });
    }
}
