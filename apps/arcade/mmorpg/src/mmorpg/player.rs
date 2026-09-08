use avian3d::prelude::*;
use bevy::animation::transition::AnimationTransitions;
use bevy::animation::{AnimatedBy, AnimationTargetId};
use bevy::platform::collections::HashMap;
use bevy::prelude::*;
use bevy::world_serialization::WorldInstanceReady;
use kinetree::{IkLimb, IkLimbBones, RestHinge};

use super::camera::OrbitCamera;
use super::character::{CharacterAnimator, Gait, Locomotion, find_bone, model_root};
use super::foot_ik::FootGoal;
use super::world::height_at;

const PLAYER_RADIUS: f32 = 0.32;
const PLAYER_HEIGHT: f32 = 1.16;
const RUN_SPEED: f32 = 5.5;
const SPRINT_SPEED: f32 = 9.0;
const JUMP_SPEED: f32 = 8.0;

/// Speeds the gait clips read as natural at. Below `WALK_MAX` the walk cycle
/// matches the ground; above `JOG_MAX` only the sprint cycle keeps up.
const IDLE_MAX: f32 = 0.3;
const WALK_MAX: f32 = 3.0;
const JOG_MAX: f32 = 7.0;

/// Speed either side of a gait boundary that must be cleared before the gait
/// actually changes.
///
/// Without it, holding a speed near a threshold flips the gait every frame,
/// and each flip restarts a 180ms cross-fade that never gets to finish -- the
/// legs stutter between two clips while the character walks in a straight line.
const GAIT_HYSTERESIS: f32 = 0.5;

/// Picks a gait from ground speed, keeping the one already running until the
/// speed clears its boundary by [`GAIT_HYSTERESIS`].
fn gait_for(speed: f32, current: Gait) -> Gait {
    const LADDER: [Gait; 4] = [Gait::Idle, Gait::Walk, Gait::Jog, Gait::Sprint];
    const EDGES: [f32; 3] = [IDLE_MAX, WALK_MAX, JOG_MAX];

    let mut rank = LADDER.iter().position(|gait| *gait == current).unwrap_or(0);
    while rank < EDGES.len() && speed > EDGES[rank] + GAIT_HYSTERESIS {
        rank += 1;
    }
    while rank > 0 && speed < EDGES[rank - 1] - GAIT_HYSTERESIS {
        rank -= 1;
    }
    LADDER[rank]
}
const GROUND_PROBE: f32 = 0.25;

/// Where the model's origin sits relative to the capsule's centre. The glTF is
/// authored with its origin at the soles; the capsule is centred on the body.
const MODEL_DROP: f32 = -(PLAYER_HEIGHT * 0.5 + PLAYER_RADIUS);

/// The rig is authored facing +Z -- its toes point that way from the ankle --
/// while bevy treats -Z as forward. Half a turn on the model reconciles the
/// two, so the player transform can stay in bevy's convention and the camera
/// does not need a special case.
const MODEL_FACING: f32 = core::f32::consts::PI;

const LEGS: [(&str, &str, &str); 2] = [
    ("thigh_l", "calf_l", "foot_l"),
    ("thigh_r", "calf_r", "foot_r"),
];

pub struct PlayerPlugin;

impl Plugin for PlayerPlugin {
    fn build(&self, app: &mut App) {
        app.add_systems(Startup, spawn_player)
            .add_systems(Update, (drive_player, face_travel_direction).chain());
    }
}

#[derive(Component)]
pub struct Player;

#[derive(Component)]
pub struct Grounded(pub bool);

