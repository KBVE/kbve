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
use bevy::ecs::system::SystemParam;
use bevy::gltf::{Gltf, GltfAssetLabel};
use bevy::platform::collections::HashMap;
use bevy::prelude::*;
use bevy::world_serialization::WorldInstanceReady;
use kinetree::{IkLimb, IkLimbBones};

use super::foot_ik::FootGoal;
use super::rig::{GaitBlend, GaitClips, LimbSpec, Rig, RigProfile};

pub const CHARACTER_RADIUS: f32 = 0.32;
pub const CHARACTER_HEIGHT: f32 = 1.16;
/// Walking is what a character does with no modifier held, and it has to land
/// inside the walk band or the gait ladder answers with a jog -- which is
/// exactly what it used to do, so the game had no walk in it at all.
const WALK_SPEED: f32 = 2.2;
const RUN_SPEED: f32 = 5.5;
const JUMP_SPEED: f32 = 5.5;

/// How far past its own radius a body looks for a wall along its wish, how upright a hit may be and still count as one, and how much of the wish must survive sliding along it for the push to count as movement.
const WALL_REACH: f32 = 0.2;
const WALL_LEAN: f32 = 0.5;
const WALL_GLANCE: f32 = 0.35;

/// Ground acceleration in metres per second squared, for speeding up and turning; easing off to a slower gait uses [`GROUND_DECEL`], letting go brakes instantly.
const GROUND_ACCEL: f32 = 14.0;
const GROUND_DECEL: f32 = 9.0;

/// How fast ground travel may swing its heading, radians per second.
const TURN_RATE: f32 = 4.0;

/// How fast the model may turn to face its travel, radians per second; a little ahead of the travel arc so it leads the turn.
const FACE_RATE: f32 = 6.0;

/// Heading changes sharper than this are a reversal, and reverse outright rather than arcing.
const REVERSAL_ARC: f32 = 2.1;
const GROUND_PROBE: f32 = 0.25;

/// How much speed is left when retreating.
///
/// Backing away is slower than advancing in every game that has both, because
/// the alternative is a fight where disengaging costs nothing. Not so slow that
/// the backpedal clip has to crawl, which is what 0.4 looked like.
const BACKPEDAL: f32 = 0.7;

/// Travel that counts as backing away rather than circling, as the cosine of the
/// angle from the heading. Just past a right angle, so strafing keeps full speed
/// and only genuine retreat is taxed.
const BACKPEDAL_ARC: f32 = -0.35;

/// The ground speed the directional clips were authored at.
///
/// They are jog cycles, so their footfalls line up at [`RUN_SPEED`] and have to
/// be scaled anywhere else.
const DIRECTIONAL_REFERENCE: f32 = RUN_SPEED;

/// How far playback may be scaled to match the ground.
///
/// A clip slowed past the floor stops reading as walking and starts reading as
/// wading -- exactly what the first attempt at 0.4 did.
const RATE_FLOOR: f32 = 0.65;
const RATE_CEILING: f32 = 1.35;

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

/// The two halves of the body, as animation mask groups.
///
/// A mask group is a set of bones a graph node is forbidden to touch, which is
/// what lets one clip drive the legs while another drives the arms. Without the
/// split, throwing a punch replaces the whole animation and the legs stop dead
/// while the character is still sliding along the ground.
///
/// The waist is the seam: the pelvis and everything below it walks, the spine
/// and everything above it fights. The pelvis belongs to the legs because it is
/// where the stride actually comes from -- a punch's weight shift through the
/// hips is lost, which is the standard price of a two-layer split.
pub const LOWER_BODY: u32 = 0;
pub const UPPER_BODY: u32 = 1;

/// Which half of the body a bone belongs to.
///
/// The classification is [`kinetree::role_of`]'s, not this game's, so the same
/// split lands correctly on a Mixamo rig or an Epic one without a second table
/// of names here.
///
/// Bones it does not recognise -- fingers, leaf bones, anything a particular rig
/// invents -- inherit from their parent rather than being guessed at. That is
/// what makes this work on a skeleton nobody has catalogued: a finger is upper
/// because the hand it hangs from is, and it stays upper if someone renames it.
/// Every bone must land in exactly one group; a bone in neither is driven by
/// both layers at once and blends a walk against a punch.
fn mask_group(name: &str, parent: u32) -> u32 {
    match kinetree::role_of(name).map(kinetree::Bone::half) {
        Some(kinetree::Half::Lower) => LOWER_BODY,
        Some(kinetree::Half::Upper) => UPPER_BODY,
        None => parent,
    }
}

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
    /// Set by the movement when the wish runs straight into a wall, so the pose treats the stick as released instead of starting into it.
    pub blocked: bool,
    /// Whether to move at [`RUN_SPEED`] instead of [`WALK_SPEED`].
    pub run: bool,
    pub jump: bool,
}

#[derive(Component)]
pub struct Grounded(pub bool);

/// A direction the character should face regardless of where it is walking.
///
/// `None` means "face where you are going", which is the ordinary case. Combat
/// writes a direction into it while something is selected, and that is the whole
/// mechanism behind backing away from an enemy while still looking at it -- the
/// facing stops following the feet, so the feet have something to disagree with.
#[derive(Component, Default)]
pub struct Heading(pub Option<Dir3>);

/// Which way the character is travelling relative to the way it is facing.
///
/// Always `Forward` unless a [`Heading`] is set, since a character with no
/// heading turns to face its own velocity and therefore cannot be moving
/// sideways in its own frame.
#[derive(Component, Clone, Copy, PartialEq, Eq, Debug, Default)]
pub enum Bearing {
    #[default]
    Forward,
    Back,
    Left,
    Right,
}

/// How much better a bearing has to score before it takes over.
///
/// The same problem the gait ladder has: four contiguous bands means a diagonal
/// sits on a seam, and a bearing that flips every frame restarts a cross-fade
/// that never finishes.
const BEARING_HYSTERESIS: f32 = 0.2;

/// Root of the spawned glTF, kept so systems can find the skeleton under it.
#[derive(Component)]
pub struct CharacterModel;

/// The `AnimationPlayer` this character's clips play on.
#[derive(Component)]
pub struct CharacterAnimator(pub Entity);

