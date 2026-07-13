//! Crafting recipe browser — toggled with `C`. Lists every itemdb entry that
//! carries at least one `CraftingRecipe`. The first recipe is shown with its
//! ingredient list; pressing the Craft button fires a `CraftRequestEvent` so
//! the server can validate and produce.

use bevy::prelude::*;
use bevy_items::inventory_adapter::get_item_db;

use super::inventory::ItemKind;
use super::net::CraftRequestEvent;
use super::pause_menu::UiOverlay;
use super::phase::GamePhase;
use super::ui_color;

const PANEL_BG: Color = Color::srgba(0.08, 0.08, 0.10, 0.96);
const ROW_BG: Color = Color::srgba(0.14, 0.14, 0.18, 1.0);
const ROW_GAP: f32 = 4.0;
const GOLD_TEXT: Color = Color::srgba(0.78, 0.66, 0.20, 1.0);

#[derive(Resource, Default)]
struct CraftingUiState {
    open: bool,
}

#[derive(Component)]
struct CraftingRoot;

#[derive(Component)]
struct CraftingList;

#[derive(Component)]
struct CraftButton {
    item_ref: String,
    recipe_index: u32,
}

pub struct CraftingUiPlugin;

impl Plugin for CraftingUiPlugin {
    fn build(&self, app: &mut App) {
        app.init_resource::<CraftingUiState>();
        app.add_systems(OnEnter(GamePhase::Playing), spawn_crafting_panel);
        app.add_systems(
            Update,
            (
                toggle_crafting_panel,
                populate_recipes,
                dispatch_craft_clicks,
            )
                .run_if(in_state(GamePhase::Playing)),
        );
    }
}

fn spawn_crafting_panel(mut commands: Commands) {
    commands
        .spawn((
            Node {
                position_type: PositionType::Absolute,
                top: Val::Px(80.0),
                left: Val::Px(16.0),
                width: Val::Px(360.0),
                max_height: Val::Px(480.0),
                padding: UiRect::all(Val::Px(8.0)),
                flex_direction: FlexDirection::Column,
                row_gap: Val::Px(6.0),
                overflow: Overflow::scroll_y(),
                ..default()
            },
            BackgroundColor(PANEL_BG),
            Visibility::Hidden,
            GlobalZIndex(70),
            DespawnOnExit(GamePhase::Playing),
            CraftingRoot,
        ))
        .with_children(|panel| {
            panel.spawn((
                Text::new("Crafting (C to toggle)"),
                TextFont {
                    font_size: bevy::text::FontSize::Px(11.0),
                    ..default()
                },
                TextColor(GOLD_TEXT),
                Node {
                    align_self: AlignSelf::Center,
                    margin: UiRect::bottom(Val::Px(4.0)),
                    ..default()
                },
            ));
            panel.spawn((
                Node {
                    flex_direction: FlexDirection::Column,
                    row_gap: Val::Px(ROW_GAP),
                    ..default()
                },
                CraftingList,
            ));
        });
}

