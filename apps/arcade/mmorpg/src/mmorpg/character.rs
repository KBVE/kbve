//! Everything a body that walks needs, independent of who is steering it.
//!
//! Nothing here mentions the player. A character is spawned by
//! [`spawn_character`], moved by whatever writes its [`MoveIntent`], and
//! animated from the gait its own speed implies. The keyboard, an AI, and a
//! network packet are interchangeable at that one seam.

use core::time::Duration;

use avian3d::prelude::*;
use bevy::animation::transition::AnimationTransitions;
use bevy::animation::{AnimatedBy, AnimationTargetId, RepeatAnimation};
use bevy::gltf::GltfAssetLabel;
use bevy::platform::collections::HashMap;
use bevy::prelude::*;
use bevy::world_serialization::WorldInstanceReady;
use kinetree::{IkLimb, IkLimbBones, RestHinge};

use super::foot_ik::FootGoal;

const MODEL: &str = "characters/quaternius_ubc/models/Regular_Male_FullBody.glb";
const CLIPS: &str = "characters/quaternius_ubc/animations/UAL1.glb";

// Indices into UAL1's animation array. The library is a flat alphabetical list
// of 120 clips with no manifest, so these are positions, not names -- reread
// them with `GltfAssetLabel::Animation(n)` against a fresh dump if the pack is
// ever updated.
const CLIP_IDLE: usize = 53;
const CLIP_WALK: usize = 119;
const CLIP_JOG: usize = 67;
const CLIP_SPRINT: usize = 108;
const CLIP_JUMP: usize = 72;

// The combat clips, by their index in UAL1.glb. Indices rather than names
// because that is what `GltfAssetLabel::Animation` takes; the names they
// correspond to are beside them, since an index alone is unreadable and the
// next person to touch this will otherwise have to dump the glTF again.
const CLIP_PUNCH_JAB: usize = 84; // Punch_Jab -- leads with the LEFT hand
const CLIP_PUNCH_CROSS: usize = 83; // Punch_Cross -- leads with the right
const CLIP_CAST_CHANNEL: usize = 104; // Spell_Simple_Idle_Loop
const CLIP_CAST_RELEASE: usize = 105; // Spell_Simple_Shoot
const CLIP_CAST_POISON: usize = 101; // Spell_Double_Shoot_Loop
const CLIP_HIT: usize = 47; // Hit_Chest
const CLIP_DEATH: usize = 37; // Death01

pub const CHARACTER_RADIUS: f32 = 0.32;
pub const CHARACTER_HEIGHT: f32 = 1.16;
const RUN_SPEED: f32 = 5.5;
const SPRINT_SPEED: f32 = 9.0;
const JUMP_SPEED: f32 = 8.0;
const GROUND_PROBE: f32 = 0.25;

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

/// Where the model's origin sits relative to the capsule's centre. The glTF is
/// authored with its origin at the soles; the capsule is centred on the body.
const MODEL_DROP: f32 = -(CHARACTER_HEIGHT * 0.5 + CHARACTER_RADIUS);

/// The rig is authored facing +Z -- its toes point that way from the ankle --
/// while bevy treats -Z as forward. Half a turn on the model reconciles the
/// two, so the character transform can stay in bevy's convention and the camera
/// does not need a special case.
const MODEL_FACING: f32 = core::f32::consts::PI;

/// How long a gait change takes to cross-fade.
const BLEND: Duration = Duration::from_millis(180);

const LEGS: [(&str, &str, &str); 2] = [
    ("thigh_l", "calf_l", "foot_l"),
    ("thigh_r", "calf_r", "foot_r"),
];

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

/// Root of the spawned glTF, kept so systems can find the skeleton under it.
#[derive(Component)]
pub struct CharacterModel;

/// The `AnimationPlayer` this character's clips play on.
#[derive(Component)]
pub struct CharacterAnimator(pub Entity);

/// Locomotion clips, as graph nodes. One graph, shared by every character.
#[derive(Resource)]
pub struct Locomotion {
    pub idle: AnimationNodeIndex,
    pub walk: AnimationNodeIndex,
    pub jog: AnimationNodeIndex,
    pub sprint: AnimationNodeIndex,
    pub jump: AnimationNodeIndex,
    pub jab: Attack,
    pub cross: Attack,
    pub cast_channel: Clip,
    pub cast_release: Clip,
    pub cast_poison: Clip,
    pub hit: Clip,
    pub death: Clip,
    pub graph: Handle<AnimationGraph>,
}