/// One gait clip per direction and speed, as graph nodes.
///
/// There are two of these, holding the same eight clips wired under different
/// branches of the graph: one that drives the whole body and one that drives
/// only the legs. Which is playing is the difference between standing still to
/// punch and punching while walking.
pub struct Gaits {
    pub idle: AnimationNodeIndex,
    pub walk: AnimationNodeIndex,
    pub jog: AnimationNodeIndex,
    pub sprint: AnimationNodeIndex,
    pub jump: AnimationNodeIndex,
    pub back: AnimationNodeIndex,
    pub left: AnimationNodeIndex,
    pub right: AnimationNodeIndex,
}

/// Locomotion clips, as graph nodes. One graph, shared by every character.
#[derive(Resource)]
pub struct Locomotion {
    /// Locomotion over the whole body, for a character doing nothing else.
    pub whole: Gaits,
    /// The same clips, legs only, for a character whose arms are busy.
    pub legs: Gaits,
    /// The same clips, upper body only, for a character whose legs are procedural.
    pub torso: Gaits,
    /// Each torso node with its clip and the phase at which its left foot lands.
    pub torso_sync: Vec<(AnimationNodeIndex, Handle<AnimationClip>, f32)>,
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
        app.add_systems(
            Update,
            (
                build_locomotion.run_if(not(resource_exists::<Locomotion>)),
                dress,
                bind_graph,
            ),
        )
        .add_systems(
            Update,
            (
                apply_movement,
                pick_gait,
                pick_bearing,
                face_travel_direction,
                drive_gait,
            )
                .chain()
                .in_set(CharacterSystems),
        );
    }
}

/// Mask-group table for the rig, recorded by the first skeleton wired and applied to the graph once.
#[derive(Resource)]
pub struct RigMask(pub Vec<(AnimationTargetId, u32)>);

/// A character whose model has been spawned under it.
#[derive(Component)]
pub struct Dressed;

/// Where a character is in its stride, and the gait blend its speed selects.
#[derive(Component, Debug, Clone, Copy)]
pub struct Cadence {
    pub phase: f32,
    pub speed: f32,
    /// Ground speed eased toward the real one, so the gait mix does not jump with the velocity.
    pub pace: f32,
    /// Body facing, which the stride frame hangs off.
    pub forward: Vec3,
    /// Planar travel used to predict where the body will be: along facing unless a heading holds it elsewhere.
    pub velocity: Vec3,
    /// Travel direction off facing in degrees, right positive.
    pub direction: f32,
    /// Facing yaw in radians, and how fast it is changing.
    pub yaw: f32,
    pub turn_rate: f32,
    /// Smoothed signed facing turn, radians per second, left positive.
    pub turn: f32,
    pub leg_length: f32,
    pub blend: Option<GaitBlend>,
    /// Whether the legs are being generated this frame rather than played.
    pub stepping: bool,
    /// How much of the lower body is procedural right now, faded in and out around the walk.
    pub weight: f32,
    /// Phase left to run after a stop so the airborne foot lands before the legs fade.
    pub settle: Option<f32>,
    /// Extra model drop so both feet stay reachable, smoothed.
    pub reach_drop: f32,
    /// How much of that drop is currently applied to the model root, restored before the next is applied.
    pub root_drop: f32,
    /// Seconds the last stride advance covered, and the clock multiplier it ran at.
    pub frame_dt: f32,
    pub rate: f32,
    /// Foot contacts the baked pose says are down this frame, left then right.
    pub contact: (bool, bool),
    /// Stride seconds of the pose clip being played, already scaled to the body's speed; the clock uses it over the gait curves when set.
    pub clip_period: Option<f32>,
    /// How much higher the played pose must sit so its planted ankle rests at the rig's bind ankle height; learned from each stance.
    pub floor_fix: f32,
    /// Strides completed since the walk began, so a loop with several baked strides plays them all in turn.
    pub stride_count: u32,
    /// Stride count when the playing clip last changed, so freshly cut stances can be told from settled ones.
    pub clip_since: u32,
    /// Which pose clip is playing and the stride it was chosen on; a clip is chosen once per stride so lanes and arcs cannot flicker mid-step.
    pub clip: Option<(usize, u32)>,
    /// The two loops either side of the pace this stride, blended by it; `clip` is whichever leads.
    pub pair: Option<(usize, usize)>,
    /// The same pair one direction lane over, blended in by how far the travel sits past `lane_base` degrees, when a heading locks the facing.
    pub pair2: Option<(usize, usize)>,
    pub lane_base: f32,
    pub locked: bool,
    /// Fastest ground speed the loops of the lane the stick points down actually cover, so a locked body is not driven faster than its strafe was captured.
    pub lane_cap: f32,
    /// Direction the body last travelled at walking pace, kept across a brake so a key gap holds the travel and not the facing.
    pub travel: Vec3,
    /// How many stances have fed the floor fix, so early ones weigh more.
    pub floor_samples: u32,
    /// Whether the body stands on ground this frame, so the played pose may own the legs.
    pub grounded: bool,
    /// Seconds since the ground probe last hit; a miss shorter than the grace keeps the pose on the ground.
    pub air: f32,
    /// The raw ground probe, and the body's vertical speed, for the jump.
    pub touching: bool,
    pub rise: f32,
    /// Where a jump is: the takeoff shot, the rise mapped to vertical speed, or the fall loop; the landing is a plain shot.
    pub flight: Option<Flight>,
    /// Set by the pose on the takeoff frame; the movement applies the jump impulse and clears it.
    pub launch: bool,
    /// Fastest the body rose and fell this flight: the rise maps the takeoff clip, the fall picks the landing.
    pub rise_top: f32,
    pub fall_speed: f32,
    /// Where the baked idle loop is, in turns.
    pub idle_phase: f32,
    /// A turn, start or stop clip playing once through, which owns the facing and the velocity while it runs.
    pub shot: Option<Shot>,
    /// World velocity the running shot asks for, and the facing it has turned the body to.
    pub shot_velocity: Vec3,
    pub shot_facing: Vec3,
    /// Ground speed the frame before, so a stop can hold the pace the body had until its clip begins.
    pub prior_speed: f32,
    /// The pose is holding the body between clips: facing and velocity come from `shot_facing` and `shot_velocity` as during a shot.
    pub hold: bool,
    /// Seconds the stick has been released while walking, so a tap does not start a stop.
    pub release: f32,
}

