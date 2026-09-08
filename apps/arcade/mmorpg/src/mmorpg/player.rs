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
///
/// A fraction of each boundary rather than a fixed speed. As an absolute it has
/// to be smaller than the tightest threshold it guards, and `IDLE_MAX` is 0.3 --
/// a flat 0.5 put the drop back to idle at -0.2, which a magnitude can never
/// reach, so a character that ever started walking walked forever.
const GAIT_HYSTERESIS: f32 = 0.25;

/// Picks a gait from ground speed, keeping the one already running until the
/// speed clears its boundary by [`GAIT_HYSTERESIS`].
fn gait_for(speed: f32, current: Gait) -> Gait {
    const LADDER: [Gait; 4] = [Gait::Idle, Gait::Walk, Gait::Jog, Gait::Sprint];
    const EDGES: [f32; 3] = [IDLE_MAX, WALK_MAX, JOG_MAX];

    let mut rank = LADDER.iter().position(|gait| *gait == current).unwrap_or(0);
    while rank < EDGES.len() && speed > EDGES[rank] * (1.0 + GAIT_HYSTERESIS) {
        rank += 1;
    }
    while rank > 0 && speed < EDGES[rank - 1] * (1.0 - GAIT_HYSTERESIS) {
        rank -= 1;
    }
    LADDER[rank]
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn every_gait_can_return_to_idle() {
        for start in [Gait::Walk, Gait::Jog, Gait::Sprint, Gait::Airborne] {
            assert_eq!(
                gait_for(0.0, start),
                Gait::Idle,
                "{start:?} could not fall back to idle at a standstill"
            );
        }
    }

    #[test]
    fn the_ladder_climbs_and_descends() {
        assert_eq!(gait_for(0.0, Gait::Idle), Gait::Idle);
        assert_eq!(gait_for(1.5, Gait::Idle), Gait::Walk);
        assert_eq!(gait_for(5.0, Gait::Walk), Gait::Jog);
        assert_eq!(gait_for(9.0, Gait::Jog), Gait::Sprint);
        assert_eq!(gait_for(5.0, Gait::Sprint), Gait::Jog);
        assert_eq!(gait_for(1.5, Gait::Jog), Gait::Walk);
    }

    #[test]
    fn a_speed_on_a_boundary_does_not_flip() {
        // The whole point of the band: sitting exactly on an edge holds
        // whichever gait is already running, in both directions.
        assert_eq!(gait_for(WALK_MAX, Gait::Walk), Gait::Walk);
        assert_eq!(gait_for(WALK_MAX, Gait::Jog), Gait::Jog);
        assert_eq!(gait_for(JOG_MAX, Gait::Jog), Gait::Jog);
        assert_eq!(gait_for(JOG_MAX, Gait::Sprint), Gait::Sprint);
    }
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
        app.add_systems(Startup, spawn_player).add_systems(
            Update,
            (read_input, apply_movement, pick_gait, face_travel_direction).chain(),
        );
    }
}

/// Marks the one character the keyboard drives.
///
/// A tag, and only `read_input` looks at it. Everything downstream works off
/// [`MoveIntent`], so an NPC or a networked player runs the identical movement
/// and animation path -- the only difference is what fills the intent in.
#[derive(Component)]
pub struct Player;

/// Anything that walks: has an intent, a gait, and legs to solve.
#[derive(Component)]
pub struct Character;

/// What a character is trying to do this frame, in world space.
///
/// The seam between "who decides" and "what happens". It is also the shape a
/// client would put on the wire, so server-authoritative movement later means
/// filling this from a packet rather than restructuring the systems.
#[derive(Component, Default)]
pub struct MoveIntent {
    /// Desired planar direction, unit length or zero.
    pub wish: Vec3,
    pub sprint: bool,
    pub jump: bool,
}

#[derive(Component)]
pub struct Grounded(pub bool);

fn spawn_player(mut commands: Commands, assets: Res<AssetServer>) {
    let spawn = Vec3::new(0.0, height_at(0.0, 0.0) + 4.0, 0.0);
    let player = commands
        .spawn((
            Player,
            Character,
            MoveIntent::default(),
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

/// The only system in the game that knows a keyboard exists.
fn read_input(
    keys: Res<ButtonInput<KeyCode>>,
    camera: Single<&OrbitCamera>,
    mut controlled: Query<&mut MoveIntent, With<Player>>,
) {
    let mut stick = Vec2::ZERO;
    if keys.pressed(KeyCode::KeyW) {
        stick.y += 1.0;
    }
    if keys.pressed(KeyCode::KeyS) {
        stick.y -= 1.0;
    }
    if keys.pressed(KeyCode::KeyD) {
        stick.x += 1.0;
    }
    if keys.pressed(KeyCode::KeyA) {
        stick.x -= 1.0;
    }

    // Resolved against the camera here, so the intent that leaves this system
    // is already in world space and nothing downstream needs a camera.
    let yaw = Quat::from_rotation_y(camera.yaw);
    let wish = (yaw * Vec3::NEG_Z * stick.y + yaw * Vec3::X * stick.x).normalize_or_zero();

    for mut intent in &mut controlled {
        intent.wish = wish;
        intent.sprint = keys.pressed(KeyCode::ShiftLeft);
        intent.jump = keys.just_pressed(KeyCode::Space);
    }
}

fn apply_movement(
    mut characters: Query<
        (&MoveIntent, &mut LinearVelocity, &mut Grounded, &ShapeHits),
        With<Character>,
    >,
) {
    for (intent, mut velocity, mut grounded, hits) in &mut characters {
        grounded.0 = !hits.is_empty();

        let speed = if intent.sprint {
            SPRINT_SPEED
        } else {
            RUN_SPEED
        };
        let wish = intent.wish * speed;

        let blend = if grounded.0 { 1.0 } else { 0.12 };
        velocity.x += (wish.x - velocity.x) * blend;
        velocity.z += (wish.z - velocity.z) * blend;

        if grounded.0 && intent.jump {
            velocity.y = JUMP_SPEED;
        }
    }
}

fn pick_gait(mut characters: Query<(&LinearVelocity, &Grounded, &mut Gait), With<Character>>) {
    for (velocity, grounded, mut gait) in &mut characters {
        let planar = Vec2::new(velocity.x, velocity.z).length();
        let wanted = if !grounded.0 {
            Gait::Airborne
        } else {
            // Airborne is not on the speed ladder, so landing resumes from the
            // gait the speed implies rather than from wherever it left off.
            let resume = if *gait == Gait::Airborne {
                Gait::Idle
            } else {
                *gait
            };
            gait_for(planar, resume)
        };
        gait.set_if_neq(wanted);
    }
}

fn face_travel_direction(
    time: Res<Time>,
    mut characters: Query<(&mut Transform, &LinearVelocity), With<Character>>,
) {
    let step = (14.0 * time.delta_secs()).min(1.0);
    for (mut transform, velocity) in &mut characters {
        let planar = Vec3::new(velocity.x, 0.0, velocity.z);
        if planar.length_squared() < 0.25 {
            continue;
        }
        let target = Quat::from_rotation_arc(Vec3::NEG_Z, planar.normalize());
        transform.rotation = transform.rotation.slerp(target, step);
    }
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
