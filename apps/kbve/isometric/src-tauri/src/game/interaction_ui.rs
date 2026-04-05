//! Native Bevy UI for object interaction — replaces React useObjectSelection.
//!
//! When the player clicks an interactable object, a small panel appears
//! showing the object title, description, and an action button. The panel
//! auto-closes if the player walks too far away.
//!
//! This eliminates the 100ms React polling loop and reads ECS state directly.

use bevy::prelude::*;

use super::actions;
use super::phase::GamePhase;
use super::player::Player;
use super::scene_objects::InteractableKind;
use super::toast::Toast;
use super::ui_color;

/// Max XZ distance before the panel auto-closes.
const MODAL_CLOSE_DIST: f32 = 6.0;
/// Max XZ distance to perform an action.
const ACTION_DIST: f32 = 3.0;

// ---------------------------------------------------------------------------
// Components
// ---------------------------------------------------------------------------

/// Root node of the interaction panel overlay.
#[derive(Component)]
struct InteractionPanel;

/// The title text node.
#[derive(Component)]
struct InteractionTitle;

/// The description text node.
#[derive(Component)]
struct InteractionDesc;

/// The action button node.
#[derive(Component)]
struct InteractionBtn;

/// The action button label text.
#[derive(Component)]
struct InteractionBtnLabel;

/// Resource tracking the currently open interaction.
#[derive(Resource, Default)]
struct ActiveInteraction {
    open: bool,
    entity_id: u64,
    object_pos: Vec3,
    action_key: &'static str,
    title: String,
}

// ---------------------------------------------------------------------------
// Plugin
// ---------------------------------------------------------------------------

pub struct InteractionUiPlugin;

impl Plugin for InteractionUiPlugin {
    fn build(&self, app: &mut App) {
        app.init_resource::<ActiveInteraction>();
        app.add_systems(OnEnter(GamePhase::Playing), spawn_interaction_panel);
        app.add_systems(
            Update,
            (poll_selection, check_distance_close, handle_action_button)
                .run_if(in_state(GamePhase::Playing)),
        );
    }
}

// ---------------------------------------------------------------------------
// Object info lookup (matches React OBJECT_INFO / FLOWER_INFO / etc.)
// ---------------------------------------------------------------------------

struct ObjectInfo {
    title: &'static str,
    description: &'static str,
    action_label: &'static str,
    action_key: &'static str,
}