/// A jump in progress: the takeoff plays as a shot, then the rise follows the vertical speed through the clip's frames from `off` to `apex`, then the fall loop runs by time.
#[derive(Debug, Clone, Copy, PartialEq)]
pub enum Flight {
    Takeoff,
    Rise { clip: usize, off: f32, apex: f32 },
    Fall { frame: f32 },
}

/// One pass through a one-shot clip: which clip, how far in, and the facing it started from.
#[derive(Debug, Clone, Copy)]
pub struct Shot {
    pub clip: usize,
    pub frame: f32,
    /// Frame the shot ends on, and the clip heading at its first frame.
    pub end: f32,
    pub heading: f32,
    pub facing: Vec3,
    /// Whether the clip's root heading turns the body; a start or stop holds its facing.
    pub turns: bool,
    /// Frame the shot began on.
    pub start: f32,
    /// Extra yaw (radians) already added by `steer_from`, and the rest spread evenly from there to the end so the shot lands facing the stick.
    pub steered: f32,
    pub steer_from: f32,
    pub steer: f32,
}

impl Cadence {
    pub fn new(leg_length: f32) -> Self {
        Self {
            phase: 0.0,
            speed: 0.0,
            pace: 0.0,
            forward: Vec3::NEG_Z,
            velocity: Vec3::ZERO,
            direction: 0.0,
            yaw: 0.0,
            turn_rate: 0.0,
            turn: 0.0,
            leg_length,
            blend: None,
            stepping: false,
            weight: 0.0,
            settle: None,
            reach_drop: 0.0,
            root_drop: 0.0,
            frame_dt: 0.0,
            rate: 1.0,
            contact: (false, false),
            clip_period: None,
            floor_fix: 0.0,
            stride_count: 0,
            clip_since: 0,
            clip: None,
            pair: None,
            pair2: None,
            lane_base: 0.0,
            locked: false,
            lane_cap: f32::INFINITY,
            travel: Vec3::NEG_Z,
            floor_samples: 0,
            grounded: false,
            air: 0.0,
            touching: false,
            rise: 0.0,
            flight: None,
            launch: false,
            rise_top: 0.0,
            fall_speed: 0.0,
            idle_phase: 0.0,
            shot: None,
            shot_velocity: Vec3::ZERO,
            shot_facing: Vec3::NEG_Z,
            prior_speed: 0.0,
            hold: false,
            release: 0.0,
        }
    }
}

/// The bones the clip is masked off while legs are procedural, with their bind pose, and the model root that carries the pelvis bob.
#[derive(Component)]
pub struct LowerBody {
    pub model: Entity,
    pub model_rest: Transform,
    pub bones: Vec<(Entity, Transform)>,
    pub legs: Vec<LegRig>,
    pub pelvis: Option<PelvisRig>,
    /// Spine segments from the hips up, for the lean into a turn.
    pub spine: Vec<Entity>,
    /// Bind-pose height of the hip joints above the ankle bones, in world metres, so the data's hip height can be set absolutely.
    pub hip_rest: f32,
    /// Lower-body bones by canonical role, with what a baked pose needs to land on them.
    pub roles: Vec<RoleBone>,
}

/// One bone a pose database drives: its rest orientation in model space, and its parent's rest so a model-space target can be turned back into a local rotation.
#[derive(Debug, Clone, Copy)]
pub struct RoleBone {
    pub role: &'static str,
    pub bone: Entity,
    pub parent: Option<Entity>,
    pub rest: Transform,
    pub parent_rest: Transform,
    /// Unit direction from this joint to its child joint at rest, in model space; zero for leaves.
    pub rest_dir: Vec3,
}

/// Canonical name of a lower-body role as the pose bake writes it.
fn role_name(bone: kinetree::Bone) -> Option<&'static str> {
    use kinetree::{Bone, Side};
    Some(match bone {
        Bone::Pelvis => "pelvis",
        Bone::Thigh(Side::Left) => "thigh_l",
        Bone::Thigh(Side::Right) => "thigh_r",
        Bone::Calf(Side::Left) => "calf_l",
        Bone::Calf(Side::Right) => "calf_r",
        Bone::Foot(Side::Left) => "foot_l",
        Bone::Foot(Side::Right) => "foot_r",
        Bone::Ball(Side::Left) => "ball_l",
        Bone::Ball(Side::Right) => "ball_r",
        Bone::Spine(0) => "spine_0",
        Bone::Spine(1) => "spine_1",
        Bone::Spine(2) => "spine_2",
        Bone::Spine(3) => "spine_3",
        Bone::Spine(4) => "spine_4",
        Bone::Neck => "neck",
        Bone::Head => "head",
        Bone::Clavicle(Side::Left) => "clavicle_l",
        Bone::Clavicle(Side::Right) => "clavicle_r",
        Bone::UpperArm(Side::Left) => "upperarm_l",
        Bone::UpperArm(Side::Right) => "upperarm_r",
        Bone::LowerArm(Side::Left) => "lowerarm_l",
        Bone::LowerArm(Side::Right) => "lowerarm_r",
        Bone::Hand(Side::Left) => "hand_l",
        Bone::Hand(Side::Right) => "hand_r",
        _ => return None,
    })
}

/// The pelvis bone with its bind orientation in model space and its parent's, so a data yaw and roll can be composed onto it.
#[derive(Debug, Clone, Copy)]
pub struct PelvisRig {
    pub bone: Entity,
    pub rest: Quat,
    pub parent_rest: Quat,
}

/// One leg's procedural fixings: the calf pre-bend that picks the knee side, and the foot's bind orientation in model space.
#[derive(Debug, Clone, Copy)]
pub struct LegRig {
    pub thigh: Entity,
    pub calf: Entity,
    pub foot: Entity,
    pub right: bool,
    pub prebend: Quat,
    pub foot_rest: Quat,
}

/// How far the knee is folded before each solve so the hinge never picks the backward root.
const KNEE_PREBEND: f32 = 0.2;

/// The animation root of a character, awaiting a graph if locomotion was not ready when it was wired.
#[derive(Component)]
pub struct Armature;