fn toggle_crafting_panel(
    keys: Res<ButtonInput<KeyCode>>,
    mut state: ResMut<CraftingUiState>,
    mut overlay: ResMut<UiOverlay>,
    mut q: Query<&mut Visibility, With<CraftingRoot>>,
) {
    if !keys.just_pressed(KeyCode::KeyC) {
        return;
    }
    if !state.open && overlay.is_open() && *overlay != UiOverlay::Crafting {
        return;
    }
    state.open = !state.open;
    *overlay = if state.open {
        UiOverlay::Crafting
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

fn populate_recipes(
    state: Res<CraftingUiState>,
    mut commands: Commands,
    mut list_q: Query<(Entity, Option<&Children>), With<CraftingList>>,
    mut populated: Local<bool>,
) {
    if !state.open || *populated {
        return;
    }
    let Ok((list_entity, _children)) = list_q.single_mut() else {
        return;
    };
    let Some(db) = get_item_db() else {
        return;
    };

    commands.entity(list_entity).despawn_related::<Children>();
    commands.entity(list_entity).with_children(|list| {
        let mut entries: Vec<(bevy_items::ProtoItemId, &bevy_items::Item)> = db
            .iter()
            .filter(|(_, item)| !item.recipes.is_empty())
            .collect();
        entries.sort_by(|a, b| a.1.name.cmp(&b.1.name));

        for (_, item) in entries {
            let Some(recipe) = item.recipes.first() else {
                continue;
            };
            let emoji = item.emoji.clone().unwrap_or_else(|| "?".into());
            let ingredients_text = recipe
                .ingredients
                .iter()
                .map(|ing| {
                    let name = ItemKind::from_ref(&ing.item_ref)
                        .item()
                        .map(|i| i.name.clone())
                        .unwrap_or_else(|| ing.item_ref.clone());
                    format!("{}x {name}", ing.amount)
                })
                .collect::<Vec<_>>()
                .join(", ");
            let skill_label = match (&recipe.skill, recipe.skill_level) {
                (Some(skill), Some(level)) => format!(" — {skill} lvl {level}"),
                _ => String::new(),
            };
            let facility_label = recipe
                .facility
                .as_deref()
                .map(|f| format!(" @ {f}"))
                .unwrap_or_default();

            list.spawn((
                Node {
                    flex_direction: FlexDirection::Row,
                    align_items: AlignItems::Center,
                    padding: UiRect::all(Val::Px(6.0)),
                    column_gap: Val::Px(6.0),
                    border_radius: BorderRadius::all(Val::Px(3.0)),
                    ..default()
                },
                BackgroundColor(ROW_BG),
            ))
            .with_children(|row| {
                row.spawn((
                    Text::new(emoji),
                    TextFont {
                        font_size: bevy::text::FontSize::Px(18.0),
                        ..default()
                    },
                ));
                row.spawn((Node {
                    flex_direction: FlexDirection::Column,
                    flex_grow: 1.0,
                    ..default()
                },))
                    .with_children(|col| {
                        col.spawn((
                            Text::new(item.name.clone()),
                            TextFont {
                                font_size: bevy::text::FontSize::Px(11.0),
                                ..default()
                            },
                            TextColor(ui_color::TEXT_PRIMARY),
                        ));
                        col.spawn((
                            Text::new(format!("{ingredients_text}{skill_label}{facility_label}")),
                            TextFont {
                                font_size: bevy::text::FontSize::Px(9.0),
                                ..default()
                            },
                            TextColor(ui_color::TEXT_SECONDARY),
                        ));
                    });
                row.spawn((
                    Node {
                        padding: UiRect::axes(Val::Px(8.0), Val::Px(4.0)),
                        border_radius: BorderRadius::all(Val::Px(2.0)),
                        ..default()
                    },
                    BackgroundColor(ui_color::PANEL),
                    Interaction::default(),
                    bevy::ui::FocusPolicy::Block,
                    CraftButton {
                        item_ref: item.r#ref.clone(),
                        recipe_index: 0,
                    },
                ))
                .with_child((
                    Text::new("Craft"),
                    TextFont {
                        font_size: bevy::text::FontSize::Px(10.0),
                        ..default()
                    },
                    TextColor(GOLD_TEXT),
                    bevy::ui::FocusPolicy::Pass,
                    bevy::picking::Pickable::IGNORE,
                ));
            });
        }
    });
    *populated = true;
}

fn dispatch_craft_clicks(
    state: Res<CraftingUiState>,
    mut writer: MessageWriter<CraftRequestEvent>,
    q: Query<(&Interaction, &CraftButton), Changed<Interaction>>,
) {
    if !state.open {
        return;
    }
    for (interaction, btn) in &q {
        if *interaction != Interaction::Pressed {
            continue;
        }
        writer.write(CraftRequestEvent {
            output_item_ref: btn.item_ref.clone(),
            recipe_index: btn.recipe_index,
            batches: 1,
        });
    }
}