/// An attack clip.
///
/// What was measured out of these clips, for the IK and contact-timing work
/// that will consume it:
///
/// | clip | length | lead arm | contact | reach |
/// |------|--------|----------|---------|-------|
/// | `Punch_Jab`   | 0.867s | left  | 50% (greatest reach) | 0.255m |
/// | `Punch_Cross` | 1.000s | right | 42% (greatest reach) | 0.547m |
///
/// Contact is the frame of greatest reach because these are thrusts. A sword
/// swing would instead use its frame of peak hand speed -- 25% for
/// `Sword_Attack` -- since a blade sweeps through contact rather than stopping
/// at it. The lead arm is measured, not assumed: the jab extends the left hand
/// 0.547m and the right only 0.255m.
///
/// The fields those numbers belong in are not here yet, because nothing reads
/// them and a field nobody reads is a field nobody keeps correct.
#[derive(Clone)]
pub struct Attack {
    pub clip: Clip,
}

/// A one-shot clip, kept with its handle.
///
/// The handle is the point: a one-shot has to be given back to locomotion when
/// it ends, and knowing when that is means asking the loaded
/// [`AnimationClip`] how long it runs. A hard-coded duration would be wrong for
/// every clip but one, and silently wrong when an artist re-times it.
#[derive(Clone)]
pub struct Clip {
    pub node: AnimationNodeIndex,
    pub handle: Handle<AnimationClip>,
}

impl Clip {
    /// How long the clip runs, or `None` while it is still loading.
    pub fn duration(&self, clips: &Assets<AnimationClip>) -> Option<f32> {
        clips.get(&self.handle).map(|clip| clip.duration())
    }
}

#[derive(Component, Clone, Copy, PartialEq, Eq, Debug)]
pub enum Gait {
    Idle,
    Walk,
    Jog,
    Sprint,
    Airborne,
}

pub struct CharacterPlugin;

/// Ordering handle for movement and locomotion animation, so the action layer
/// can place itself after the gait it overrides.
#[derive(SystemSet, Debug, Clone, PartialEq, Eq, Hash)]
pub struct CharacterSystems;

impl Plugin for CharacterPlugin {
    fn build(&self, app: &mut App) {
        app.add_systems(Startup, load_locomotion).add_systems(
            Update,
            (apply_movement, pick_gait, face_travel_direction, drive_gait)
                .chain()
                .in_set(CharacterSystems),
        );
    }
}

fn load_locomotion(
    mut commands: Commands,
    assets: Res<AssetServer>,
    mut graphs: ResMut<Assets<AnimationGraph>>,
) {
    let clip = |index: usize| assets.load(GltfAssetLabel::Animation(index).from_asset(CLIPS));

    let handles: [Handle<AnimationClip>; 12] = [
        clip(CLIP_IDLE),
        clip(CLIP_WALK),
        clip(CLIP_JOG),
        clip(CLIP_SPRINT),
        clip(CLIP_JUMP),
        clip(CLIP_PUNCH_JAB),
        clip(CLIP_PUNCH_CROSS),
        clip(CLIP_CAST_CHANNEL),
        clip(CLIP_CAST_RELEASE),
        clip(CLIP_CAST_POISON),
        clip(CLIP_HIT),
        clip(CLIP_DEATH),
    ];
    let (graph, nodes) = AnimationGraph::from_clips(handles.clone());

    let one_shot = |index: usize| Clip {
        node: nodes[index],
        handle: handles[index].clone(),
    };

    commands.insert_resource(Locomotion {
        idle: nodes[0],
        walk: nodes[1],
        jog: nodes[2],
        sprint: nodes[3],
        jump: nodes[4],
        jab: Attack { clip: one_shot(5) },
        cross: Attack { clip: one_shot(6) },
        cast_channel: one_shot(7),
        cast_release: one_shot(8),
        cast_poison: one_shot(9),
        hit: one_shot(10),
        death: one_shot(11),
        graph: graphs.add(graph),
    });
}