fn build_locomotion(
    mut commands: Commands,
    assets: Res<AssetServer>,
    mut rig: ResMut<Rig>,
    profiles: Res<Assets<RigProfile>>,
    libraries: Res<Assets<Gltf>>,
    mut graphs: ResMut<Assets<AnimationGraph>>,
    mask: Option<Res<RigMask>>,
) {
    let Some(profile) = profiles.get(&rig.profile) else {
        return;
    };
    let library = rig
        .library
        .get_or_insert_with(|| assets.load(profile.library.clone()))
        .clone();
    let Some(library) = libraries.get(&library) else {
        return;
    };
    let Some(locomotion) = assemble(profile, library, &mut graphs) else {
        return;
    };
    info!(
        "locomotion built from {} ({} named clips)",
        profile.library,
        library.named_animations.len()
    );
    if let Some(mask) = mask
        && let Some(mut graph) = graphs.get_mut(&locomotion.graph)
    {
        for (id, half) in &mask.0 {
            graph.add_target_to_mask_group(*id, *half);
        }
    }
    commands.insert_resource(locomotion);
}

fn assemble(
    profile: &RigProfile,
    library: &Gltf,
    graphs: &mut Assets<AnimationGraph>,
) -> Option<Locomotion> {
    let clip = |name: &str| {
        let handle = library.named_animations.get(name).cloned();
        if handle.is_none() {
            error!("clip {name:?} is not in {}", profile.library);
        }
        handle
    };
    let gaits = gait_handles(&profile.gaits, clip)?;

    let mut graph = AnimationGraph::new();
    let root = graph.root;
    let whole = graph.add_blend(1.0, root);
    let legs = graph.add_blend_with_mask(1 << UPPER_BODY, 1.0, root);
    let arms = graph.add_blend_with_mask(1 << LOWER_BODY, 1.0, root);

    let whole_gaits = add_gaits(&mut graph, &gaits, whole);
    let legs_gaits = add_gaits(&mut graph, &gaits, legs);
    let torso_gaits = add_gaits(&mut graph, &gaits, arms);
    let contacts = &profile.gaits;
    let torso_sync = vec![
        (torso_gaits.idle, gaits[0].clone(), contacts.idle.contact),
        (torso_gaits.walk, gaits[1].clone(), contacts.walk.contact),
        (torso_gaits.jog, gaits[2].clone(), contacts.jog.contact),
        (
            torso_gaits.sprint,
            gaits[3].clone(),
            contacts.sprint.contact,
        ),
        (torso_gaits.jump, gaits[4].clone(), contacts.jump.contact),
        (torso_gaits.back, gaits[5].clone(), contacts.back.contact),
        (torso_gaits.left, gaits[6].clone(), contacts.left.contact),
        (torso_gaits.right, gaits[7].clone(), contacts.right.contact),
    ];

    let mut one_shot = |name: &str, parent| {
        let handle = clip(name)?;
        Some(Clip {
            node: graph.add_clip(handle.clone(), 1.0, parent),
            handle,
        })
    };
    let jab = Attack {
        clip: one_shot(&profile.attacks.jab, arms)?,
    };
    let cross = Attack {
        clip: one_shot(&profile.attacks.cross, arms)?,
    };
    let cast_channel = one_shot(&profile.casts.channel, arms)?;
    let cast_release = one_shot(&profile.casts.release, arms)?;
    let cast_poison = one_shot(&profile.casts.poison, arms)?;
    let hit = one_shot(&profile.hit, arms)?;
    let death = one_shot(&profile.death, whole)?;

    Some(Locomotion {
        whole: whole_gaits,
        legs: legs_gaits,
        torso: torso_gaits,
        torso_sync,
        jab,
        cross,
        cast_channel,
        cast_release,
        cast_poison,
        hit,
        death,
        graph: graphs.add(graph),
    })
}

fn gait_handles(
    names: &GaitClips,
    mut clip: impl FnMut(&str) -> Option<Handle<AnimationClip>>,
) -> Option<[Handle<AnimationClip>; 8]> {
    Some([
        clip(&names.idle.clip)?,
        clip(&names.walk.clip)?,
        clip(&names.jog.clip)?,
        clip(&names.sprint.clip)?,
        clip(&names.jump.clip)?,
        clip(&names.back.clip)?,
        clip(&names.left.clip)?,
        clip(&names.right.clip)?,
    ])
}

/// Wires the eight gait clips under one branch of the graph.
fn add_gaits(
    graph: &mut AnimationGraph,
    clips: &[Handle<AnimationClip>; 8],
    parent: AnimationNodeIndex,
) -> Gaits {
    let mut add = |index: usize| graph.add_clip(clips[index].clone(), 1.0, parent);
    Gaits {
        idle: add(0),
        walk: add(1),
        jog: add(2),
        sprint: add(3),
        jump: add(4),
        back: add(5),
        left: add(6),
        right: add(7),
    }
}