fn lookup_object_info(kind: InteractableKind, sub_kind: Option<&str>) -> ObjectInfo {
    let base = match kind {
        InteractableKind::Tree => ObjectInfo {
            title: "Tree",
            description: "A sturdy tree with rough bark.",
            action_label: "Chop Tree",
            action_key: "chop_tree",
        },
        InteractableKind::Flower => ObjectInfo {
            title: "Flower",
            description: "A beautiful flower.",
            action_label: "Collect Flower",
            action_key: "collect_flower",
        },
        InteractableKind::Rock => ObjectInfo {
            title: "Rock",
            description: "A weathered stone formation.",
            action_label: "Mine Rock",
            action_key: "mine_rock",
        },
        InteractableKind::Mushroom => ObjectInfo {
            title: "Mushroom",
            description: "A wild mushroom growing in the shade.",
            action_label: "Collect Mushroom",
            action_key: "collect_mushroom",
        },
        InteractableKind::Crate => ObjectInfo {
            title: "Wooden Crate",
            description: "A wooden crate. Might contain something.",
            action_label: "Open Crate",
            action_key: "",
        },
        InteractableKind::Crystal => ObjectInfo {
            title: "Crystal",
            description: "A glowing crystal pulsing with energy.",
            action_label: "Mine Crystal",
            action_key: "",
        },
        _ => ObjectInfo {
            title: "Object",
            description: "An interesting object.",
            action_label: "Examine",
            action_key: "",
        },
    };

    let Some(sub) = sub_kind else {
        return base;
    };

    match (kind, sub) {
        (InteractableKind::Flower, "tulip") => ObjectInfo {
            title: "Tulip",
            description: "A vibrant tulip with soft petals.",
            ..base
        },
        (InteractableKind::Flower, "daisy") => ObjectInfo {
            title: "Daisy",
            description: "A cheerful white daisy swaying gently.",
            ..base
        },
        (InteractableKind::Flower, "lavender") => ObjectInfo {
            title: "Lavender",
            description: "A fragrant lavender sprig.",
            ..base
        },
        (InteractableKind::Flower, "rose") => ObjectInfo {
            title: "Rose",
            description: "A thorny rose with velvety red petals.",
            ..base
        },
        (InteractableKind::Flower, "sunflower") => ObjectInfo {
            title: "Sunflower",
            description: "A tall sunflower turning toward the light.",
            ..base
        },
        (InteractableKind::Rock, "ore_copper") => ObjectInfo {
            title: "Copper Ore",
            description: "Greenish-brown veins of copper glint in the stone.",
            action_label: "Mine Ore",
            ..base
        },
        (InteractableKind::Rock, "ore_iron") => ObjectInfo {
            title: "Iron Ore",
            description: "Dark reddish streaks of iron run through the rock.",
            action_label: "Mine Ore",
            ..base
        },
        (InteractableKind::Rock, "ore_crystal") => ObjectInfo {
            title: "Crystal Ore",
            description: "Shimmering purple crystals jut from the stone.",
            action_label: "Mine Ore",
            ..base
        },
        (InteractableKind::Mushroom, "porcini") => ObjectInfo {
            title: "Porcini",
            description: "A plump porcini mushroom with a rich earthy aroma.",
            ..base
        },
        (InteractableKind::Mushroom, "chanterelle") => ObjectInfo {
            title: "Chanterelle",
            description: "A golden chanterelle with a delicate funnel shape.",
            ..base
        },
        (InteractableKind::Mushroom, "fly_agaric") => ObjectInfo {
            title: "Fly Agaric",
            description: "A red-capped toadstool with white spots. Handle with care.",
            ..base
        },
        _ => base,
    }
}

// ---------------------------------------------------------------------------
// Spawn (hidden panel, shown on selection)
// ---------------------------------------------------------------------------

fn spawn_interaction_panel(mut commands: Commands) {
    commands
        .spawn((
            Node {
                position_type: PositionType::Absolute,
                bottom: Val::Px(200.0),
                left: Val::Percent(50.0),
                margin: UiRect::left(Val::Px(-140.0)),
                width: Val::Px(280.0),
                flex_direction: FlexDirection::Column,
                padding: UiRect::all(Val::Px(10.0)),
                row_gap: Val::Px(8.0),
                border_radius: BorderRadius::all(Val::Px(6.0)),
                ..default()
            },
            BackgroundColor(ui_color::PANEL),
            GlobalZIndex(80),
            Visibility::Hidden,
            DespawnOnExit(GamePhase::Playing),
            InteractionPanel,
        ))
        .with_children(|panel| {
            // Title
            panel.spawn((
                Text::new("Object"),
                TextFont {
                    font_size: 16.0,
                    ..default()
                },
                TextColor(ui_color::TEXT_PRIMARY),
                InteractionTitle,
            ));

            // Description
            panel.spawn((
                Text::new("Description"),
                TextFont {
                    font_size: 12.0,
                    ..default()
                },
                TextColor(ui_color::TEXT_SECONDARY),
                Node {
                    padding: UiRect::all(Val::Px(6.0)),
                    ..default()
                },
                InteractionDesc,
            ));

            // Action button
            panel
                .spawn((
                    Node {
                        width: Val::Percent(100.0),
                        height: Val::Px(36.0),
                        justify_content: JustifyContent::Center,
                        align_items: AlignItems::Center,
                        border_radius: BorderRadius::all(Val::Px(4.0)),
                        ..default()
                    },
                    BackgroundColor(ui_color::BTN_PRIMARY),
                    Interaction::default(),
                    InteractionBtn,
                ))
                .with_child((
                    Text::new("Action"),
                    TextFont {
                        font_size: 14.0,
                        ..default()
                    },
                    TextColor(ui_color::BTN_TEXT),
                    InteractionBtnLabel,
                ));
        });
}