/// Spawns a character at `position` and returns it, ready for something to
/// write its [`MoveIntent`].
pub fn spawn_character(commands: &mut Commands, assets: &AssetServer, position: Vec3) -> Entity {
    let character = commands
        .spawn((
            Character,
            MoveIntent::default(),
            Grounded(false),
            Gait::Idle,
            Transform::from_translation(position),
            Visibility::default(),
            RigidBody::Dynamic,
            Collider::capsule(CHARACTER_RADIUS, CHARACTER_HEIGHT),
            LockedAxes::ROTATION_LOCKED,
            Friction::new(0.0).with_combine_rule(CoefficientCombine::Min),
            Restitution::new(0.0),
            ShapeCaster::new(
                Collider::sphere(CHARACTER_RADIUS * 0.9),
                Vec3::ZERO,
                Quat::IDENTITY,
                Dir3::NEG_Y,
            )
            .with_max_distance(CHARACTER_HEIGHT * 0.5 + GROUND_PROBE),
        ))
        .id();

    commands
        .spawn((
            CharacterModel,
            WorldAssetRoot(assets.load(GltfAssetLabel::Scene(0).from_asset(MODEL))),
            Transform::from_xyz(0.0, MODEL_DROP, 0.0)
                .with_rotation(Quat::from_rotation_y(MODEL_FACING)),
            ChildOf(character),
        ))
        .observe(wire_skeleton);

    character
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
    let Ok(character) = parents.get(model).map(ChildOf::parent) else {
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
    commands
        .entity(character)
        .insert(CharacterAnimator(armature));

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
                character,
                grounded: 0.0,
            },
        ));
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

/// Walks a spawned hierarchy and returns the first entity carrying `name`.
pub fn find_bone(
    root: Entity,
    name: &str,
    names: &Query<&Name>,
    children: &Query<&Children>,
) -> Option<Entity> {
    if names.get(root).is_ok_and(|found| found.as_str() == name) {
        return Some(root);
    }
    for child in children.get(root).into_iter().flatten() {
        if let Some(found) = find_bone(*child, name, names, children) {
            return Some(found);
        }
    }
    None
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

/// Turns the model to face where it is travelling.
///
/// Deliberately the model child and not the body. The capsule is
/// `ROTATION_LOCKED`, so its rotation means nothing to the simulation, and
/// writing any part of a physics body's `Transform` outside the fixed loop
/// makes `bevy_transform_interpolation` treat it as a user override and throw
/// away the translation easing it had prepared. The rendered position then
/// stops advancing until the next physics tick reinstates it -- constant
/// velocity, stuttering picture. Facing is a purely visual concern, so it lives
/// on the entity that exists for visuals.
fn face_travel_direction(
    time: Res<Time>,
    velocities: Query<&LinearVelocity, With<Character>>,
    mut models: Query<(&mut Transform, &ChildOf), With<CharacterModel>>,
) {
    let step = (14.0 * time.delta_secs()).min(1.0);
    for (mut transform, parent) in &mut models {
        let Ok(velocity) = velocities.get(parent.parent()) else {
            continue;
        };
        let planar = Vec3::new(velocity.x, 0.0, velocity.z);
        if planar.length_squared() < 0.25 {
            continue;
        }
        // The body no longer carries the facing, so the model's own local
        // rotation has to be the whole of it: the heading, then the correction
        // for a rig that was authored looking down +Z.
        let target = Quat::from_rotation_arc(Vec3::NEG_Z, planar.normalize())
            * Quat::from_rotation_y(MODEL_FACING);
        transform.rotation = transform.rotation.slerp(target, step);
    }
}

fn drive_gait(
    locomotion: Option<Res<Locomotion>>,
    characters: Query<(Ref<Gait>, &CharacterAnimator), Without<super::action::Action>>,
    mut players: Query<(&mut AnimationPlayer, &mut AnimationTransitions)>,
) {
    let Some(locomotion) = locomotion else {
        return;
    };
    // Characters mid-action are excluded by the query rather than skipped
    // inside it: a swing that gets overwritten by a gait change on the frame
    // the player happens to start running is the sort of thing that looks like
    // a dropped input.
    for (gait, animator) in &characters {
        let Ok((mut player, mut transitions)) = players.get_mut(animator.0) else {
            continue;
        };
        // `is_added` on the transitions, not on the gait: the character spawns
        // with a Gait, but the animator arrives later from the glTF observer,
        // so the initial Idle change has already gone stale by the time this
        // query can match it and the model would stand in its bind pose until
        // the first time the player moved.
        if !gait.is_changed() && !transitions.is_added() {
            continue;
        }
        let node = match *gait {
            Gait::Idle => locomotion.idle,
            Gait::Walk => locomotion.walk,
            Gait::Jog => locomotion.jog,
            Gait::Sprint => locomotion.sprint,
            Gait::Airborne => locomotion.jump,
        };
        transitions
            .play(&mut player, node, BLEND)
            .set_repeat(RepeatAnimation::Forever);
    }
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
