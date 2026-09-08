#![cfg(feature = "bevy")]

use bevy::prelude::*;
use kinetree::{IkLimb, IkLimbBones, KinetreePlugin};

// Bent 45 degrees, for the same reason the unit fixture is: the solver refuses
// to measure a hinge off a near-straight limb, so a test rig built in an
// anatomical rest pose would silently never solve at all.
fn leg_app(goal: Vec3, character: Transform) -> (App, Entity) {
    let mut app = App::new();
    app.add_plugins((MinimalPlugins, TransformPlugin, KinetreePlugin));

    let mut tip = Entity::PLACEHOLDER;
    let mut mid = Entity::PLACEHOLDER;
    let mut root = Entity::PLACEHOLDER;

    app.world_mut().spawn(character).with_children(|parent| {
        root = parent
            .spawn(Transform::from_xyz(0.0, 0.92, 0.0))
            .with_children(|thigh| {
                mid = thigh
                    .spawn(Transform::from_xyz(0.0, -0.42, 0.18))
                    .with_children(|shin| {
                        tip = shin.spawn(Transform::from_xyz(0.0, -0.40, -0.16)).id();
                    })
                    .id();
            })
            .id();
    });

    app.world_mut()
        .spawn((IkLimbBones { root, mid, tip }, IkLimb { goal, ..default() }));

    (app, tip)
}

fn world_position(app: &App, entity: Entity) -> Vec3 {
    app.world()
        .entity(entity)
        .get::<GlobalTransform>()
        .expect("propagation ran")
        .translation()
}

#[test]
fn the_tip_lands_on_the_goal() {
    let goal = Vec3::new(0.18, 0.22, 0.30);
    let (mut app, tip) = leg_app(goal, Transform::IDENTITY);

    app.update();
    app.update();

    let landed = world_position(&app, tip);
    assert!(
        landed.distance(goal) < 1e-3,
        "tip landed at {landed}, goal was {goal}"
    );
}

#[test]
fn a_moved_character_still_lands_on_the_frame_it_moves() {
    let goal = Vec3::new(5.18, 0.22, -2.70);
    let character = Transform::from_xyz(5.0, 0.0, -3.0).with_rotation(Quat::from_rotation_y(0.7));
    let (mut app, tip) = leg_app(goal, character);

    app.update();

    let landed = world_position(&app, tip);
    assert!(
        landed.distance(goal) < 1e-3,
        "tip landed at {landed}, goal was {goal} -- the ancestor chain was read stale"
    );
}

#[test]
fn zero_weight_leaves_the_pose_alone() {
    let goal = Vec3::new(0.18, 0.22, 0.30);
    let (mut app, tip) = leg_app(goal, Transform::IDENTITY);

    let entity = app
        .world_mut()
        .query_filtered::<Entity, With<IkLimb>>()
        .single(app.world())
        .unwrap();
    app.world_mut()
        .entity_mut(entity)
        .get_mut::<IkLimb>()
        .unwrap()
        .weight = 0.0;

    app.update();
    let posed = world_position(&app, tip);

    assert!(
        posed.distance(goal) > 0.1,
        "a zero weight still moved the limb"
    );
}