/// Spawns a character at `position` and returns it, ready for something to
/// write its [`MoveIntent`].
pub fn spawn_character(commands: &mut Commands, position: Vec3) -> Entity {
    commands
        .spawn((
            Character,
            MoveIntent::default(),
            Grounded(false),
            Gait::Idle,
            Bearing::default(),
            Heading::default(),
            super::action::Arms::default(),
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
        .id()
}

fn dress(
    mut commands: Commands,
    assets: Res<AssetServer>,
    mut rig: ResMut<Rig>,
    profiles: Res<Assets<RigProfile>>,
    bare: Query<Entity, (With<Character>, Without<Dressed>)>,
) {
    let Some(profile) = profiles.get(&rig.profile) else {
        return;
    };
    if rig.gaits.is_none() {
        rig.gaits = Some(assets.load(profile.gait_set.clone()));
    }
    if rig.poses.is_none()
        && let Some(path) = profile.pose_set.as_ref()
    {
        rig.poses = Some(assets.load(path.clone()));
    }
    for character in &bare {
        commands
            .spawn((
                CharacterModel,
                WorldAssetRoot(
                    assets.load(GltfAssetLabel::Scene(0).from_asset(profile.model.clone())),
                ),
                Transform::from_xyz(0.0, MODEL_DROP, 0.0)
                    .with_rotation(Quat::from_rotation_y(MODEL_FACING)),
                ChildOf(character),
            ))
            .observe(wire_skeleton);
        commands.entity(character).insert(Dressed);
    }
}

fn bind_graph(
    mut commands: Commands,
    locomotion: Option<Res<Locomotion>>,
    unbound: Query<Entity, (With<Armature>, Without<AnimationGraphHandle>)>,
) {
    let Some(locomotion) = locomotion else {
        return;
    };
    for armature in &unbound {
        commands
            .entity(armature)
            .insert(AnimationGraphHandle(locomotion.graph.clone()));
    }
}

/// Everything the skeleton wiring reads about the rig and its shared graph.
#[derive(SystemParam)]
struct RigState<'w> {
    locomotion: Option<Res<'w, Locomotion>>,
    rig: Res<'w, Rig>,
    profiles: Res<'w, Assets<RigProfile>>,
    mask: Option<Res<'w, RigMask>>,
    graphs: ResMut<'w, Assets<AnimationGraph>>,
}

/// Runs once the glTF has actually spawned its entities. Nothing about the
/// skeleton exists before this: `WorldAssetRoot` only queues the load, so a
/// startup system that looked for `thigh_l` would find nothing.
fn wire_skeleton(
    event: On<WorldInstanceReady>,
    mut commands: Commands,
    mut state: RigState,
    parents: Query<&ChildOf>,
    transforms: Query<&Transform>,
    children: Query<&'static Children>,
    names: Query<&'static Name>,
) {
    let model = event.entity;
    let Ok(character) = parents.get(model).map(ChildOf::parent) else {
        return;
    };
    let RigState {
        locomotion,
        rig,
        profiles,
        mask,
        graphs,
    } = &mut state;
    let Some(profile) = profiles.get(&rig.profile) else {
        warn!("rig profile unloaded while a character spawned; nothing to animate");
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
    let Some(armature) = find_bone(model, &profile.armature, &names, &children) else {
        warn!("character model has no Armature node; nothing to animate");
        return;
    };

    commands.entity(armature).insert((
        Armature,
        AnimationPlayer::default(),
        AnimationTransitions::new(),
    ));
    if let Some(locomotion) = locomotion.as_ref() {
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
    wanted.insert(profile.pelvis.as_str(), Entity::PLACEHOLDER);
    for limb in &profile.legs {
        for name in [&limb.root, &limb.mid, &limb.tip] {
            wanted.insert(name.as_str(), Entity::PLACEHOLDER);
        }
    }
    let mut path = Vec::new();
    let mut bones = Vec::new();
    retarget(
        armature,
        &mut path,
        // The armature itself is not a bone. Starting at the lower half means
        // anything above the first recognised bone inherits the legs, which is
        // the safe default: the alternative hands a stray root node to the arms
        // and lets a punch translate the character.
        LOWER_BODY,
        &mut Walk {
            names: &names,
            children: &children,
            wanted: &mut wanted,
            bones: &mut bones,
        },
    );

    for (bone, id, _) in &bones {
        commands.entity(*bone).insert((*id, AnimatedBy(armature)));
    }

    if mask.is_none() {
        commands.insert_resource(RigMask(
            bones.iter().map(|(_, id, half)| (*id, *half)).collect(),
        ));
    }
    if let Some(locomotion) = locomotion.as_ref()
        && let Some(mut graph) = graphs.get_mut(&locomotion.graph)
        && graph.mask_groups.is_empty()
    {
        for (_, id, half) in &bones {
            graph.add_target_to_mask_group(*id, *half);
        }
    }

    let mut leg_length = 0.0;
    let mut hip_rest = 0.0;
    let mut legs = Vec::new();
    for limb in &profile.legs {
        if let Some((length, rig)) = spawn_leg(
            &mut commands,
            (character, model),
            profile,
            limb,
            &wanted,
            &transforms,
            &parents,
        ) {
            leg_length = length.0;
            hip_rest = length.1;
            legs.push(rig);
        }
    }
    let lower = bones
        .iter()
        .filter(|(_, _, half)| *half == LOWER_BODY)
        .filter_map(|(bone, _, _)| transforms.get(*bone).ok().map(|t| (*bone, *t)))
        .collect();
    let model_rest = transforms.get(model).copied().unwrap_or_default();
    let named: Vec<(Entity, &'static str)> = bones
        .iter()
        .filter_map(|(bone, _, _)| names.get(*bone).ok().map(|name| (*bone, name)))
        .filter_map(|(bone, name)| Some((bone, role_name(kinetree::role_of(name.as_str())?)?)))
        .collect();
    let child_of = |role: &str| -> Option<&'static str> {
        Some(match role {
            "thigh_l" => "calf_l",
            "calf_l" => "foot_l",
            "foot_l" => "ball_l",
            "thigh_r" => "calf_r",
            "calf_r" => "foot_r",
            "foot_r" => "ball_r",
            "upperarm_l" => "lowerarm_l",
            "lowerarm_l" => "hand_l",
            "upperarm_r" => "lowerarm_r",
            "lowerarm_r" => "hand_r",
            "neck" => "head",
            _ => return None,
        })
    };
    let roles: Vec<RoleBone> = named
        .iter()
        .map(|(bone, role)| {
            let parent = parents.get(*bone).map(ChildOf::parent).ok();
            let rest = rest_in_model(*bone, model, &transforms, &parents);
            let rest_dir = child_of(role)
                .and_then(|c| named.iter().find(|(_, r)| *r == c))
                .map(|(child, _)| {
                    (rest_in_model(*child, model, &transforms, &parents).translation
                        - rest.translation)
                        .normalize_or_zero()
                })
                .unwrap_or(Vec3::ZERO);
            RoleBone {
                role,
                bone: *bone,
                parent,
                rest,
                parent_rest: parent
                    .map(|p| rest_in_model(p, model, &transforms, &parents))
                    .unwrap_or_default(),
                rest_dir,
            }
        })
        .collect();
    let spine: Vec<Entity> = bones
        .iter()
        .filter_map(|(bone, _, _)| names.get(*bone).ok().map(|name| (*bone, name)))
        .filter(|(_, name)| {
            matches!(
                kinetree::role_of(name.as_str()),
                Some(kinetree::Bone::Spine(_))
            )
        })
        .map(|(bone, _)| bone)
        .collect();
    let pelvis = wanted
        .get(profile.pelvis.as_str())
        .copied()
        .filter(|e| *e != Entity::PLACEHOLDER)
        .map(|bone| {
            let parent = parents.get(bone).map(ChildOf::parent).ok();
            PelvisRig {
                bone,
                rest: rest_in_model(bone, model, &transforms, &parents).rotation,
                parent_rest: parent
                    .map(|p| rest_in_model(p, model, &transforms, &parents).rotation)
                    .unwrap_or(Quat::IDENTITY),
            }
        });
    commands.entity(character).insert((
        Cadence::new(leg_length),
        super::pose::Inertia::default(),
        LowerBody {
            model,
            model_rest,
            bones: lower,
            legs,
            pelvis,
            spine,
            hip_rest,
            roles,
        },
    ));
}

/// A bone's rest transform relative to the model root.
fn rest_in_model(
    bone: Entity,
    model: Entity,
    transforms: &Query<&Transform>,
    parents: &Query<&ChildOf>,
) -> Transform {
    let mut accumulated = transforms.get(bone).copied().unwrap_or_default();
    let mut current = bone;
    while let Ok(parent) = parents.get(current) {
        current = parent.parent();
        if current == model {
            break;
        }
        if let Ok(local) = transforms.get(current) {
            accumulated = local.mul_transform(accumulated);
        }
    }
    accumulated
}

fn spawn_leg(
    commands: &mut Commands,
    owner: (Entity, Entity),
    profile: &RigProfile,
    limb: &LimbSpec,
    wanted: &HashMap<&str, Entity>,
    transforms: &Query<&Transform>,
    parents: &Query<&ChildOf>,
) -> Option<((f32, f32), LegRig)> {
    let (character, model) = owner;
    let found = |name: &str| {
        wanted
            .get(name)
            .copied()
            .filter(|e| *e != Entity::PLACEHOLDER)
    };
    let (Some(root), Some(mid), Some(tip)) =
        (found(&limb.root), found(&limb.mid), found(&limb.tip))
    else {
        warn!(
            "leg {}/{}/{} not found under the character model",
            limb.root, limb.mid, limb.tip
        );
        return None;
    };
    let joint = |bone: Entity| rest_in_model(bone, model, transforms, parents).translation;
    let model_scale = transforms
        .get(model)
        .map(|t| t.scale.max_element())
        .unwrap_or(1.0);
    let leg_length =
        (joint(root).distance(joint(mid)) + joint(mid).distance(joint(tip))) * model_scale;
    let hip_rest = (joint(root).y - joint(tip).y) * model_scale;
    let rest_knee = {
        let a = joint(root) - joint(mid);
        let b = joint(tip) - joint(mid);
        180.0 - a.angle_between(b).to_degrees()
    };
    info!(
        "leg {} length {:.3} m, hip {:.3} m above ankle at bind, rest knee {:.1} deg (model scale {:.2})",
        limb.tip, leg_length, hip_rest, rest_knee, model_scale
    );

    let thigh = rest_in_model(root, model, transforms, parents);
    let calf = transforms.get(mid).copied().unwrap_or_default();
    let foot = transforms.get(tip).copied().unwrap_or_default();
    let foot_rest = rest_in_model(tip, model, transforms, parents).rotation;
    let axis = limb
        .rest()
        .map(|rest| rest.axis_local())
        .unwrap_or(Vec3::NEG_X);
    let foot_z = |turn: Quat| {
        let bent = Transform {
            rotation: turn * calf.rotation,
            ..calf
        };
        thigh.mul_transform(bent).mul_transform(foot).translation.z
    };
    let forward = Quat::from_axis_angle(axis, KNEE_PREBEND);
    let backward = Quat::from_axis_angle(axis, -KNEE_PREBEND);
    let prebend = if foot_z(forward) < foot_z(backward) {
        forward
    } else {
        backward
    };

    commands.spawn((
        IkLimbBones { root, mid, tip },
        IkLimb {
            rest: limb.rest(),
            limits: limb.limits(),
            weight: 0.0,
            ..default()
        },
        FootGoal::new(character, profile.ankle_height, limb.tip.ends_with("_r")),
    ));
    Some((
        (leg_length, hip_rest),
        LegRig {
            thigh: root,
            calf: mid,
            foot: tip,
            right: limb.tip.ends_with("_r"),
            prebend,
            foot_rest,
        },
    ))
}

/// Everything the skeleton walk carries down the tree with it.
///
/// A struct rather than a longer parameter list, because one traversal does
/// every per-bone job there is: naming, IK lookup and mask assignment. Walking
/// 69 nodes three times to keep the signatures short would be a poor trade at
/// one character and a worse one at a thousand.
///
/// It collects rather than acts. `Commands` here would tie the queries'
/// lifetimes to the command buffer's, and the walk has nothing to say that
/// cannot be said afterwards.
struct Walk<'a, 'k, 'wn, 'sn, 'wc, 'sc> {
    names: &'a Query<'wn, 'sn, &'static Name>,
    children: &'a Query<'wc, 'sc, &'static Children>,
    wanted: &'a mut HashMap<&'k str, Entity>,
    /// Every bone, the animation id a clip binds to it by, and the half of the
    /// body it belongs to.
    bones: &'a mut Vec<(Entity, AnimationTargetId, u32)>,
}

/// Finds the identity a clip binds each bone by -- the hash of its name path
/// from the animation root -- and which half of the body it drives. Mirrors what
/// bevy's glTF loader does for a file that has clips.
fn retarget(entity: Entity, path: &mut Vec<Name>, half: u32, walk: &mut Walk) {
    // An unnamed node cannot be addressed by a clip, and neither can anything
    // below it, since the path would have a hole in it. bevy's loader warns and
    // drops the subtree here too.
    let Ok(name) = walk.names.get(entity) else {
        return;
    };
    path.push(name.clone());

    let id = AnimationTargetId::from_names(path.iter());
    let half = mask_group(name.as_str(), half);
    walk.bones.push((entity, id, half));

    if let Some(slot) = walk.wanted.get_mut(name.as_str()) {
        *slot = entity;
    }
    for child in walk.children.get(entity).into_iter().flatten() {
        retarget(*child, path, half, walk);
    }
    path.pop();
}

/// Walks a spawned hierarchy and returns the first entity carrying `name`.
pub fn find_bone(
    root: Entity,
    name: &str,
    names: &Query<&'static Name>,
    children: &Query<&'static Children>,
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

/// Every character the mover drives, with the ground contact and cadence that decide whether it drives at all.
/// A frozen body has stopped driving itself; the death clip owns it from then on.
type Driven = (With<Character>, Without<super::action::Frozen>);

type MovingCharacters<'w, 's> = Query<
    'w,
    's,
    (
        Entity,
        &'static Transform,
        &'static mut MoveIntent,
        &'static Heading,
        &'static mut LinearVelocity,
        &'static mut Grounded,
        &'static ShapeHits,
        Option<&'static mut Cadence>,
    ),
    Driven,
>;

fn apply_movement(time: Res<Time>, spatial: SpatialQuery, mut characters: MovingCharacters) {
    let nose = Collider::sphere(CHARACTER_RADIUS * 0.9);
    for (entity, transform, mut intent, heading, mut velocity, mut grounded, hits, mut cadence) in
        &mut characters
    {
        grounded.0 = !hits.is_empty();
        let wall = Dir3::new(intent.wish).ok().and_then(|dir| {
            spatial
                .cast_shape(
                    &nose,
                    transform.translation,
                    Quat::IDENTITY,
                    dir,
                    &ShapeCastConfig::from_max_distance(WALL_REACH),
                    &SpatialQueryFilter::default().with_excluded_entities([entity]),
                )
                .map(|hit| hit.normal1)
                .filter(|normal| normal.y.abs() < WALL_LEAN)
                .map(|normal| Vec3::new(normal.x, 0.0, normal.z).normalize_or_zero())
                .filter(|normal| normal.length_squared() > 0.5)
        });
        let slide = |v: Vec3| match wall {
            Some(normal) if v.dot(normal) < 0.0 => v - normal * v.dot(normal),
            _ => v,
        };
        intent.blocked = wall.is_some() && slide(intent.wish).length() < WALL_GLANCE;
        if let Some(cadence) = cadence.as_deref_mut()
            && cadence.launch
        {
            cadence.launch = false;
            velocity.y = JUMP_SPEED;
            grounded.0 = false;
        }
        let cadence = cadence.as_deref();
        if let Some(cadence) = cadence
            && (cadence.shot.is_some() || cadence.hold)
            && grounded.0
        {
            let along = slide(cadence.shot_velocity);
            velocity.x = along.x;
            velocity.z = along.z;
            continue;
        }

        // A heading means something is selected, which means a fight, which
        // means running. Holding a modifier for the whole of every fight is the
        // same thing as not having a modifier.
        let stance = heading.0.is_some();
        let base = if intent.run || stance {
            RUN_SPEED
        } else {
            WALK_SPEED
        };

        // Taken from the intent rather than the bearing, which is computed from
        // the velocity this system is about to write and would therefore be a
        // frame behind its own cause.
        let retreating = heading.0.is_some_and(|heading| {
            let facing = Vec3::new(heading.x, 0.0, heading.z).normalize_or_zero();
            intent.wish.dot(facing) < BACKPEDAL_ARC
        });

        let speed = if retreating { base * BACKPEDAL } else { base };
        let speed = match cadence {
            Some(cadence) if stance => speed.min(cadence.lane_cap),
            _ => speed,
        };
        let wish = slide(intent.wish * speed);

        let planar = Vec3::new(velocity.x, 0.0, velocity.z);
        let dt = time.delta_secs();
        let next = if !grounded.0 {
            planar.lerp(wish, 0.12)
        } else {
            steer(planar, wish, dt)
        };
        velocity.x = next.x;
        velocity.z = next.z;

        if grounded.0 && intent.jump && cadence.is_none() {
            velocity.y = JUMP_SPEED;
        }
    }
}

/// Moves ground velocity toward `wish`: speed climbs at [`GROUND_ACCEL`] and settles at [`GROUND_DECEL`], a release brakes instantly, and heading swings round at [`TURN_RATE`] so a turn is an arc the feet can walk rather than a sideways jump. A near reversal skips the arc and reverses outright.
fn steer(planar: Vec3, wish: Vec3, dt: f32) -> Vec3 {
    let speed = planar.length();
    let want = wish.length();
    let target = if want <= f32::EPSILON {
        0.0
    } else if want <= speed {
        (speed - GROUND_DECEL * dt).max(want)
    } else {
        (speed + GROUND_ACCEL * dt).min(want)
    };
    if target <= f32::EPSILON {
        return Vec3::ZERO;
    }
    let from = if speed > f32::EPSILON {
        planar / speed
    } else {
        wish / want
    };
    let to = wish / want;
    let angle = from.dot(to).clamp(-1.0, 1.0).acos();
    if angle <= f32::EPSILON || angle > REVERSAL_ARC {
        return to * target;
    }
    let step = (TURN_RATE * dt).min(angle);
    let axis = from.cross(to).normalize_or(Vec3::Y);
    Quat::from_axis_angle(axis, step) * from * target
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

/// Decides whether the character is walking forwards, backwards or sideways.
///
/// Scored rather than branched, so the four cases share one rule and the
/// hysteresis applies to all of them the same way.
fn pick_bearing(mut characters: Query<(&LinearVelocity, &Heading, &mut Bearing), With<Character>>) {
    for (velocity, heading, mut bearing) in &mut characters {
        let Some(heading) = heading.0 else {
            bearing.set_if_neq(Bearing::Forward);
            continue;
        };

        let planar = Vec3::new(velocity.x, 0.0, velocity.z);
        // Standing still holds the last bearing instead of snapping to forward:
        // stopping mid-backstep should settle into idle, not spin the model
        // round for the two frames it takes to decelerate.
        let Some(travel) = planar.try_normalize() else {
            continue;
        };

        let forward = Vec3::new(heading.x, 0.0, heading.z).normalize_or_zero();
        let right = forward.cross(Vec3::Y);
        let along = travel.dot(forward);
        let across = travel.dot(right);

        let scores = [
            (Bearing::Forward, along),
            (Bearing::Back, -along),
            (Bearing::Left, -across),
            (Bearing::Right, across),
        ];
        let current = scores
            .iter()
            .find(|(candidate, _)| *candidate == *bearing)
            .map_or(0.0, |(_, score)| *score);

        if let Some((best, _)) = scores
            .iter()
            .max_by(|a, b| a.1.total_cmp(&b.1))
            .filter(|(_, score)| *score > current + BEARING_HYSTERESIS)
        {
            *bearing = *best;
        }
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
    velocities: Query<(&LinearVelocity, &Heading, Option<&Cadence>), With<Character>>,
    mut models: Query<(&mut Transform, &ChildOf), With<CharacterModel>>,
) {
    let dt = time.delta_secs();
    for (mut transform, parent) in &mut models {
        let Ok((velocity, heading, cadence)) = velocities.get(parent.parent()) else {
            continue;
        };
        if let Some(cadence) = cadence
            && (cadence.shot.is_some() || cadence.hold)
        {
            transform.rotation = Quat::from_rotation_arc(Vec3::NEG_Z, cadence.shot_facing)
                * Quat::from_rotation_y(MODEL_FACING);
            continue;
        }
        // A heading wins outright, and unlike travel it holds while standing
        // still: a character that stops moving should keep looking at whatever
        // it was looking at.
        let facing = match heading.0 {
            Some(heading) => Vec3::new(heading.x, 0.0, heading.z).normalize_or_zero(),
            None => {
                let planar = Vec3::new(velocity.x, 0.0, velocity.z);
                if planar.length_squared() < 0.25 {
                    continue;
                }
                planar.normalize()
            }
        };
        if facing == Vec3::ZERO {
            continue;
        }
        // The body no longer carries the facing, so the model's own local
        // rotation has to be the whole of it: the heading, then the correction
        // for a rig that was authored looking down +Z.
        let target =
            Quat::from_rotation_arc(Vec3::NEG_Z, facing) * Quat::from_rotation_y(MODEL_FACING);
        let angle = transform.rotation.angle_between(target);
        let step = if angle > f32::EPSILON {
            ((FACE_RATE * dt) / angle).min(1.0)
        } else {
            1.0
        };
        transform.rotation = transform.rotation.slerp(target, step);
    }
}

/// What choosing a locomotion clip needs: the gait, the direction it is
/// travelling in, and where to play the result.
type Stride = (
    Ref<'static, Gait>,
    Ref<'static, Bearing>,
    &'static LinearVelocity,
    &'static CharacterAnimator,
    Has<super::action::Action>,
    Option<&'static Cadence>,
);

fn drive_gait(
    locomotion: Option<Res<Locomotion>>,
    playback: Res<super::pose::PosePlayback>,
    clips: Res<Assets<AnimationClip>>,
    characters: Query<Stride, Without<super::action::Frozen>>,
    mut players: Query<(&mut AnimationPlayer, &mut AnimationTransitions)>,
) {
    let Some(locomotion) = locomotion else {
        return;
    };
    // Characters mid-action are no longer excluded. They used to be, because an
    // action replaced the whole animation and a gait change would cut it short;
    // now the two occupy different halves of the body, so the legs must keep
    // being driven while the arms are busy.
    for (gait, bearing, velocity, animator, acting, cadence) in &characters {
        let Ok((mut player, mut transitions)) = players.get_mut(animator.0) else {
            continue;
        };
        // The same eight clips either way. The only difference is which branch
        // of the graph they are on, and therefore which bones they are allowed
        // to touch.
        let stepping = cadence.is_some_and(|c| c.weight >= 0.99 || (playback.on && c.grounded));
        let gaits = if stepping {
            &locomotion.torso
        } else if acting {
            &locomotion.legs
        } else {
            &locomotion.whole
        };
        // Bearing is checked before the gait for everything that moves: there is
        // one backpedal cycle and one strafe cycle either side, and no walking
        // or sprinting variants of them to choose between.
        let node = match (*gait, *bearing) {
            (Gait::Idle, _) => gaits.idle,
            (Gait::Airborne, _) => gaits.jump,
            (_, Bearing::Back) => gaits.back,
            (_, Bearing::Left) => gaits.left,
            (_, Bearing::Right) => gaits.right,
            (Gait::Walk, _) => gaits.walk,
            (Gait::Jog, _) => gaits.jog,
            (Gait::Sprint, _) => gaits.sprint,
        };
        // The backward and sideways clips are jog cycles whatever the gait, so
        // moving at anything but running pace makes the feet skate. Scaling
        // playback by the ratio of real speed to the speed the clip was authored
        // at puts the footfalls back on the ground.
        //
        // Bounded, because matching perfectly is not the goal: a clip slowed to
        // 0.4 tracked the ground exactly and read as wading. The floor trades a
        // little skate for a stride that still looks like walking. Forward gaits
        // need none of it -- there is a clip per speed already.
        let rate = if *bearing == Bearing::Forward {
            1.0
        } else {
            let planar = Vec2::new(velocity.x, velocity.z).length();
            (planar / DIRECTIONAL_REFERENCE).clamp(RATE_FLOOR, RATE_CEILING)
        };

        // Compared against what is actually playing rather than against change
        // detection. Three separate things pick the node -- the gait, the
        // bearing, and which branch of the graph the character is on -- and
        // asking the player what it is doing is both shorter than tracking all
        // three and correct on the frame the animator arrives, which change
        // detection on the gait was not.
        if transitions.get_main_animation() != Some(node) {
            transitions
                .play(&mut player, node, BLEND)
                .set_repeat(RepeatAnimation::Forever);
        }

        let sync = if stepping {
            cadence.and_then(|c| {
                let (_, handle, contact) =
                    locomotion.torso_sync.iter().find(|(n, _, _)| *n == node)?;
                let duration = clips.get(handle)?.duration();
                Some((c.phase + contact).rem_euclid(1.0) * duration)
            })
        } else {
            None
        };
        if let Some(active) = player.animation_mut(node) {
            match sync {
                Some(seek) => {
                    active.set_speed(0.0);
                    active.seek_to(seek);
                }
                None => {
                    active.set_speed(rate);
                }
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// `Driven` is what keeps `apply_movement` off a corpse; without it the
    /// controller kept steering a dead body at running speed, uphill.
    #[test]
    fn a_frozen_body_is_no_longer_driven() {
        let mut world = World::new();
        let living = world.spawn(Character).id();
        let corpse = world.spawn((Character, super::super::action::Frozen)).id();

        let mut driven = world.query_filtered::<Entity, Driven>();
        let matched: Vec<Entity> = driven.iter(&world).collect();

        assert!(matched.contains(&living));
        assert!(!matched.contains(&corpse));
    }

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