fn spawn_player(mut commands: Commands, assets: Res<AssetServer>) {
    let spawn = Vec3::new(0.0, height_at(0.0, 0.0) + 4.0, 0.0);
    let player = commands
        .spawn((
            Player,
            Grounded(false),
            Gait::Idle,
            Transform::from_translation(spawn),
            Visibility::default(),
            RigidBody::Dynamic,
            Collider::capsule(PLAYER_RADIUS, PLAYER_HEIGHT),
            LockedAxes::ROTATION_LOCKED,
            Friction::new(0.0).with_combine_rule(CoefficientCombine::Min),
            Restitution::new(0.0),
            ShapeCaster::new(
                Collider::sphere(PLAYER_RADIUS * 0.9),
                Vec3::ZERO,
                Quat::IDENTITY,
                Dir3::NEG_Y,
            )
            .with_max_distance(PLAYER_HEIGHT * 0.5 + GROUND_PROBE),
        ))
        .id();

    commands
        .spawn((
            model_root(&assets),
            Transform::from_xyz(0.0, MODEL_DROP, 0.0)
                .with_rotation(Quat::from_rotation_y(MODEL_FACING)),
            ChildOf(player),
        ))
        .observe(wire_skeleton);
}

/// Runs once the glTF has actually spawned its entities. Nothing about the
/// skeleton exists before this: `WorldAssetRoot` only queues the load, so a
/// startup system that looked for `thigh_l` would find nothing.
fn wire_skeleton(
    event: On<WorldInstanceReady>,
    mut commands: Commands,
    locomotion: Option<Res<Locomotion>>,
    parents: Query<&ChildOf>,
    children: Query<&Children>,
    names: Query<&Name>,
) {
    let model = event.entity;
    let Ok(player) = parents.get(model).map(ChildOf::parent) else {
        return;
    };

    // The body glTF carries no animations of its own, so bevy's loader gives
    // it neither an AnimationPlayer nor the AnimationTargetId/AnimatedBy pair
    // that binds a bone to a clip -- it only emits those for a file that has
    // clips in it. Without them the graph loads, plays, and drives nothing,
    // and the character stands in its bind pose. So build the rig here.
    //
    // `Armature` is the animation root because bevy roots each animation at a
    // top-level scene node, and it is the only one in this file. Target ids are
    // hashes of the name path from that root down, which is why the clips in
    // UAL1.glb bind at all: both files spell the path the same way.
    let Some(armature) = find_bone(model, "Armature", &names, &children) else {
        warn!("character model has no Armature node; nothing to animate");
        return;
    };

    commands
        .entity(armature)
        .insert((AnimationPlayer::default(), AnimationTransitions::new()));
    if let Some(locomotion) = locomotion {
        commands
            .entity(armature)
            .insert(AnimationGraphHandle(locomotion.graph.clone()));
    }
    commands.entity(player).insert(CharacterAnimator(armature));

    // One traversal does both jobs: stamp every bone with the id a clip binds
    // to, and note the handful this character's IK needs on the way past.
    // Six separate find_bone calls each rewalked all 69 nodes, which is fine
    // for one character and 414 wasted visits per character in a crowd.
    let mut wanted = HashMap::new();
    for (root, mid, tip) in LEGS {
        wanted.insert(root, Entity::PLACEHOLDER);
        wanted.insert(mid, Entity::PLACEHOLDER);
        wanted.insert(tip, Entity::PLACEHOLDER);
    }
    let mut path = Vec::new();
    retarget(
        armature,
        armature,
        &mut path,
        &mut commands,
        &names,
        &children,
        &mut wanted,
    );

    // Measured off Jog_Fwd_Loop at its most-bent frame: the knee turns about
    // the thigh's own -X, to (-0.9997, 0.0000, -0.0228) on the left leg and
    // (-0.9995, -0.0000, -0.0310) on the right. Both sides, so the rig did not
    // mirror its local axes.
    //
    // Not inferred at runtime. The bind pose has the leg dead straight, and
    // the idle clip only bends it 23 degrees -- enough for a cross product,
    // and that cross product points 40 degrees away from the real hinge.
    let knee_hinge = RestHinge::from_local_axis(Vec3::NEG_X);

    for (root, mid, tip) in LEGS {
        let found = |name: &str| {
            wanted
                .get(name)
                .copied()
                .filter(|e| *e != Entity::PLACEHOLDER)
        };
        let (Some(root), Some(mid), Some(tip)) = (found(root), found(mid), found(tip)) else {
            warn!("leg {root}/{mid}/{tip} not found under the character model");
            continue;
        };

        commands.spawn((
            IkLimbBones { root, mid, tip },
            IkLimb {
                rest: knee_hinge,
                weight: 0.0,
                ..default()
            },
            FootGoal {
                character: player,
                grounded: 0.0,
            },
        ));
    }
}