// ---------------------------------------------------------------------------
// Systems
// ---------------------------------------------------------------------------

/// Check for new object selections (reads snapshot directly, no polling delay).
fn poll_selection(
    mut active: ResMut<ActiveInteraction>,
    mut panel_q: Query<&mut Visibility, With<InteractionPanel>>,
    mut title_q: Query<
        &mut Text,
        (
            With<InteractionTitle>,
            Without<InteractionDesc>,
            Without<InteractionBtnLabel>,
        ),
    >,
    mut desc_q: Query<
        &mut Text,
        (
            With<InteractionDesc>,
            Without<InteractionTitle>,
            Without<InteractionBtnLabel>,
        ),
    >,
    mut btn_label_q: Query<
        &mut Text,
        (
            With<InteractionBtnLabel>,
            Without<InteractionTitle>,
            Without<InteractionDesc>,
        ),
    >,
) {
    if active.open {
        return;
    }

    let Some(selected) = super::scene_objects::get_selected_snapshot() else {
        return;
    };

    let info = lookup_object_info(selected.kind, selected.sub_kind.as_deref());

    active.open = true;
    active.entity_id = selected.entity_id;
    active.object_pos = Vec3::new(
        selected.position[0],
        selected.position[1],
        selected.position[2],
    );
    active.action_key = info.action_key;
    active.title = info.title.to_string();

    for mut vis in &mut panel_q {
        *vis = Visibility::Visible;
    }
    for mut txt in &mut title_q {
        **txt = info.title.to_string();
    }
    for mut txt in &mut desc_q {
        **txt = info.description.to_string();
    }
    for mut txt in &mut btn_label_q {
        **txt = info.action_label.to_string();
    }
}

/// Auto-close if player walks too far from the object.
fn check_distance_close(
    mut active: ResMut<ActiveInteraction>,
    mut panel_q: Query<&mut Visibility, With<InteractionPanel>>,
    player_q: Query<&Transform, With<Player>>,
) {
    if !active.open {
        return;
    }

    let Ok(player_tf) = player_q.single() else {
        return;
    };

    let dx = player_tf.translation.x - active.object_pos.x;
    let dz = player_tf.translation.z - active.object_pos.z;
    let dist = (dx * dx + dz * dz).sqrt();

    if dist > MODAL_CLOSE_DIST {
        active.open = false;
        for mut vis in &mut panel_q {
            *vis = Visibility::Hidden;
        }
    }
}

/// Handle action button press.
fn handle_action_button(
    mut active: ResMut<ActiveInteraction>,
    mut commands: Commands,
    mut panel_q: Query<&mut Visibility, With<InteractionPanel>>,
    btn_q: Query<&Interaction, (Changed<Interaction>, With<InteractionBtn>)>,
    player_q: Query<&Transform, With<Player>>,
) {
    for interaction in &btn_q {
        if *interaction != Interaction::Pressed || !active.open {
            continue;
        }

        // Distance check
        if let Ok(player_tf) = player_q.single() {
            let dx = player_tf.translation.x - active.object_pos.x;
            let dz = player_tf.translation.z - active.object_pos.z;
            let dist = (dx * dx + dz * dz).sqrt();
            if dist > ACTION_DIST {
                commands.trigger(Toast::warn("You are too far away."));
                active.open = false;
                for mut vis in &mut panel_q {
                    *vis = Visibility::Hidden;
                }
                return;
            }
        }

        // Dispatch action
        if !active.action_key.is_empty() {
            actions::push_action(actions::ActionRequest {
                entity_id: active.entity_id,
                action: active.action_key.to_string(),
            });

            let verb = match active.action_key {
                "chop_tree" => "Chopping",
                "mine_rock" => "Mining",
                _ => "Collecting",
            };
            commands.trigger(Toast::info(format!("{verb} {}...", active.title)));
        }

        active.open = false;
        for mut vis in &mut panel_q {
            *vis = Visibility::Hidden;
        }
    }
}