fn drive_player(
    keys: Res<ButtonInput<KeyCode>>,
    camera: Single<&OrbitCamera>,
    mut player: Single<(&mut LinearVelocity, &mut Grounded, &mut Gait, &ShapeHits), With<Player>>,
) {
    let (velocity, grounded, gait, hits) = &mut *player;
    grounded.0 = !hits.is_empty();

    let mut input = Vec2::ZERO;
    if keys.pressed(KeyCode::KeyW) {
        input.y += 1.0;
    }
    if keys.pressed(KeyCode::KeyS) {
        input.y -= 1.0;
    }
    if keys.pressed(KeyCode::KeyD) {
        input.x += 1.0;
    }
    if keys.pressed(KeyCode::KeyA) {
        input.x -= 1.0;
    }

    let sprinting = keys.pressed(KeyCode::ShiftLeft);
    let speed = if sprinting { SPRINT_SPEED } else { RUN_SPEED };
    let yaw = Quat::from_rotation_y(camera.yaw);
    let forward = yaw * Vec3::NEG_Z;
    let right = yaw * Vec3::X;
    let wish = (forward * input.y + right * input.x).normalize_or_zero() * speed;

    let blend = if grounded.0 { 1.0 } else { 0.12 };
    velocity.x += (wish.x - velocity.x) * blend;
    velocity.z += (wish.z - velocity.z) * blend;

    if grounded.0 && keys.just_pressed(KeyCode::Space) {
        velocity.y = JUMP_SPEED;
    }

    let planar = Vec2::new(velocity.x, velocity.z).length();
    let wanted = if !grounded.0 {
        Gait::Airborne
    } else {
        // Airborne is not on the speed ladder, so landing resumes from the
        // gait the speed implies rather than from wherever it left off.
        let resume = if **gait == Gait::Airborne {
            Gait::Idle
        } else {
            **gait
        };
        gait_for(planar, resume)
    };
    if **gait != wanted {
        **gait = wanted;
    }
}

fn face_travel_direction(
    time: Res<Time>,
    mut player: Single<(&mut Transform, &LinearVelocity), With<Player>>,
) {
    let (transform, velocity) = &mut *player;
    let planar = Vec3::new(velocity.x, 0.0, velocity.z);
    if planar.length_squared() < 0.25 {
        return;
    }
    let target = Quat::from_rotation_arc(Vec3::NEG_Z, planar.normalize());
    transform.rotation = transform
        .rotation
        .slerp(target, (14.0 * time.delta_secs()).min(1.0));
}

/// Gives every bone under `root` the identity a clip binds to: the hash of its
/// name path from the animation root, plus a pointer back to the player that
/// drives it. Mirrors what bevy's glTF loader does for a file that has clips.
fn retarget(
    entity: Entity,
    root: Entity,
    path: &mut Vec<Name>,
    commands: &mut Commands,
    names: &Query<&Name>,
    children: &Query<&Children>,
    wanted: &mut HashMap<&'static str, Entity>,
) {
    // An unnamed node cannot be addressed by a clip, and neither can anything
    // below it, since the path would have a hole in it. bevy's loader warns and
    // drops the subtree here too.
    let Ok(name) = names.get(entity) else {
        return;
    };
    path.push(name.clone());
    commands
        .entity(entity)
        .insert((AnimationTargetId::from_names(path.iter()), AnimatedBy(root)));
    if let Some(slot) = wanted.get_mut(name.as_str()) {
        *slot = entity;
    }
    for child in children.get(entity).into_iter().flatten() {
        retarget(*child, root, path, commands, names, children, wanted);
    }
    path.pop();
}
