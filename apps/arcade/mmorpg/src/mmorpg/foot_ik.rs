use avian3d::prelude::*;
use bevy::app::AnimationSystems;
use bevy::ecs::system::SystemParam;
use std::io::Write;
use std::sync::Mutex;

use bevy::platform::collections::HashMap;
use bevy::prelude::*;
use bevy::transform::TransformSystems;
use kinetree::{IkLimb, IkLimbBones, KinetreeSystems, bone_world_transform};

use super::character::{Cadence, Character, Flight, Grounded, Heading, LowerBody};
use super::pose::{PosePlayback, PoseSystems};
use super::rig::{GaitBlend, GaitSet, Rig, at};
use super::world::height_at;

/// How far above and below the current ankle the ground is looked for. Past
/// this the leg is over a cliff and the clip is left alone.
const PROBE_UP: f32 = 0.6;
const PROBE_DOWN: f32 = 2.5;

/// A foot the clip is holding this close to the ground is a planted foot, and
/// the solver owns it completely.
const PLANT_BAND: f32 = 0.06;

/// A foot the clip has lifted this far is mid-swing, and the clip owns it.
/// Between the two the solve fades out.
///
/// Without this split the swing foot is pinned to the ground every frame just
/// like the planted one, so a run cycle drags each leg down to the terrain and
/// the blend lets it spring back -- legs snapping between ground and air.
const SWING_BAND: f32 = 0.28;

/// Past this distance from the camera a character's feet are not solved at
/// all. The solve is cheap -- one atan2 and one acos -- but the raycast and
/// the two bone-chain walks in front of it are not, and at a thousand
/// characters the only ones worth paying for are the ones close enough to see
/// a foot on. The weight fades out rather than snapping, so a character
/// crossing the boundary does not pop.
const IK_RANGE: f32 = 25.0;

/// Rate at which a limb fades in and out as ground appears and disappears
/// under it. This is only for the ray finding or losing a surface -- a cliff
/// edge, a gap. The plant-versus-swing part of the weight is not filtered at
/// all: it is already a continuous function of the clip's own foot height, and
/// running it through a time constant made the solve lag the run cycle by
/// several frames.
const BLEND_RATE: f32 = 8.0;

pub struct FootIkPlugin;

impl Plugin for FootIkPlugin {
    fn build(&self, app: &mut App) {
        app.init_resource::<FootIkEnabled>()
            .init_resource::<FootIkDebug>()
            .init_resource::<FootIkMode>()
            .init_resource::<Support>()
            .insert_resource(Trace::from_env())
            .add_systems(Last, trace_pose)
            .add_systems(Update, (toggle, draw_probes, report, detect_crossing))
            .add_systems(
                PostUpdate,
                (advance_stride, pose_lower_body)
                    .chain()
                    .after(AnimationSystems)
                    .before(PoseSystems)
                    .before(aim_feet),
            )
            // Between the animation writing its bones and the solver reading
            // them. In Update this ran a frame late and, worse, measured the
            // ankle the solver had already moved -- so a planted foot could
            // never register as lifting and never released.
            .add_systems(
                PostUpdate,
                (aim_feet, reach_pelvis)
                    .chain()
                    .after(AnimationSystems)
                    .after(PoseSystems)
                    .before(KinetreeSystems)
                    .before(TransformSystems::Propagate),
            )
            .add_systems(
                PostUpdate,
                (level_feet, note_support, lean_torso)
                    .after(KinetreeSystems)
                    .before(TransformSystems::Propagate),
            );
    }
}

#[derive(Resource)]
pub struct FootIkEnabled(pub bool);

/// Whether feet follow the clip's foot height or step procedurally from gait data.
#[derive(Resource, Debug, Clone, Copy, PartialEq, Eq, Default)]
pub enum FootIkMode {
    /// Legs generated from gait data; the clip drives the upper body only.
    #[default]
    Procedural,
    /// Clip legs, planted feet pinned to the world.
    Lock,
    /// Clip legs, feet conform to the ground only.
    Follow,
}

/// How far the body may drag a pinned foot before the pin lets go.
const LOCK_DRIFT: f32 = 0.35;

/// Seconds for the lower body to fade between clip and procedural.
const FADE: f32 = 0.25;

/// How fast the gait mix may chase the real ground speed, metres per second squared.
const PACE_RATE: f32 = 8.0;

/// Facing turn rate, radians per second, at which a pinned foot fully lets go and follows its home spot.
const TURN_RELEASE: f32 = 2.0;

/// Swing progress past which the landing spot is frozen; before it the spot is damped toward the fresh prediction.
const LANDING_COMMIT: f32 = 0.65;

/// How eagerly an uncommitted landing follows the prediction, as a multiple of the blend rate.
const LANDING_CHASE: f32 = 1.0;

/// How far the body may turn over a planted foot before the foot pivots with it, radians.
const MAX_TWIST: f32 = 0.3;

/// Twist at which a planted foot would rather step than pivot, radians.
const PIVOT_LIFT: f32 = 0.45;

/// Torso lean into a turn: yaw lead and roll bank per radian per second of turn, and their caps, radians.
const LEAN_YAW: f32 = 0.12;
const LEAN_YAW_MAX: f32 = 0.3;
const LEAN_ROLL: f32 = 0.05;
const LEAN_ROLL_MAX: f32 = 0.12;

/// Stride clock speed-up while a planted foot is straining to step, so the handover comes sooner without any foot leaving the clock.
const HURRY: f32 = 1.25;

/// Planar reach, in leg lengths, a strained foot is pulled in to before it swings, so a late lift never starts from a locked-straight leg.
const LIFT_REACH: f32 = 0.75;

/// Radius of the sphere swept down for ground under a foot, so the probe rides over seams and small gaps a ray would fall through.
const SOLE_RADIUS: f32 = 0.06;

/// How far a planted ball may travel before the lock holds it: the capture's own feet creep this much in stance, so inside it the pose rules.
const LOCK_SLACK: f32 = 0.05;

/// Sole tilt cap on slopes, radians.
const MAX_SOLE_TILT: f32 = 0.44;

/// Pelvis reach: extra drop cap, how much leg is kept in reserve, and the drop and rise rates per second.
const MAX_REACH_DROP: f32 = 0.0;
const REACH_RESERVE: f32 = 0.0;
const REACH_DROP_RATE: f32 = 14.0;
const REACH_RISE_RATE: f32 = 5.0;
/// Pelvis drop cap and leg reserve while standing on held feet, so a stance wider than the idle's does not lock the knees.
const REST_DROP: f32 = 0.04;
const REST_RESERVE: f32 = 0.02;
/// Ground speed, m/s, under which feet stay held where they came to rest while the pose fades between idle and a clip.
const REST_SPEED: f32 = 0.4;

/// Below this ground speed a character is standing, and its feet follow the clip.
const STEP_SPEED: f32 = 0.15;
/// Seconds the ground probe may miss before the pose treats the body as airborne; a reversal drops a single hit.
const AIR_GRACE: f32 = 0.1;

/// Seconds over which a released foot sheds what the lock was holding it away from the pose.
const CARRY_FADE: f32 = 0.08;
/// Fraction of the leg a resting foot may sit from the pose's ankle before the hold is dropped as a warp's leftover.
const REST_REACH: f32 = 0.4;

/// Extra lock slack per radian per second of facing turn: the straight clips do not turn, so the pose wins over the pin while the body does.
const TURN_SLACK: f32 = 0.1;

/// Ball height over the ground under which the ball, not the heel, is what the foot stands on.
const BALL_CLEAR: f32 = 0.02;

/// Fraction of the leg a held foot may be pulled out to, unless the pose itself reaches further, before the pin slides instead; past it the knee locks straight.
const HOLD_REACH: f32 = 0.96;

/// How far, in leg lengths, a held foot may stand from where the pose puts it, along the travel and across it; past either the hold yields and the foot slides along the bound's edge instead of locking the knee.
const HOLD_ALONG: f32 = 0.3;
const HOLD_ACROSS: f32 = 0.2;

impl Default for FootIkEnabled {
    fn default() -> Self {
        Self(std::env::var("MMORPG_IK").as_deref() != Ok("0"))
    }
}

/// Marks a limb as a leg so the goal system can find it.
#[derive(Component)]
pub struct FootGoal {
    pub character: Entity,
    /// Whether there is ground to stand on, faded over time.
    pub grounded: f32,
    /// Ankle-bone height above the sole in the rest pose.
    pub ankle_height: f32,
    pub right: bool,
    /// World point this foot is pinned to while planted.
    pub plant: Option<Vec3>,
    /// Facing yaw when the pin was set, so a planted foot keeps its heading while the body turns.
    pub plant_yaw: f32,
    /// Where the current procedural swing left the ground, in world and in the body frame.
    pub from: Vec3,
    pub from_local: Vec2,
    stepping: bool,
    /// Phase since this foot's contact at which the current swing began: the data's duty, or earlier for a strained foot.
    lift_at: f32,
    /// Where the plant landed relative to the baked path at that moment, so the path can be followed from the real landing spot.
    offset: Vec3,
    /// Where this swing will land, damped early in the swing and frozen once committed.
    landing: Option<Vec3>,
    /// Smoothed ground normal under the foot, for sole tilt on slopes.
    pub normal: Vec3,
    /// Planted but wanting to step: the body has walked or turned away from it.
    strained: bool,
    /// Why, as bits: 1 drift, 2 twist, 4 out of reach.
    strain_why: u8,
    /// Lowest ankle height above the ground during the current stance.
    low: f32,
    /// How far the pose's stance ankle sat below the bind ankle height last stance, for the floor fix.
    pub sample: Option<f32>,
    /// What the lock still held the foot away from the pose when it released, faded out over the swing's first frames.
    carry: Vec3,
    /// Whether the pin is under the ball; until the ball comes down after a heel strike it is under the ankle.
    pin_ball: bool,
    /// Where the foot was when the body came to rest, held through the idle so the stance it arrived in is the stance it stands in; world point, and the same in the body's frame so a creeping or turning body carries it.
    rest: Option<Vec3>,
    rest_local: Vec3,
    /// Frames the pose's ankle has sat still, so a body that has never walked only captures a settled stance.
    still: u8,
    last_ankle: Vec3,
    /// Where the pose's foot sat relative to the pin when the pin was set, so the lock's slack measures the pose's own creep since then.
    base: Vec3,
}

impl FootGoal {
    pub fn new(character: Entity, ankle_height: f32, right: bool) -> Self {
        Self {
            character,
            grounded: 0.0,
            ankle_height,
            right,
            plant: None,
            plant_yaw: 0.0,
            from: Vec3::ZERO,
            from_local: Vec2::ZERO,
            stepping: false,
            lift_at: 0.0,
            offset: Vec3::ZERO,
            landing: None,
            normal: Vec3::Y,
            strained: false,
            strain_why: 0,
            low: f32::MAX,
            sample: None,
            carry: Vec3::ZERO,
            pin_ball: false,
            rest: None,
            rest_local: Vec3::ZERO,
            still: 0,
            last_ankle: Vec3::ZERO,
            base: Vec3::ZERO,
        }
    }
}

/// Gizmos and the per-character log, together: both are debug scaffolding and
/// both cost per character per frame, so neither should be on by default in a
/// world that expects crowds.
#[derive(Resource, Default)]
pub struct FootIkDebug(pub bool);

fn toggle(
    keys: Res<ButtonInput<KeyCode>>,
    mut enabled: ResMut<FootIkEnabled>,
    mut mode: ResMut<FootIkMode>,
    mut scaffold: ResMut<FootIkDebug>,
) {
    if keys.just_pressed(KeyCode::KeyI) {
        enabled.0 = !enabled.0;
        info!("foot ik {}", if enabled.0 { "on" } else { "off" });
    }
    if keys.just_pressed(KeyCode::KeyP) {
        *mode = match *mode {
            FootIkMode::Procedural => FootIkMode::Lock,
            FootIkMode::Lock => FootIkMode::Follow,
            FootIkMode::Follow => FootIkMode::Procedural,
        };
        info!("foot ik mode {:?}", *mode);
    }
    if keys.just_pressed(KeyCode::KeyG) {
        scaffold.0 = !scaffold.0;
        info!("foot ik debug {}", if scaffold.0 { "on" } else { "off" });
    }
}

/// Green ring = goal, and its radius tracks the blend weight, so a planted
/// foot draws a full circle and a swinging one shrinks to nothing.
fn draw_probes(
    show: Res<FootIkDebug>,
    mut gizmos: Gizmos,
    globals: Query<&GlobalTransform>,
    limbs: Query<(&IkLimb, &IkLimbBones, &FootGoal)>,
) {
    if !show.0 {
        return;
    }
    for (limb, bones, goal) in &limbs {
        if let Some(plant) = goal.plant {
            gizmos.sphere(plant, 0.05, Color::srgb(0.9, 0.2, 0.2));
        }
        let Ok(ankle) = globals.get(bones.tip) else {
            continue;
        };
        let ankle = ankle.translation();
        gizmos.line(
            ankle + Vec3::Y * PROBE_UP,
            ankle - Vec3::Y * PROBE_DOWN,
            Color::srgb(0.4, 0.5, 0.9),
        );
        gizmos.sphere(ankle, 0.04, Color::srgb(0.95, 0.75, 0.2));
        gizmos.circle(
            Isometry3d::new(
                limb.goal,
                Quat::from_rotation_x(core::f32::consts::FRAC_PI_2),
            ),
            0.02 + 0.12 * limb.weight,
            Color::srgb(0.3, 0.9, 0.4),
        );
    }
}

/// The switches the leg systems read together: whether foot IK runs at all, which leg mode it runs in, and whether a baked clip is driving the legs.
#[derive(SystemParam)]
struct Switches<'w> {
    enabled: Res<'w, FootIkEnabled>,
    mode: Res<'w, FootIkMode>,
    playback: Res<'w, PosePlayback>,
}

/// The three views needed to read a pose: bone locals to compose from, the
/// parent links to compose along, and the propagated globals for the coarse
/// distance test.
#[derive(SystemParam)]
struct Pose<'w, 's> {
    transforms: Query<'w, 's, &'static Transform>,
    parents: Query<'w, 's, &'static ChildOf>,
    globals: Query<'w, 's, &'static GlobalTransform>,
    cadences: Query<'w, 's, &'static Cadence>,
    lowers: Query<'w, 's, &'static LowerBody>,
    support: Res<'w, Support>,
}

/// Where the stride hangs from: the point between the hip joints, which is what the mocap curves are relative to, at the body's height. Falls back to the capsule.
fn stride_origin(pose: &Pose, character: Entity) -> Option<Vec3> {
    let body = pose.globals.get(character).ok()?.translation();
    Some(hip_centre(
        pose.lowers.get(character).ok(),
        &pose.globals,
        body,
    ))
}

/// Mean of the thigh joints, at `body`'s height; `body` itself when there are no legs to read.
fn hip_centre(lower: Option<&LowerBody>, globals: &Query<&GlobalTransform>, body: Vec3) -> Vec3 {
    let hips: Vec<Vec3> = lower
        .map(|lower| {
            lower
                .legs
                .iter()
                .filter_map(|leg| globals.get(leg.thigh).ok())
                .map(GlobalTransform::translation)
                .collect()
        })
        .unwrap_or_default();
    if hips.is_empty() {
        return body;
    }
    let mean = hips.iter().sum::<Vec3>() / hips.len() as f32;
    Vec3::new(mean.x, body.y, mean.z)
}

/// Per-frame CSV of what the legs actually did, for checking against the baked curves; `MMORPG_TRACE=<file>`.
#[derive(Resource)]
struct Trace(Option<Mutex<std::fs::File>>);

impl Trace {
    fn from_env() -> Self {
        let file = std::env::var("MMORPG_TRACE")
            .ok()
            .and_then(|path| std::fs::File::create(path).ok())
            .map(|mut file| {
                let _ = writeln!(
                    file,
                    "t,entity,phase,rate,speed,turn,yaw,x,z,weight,wish_x,wish_z,run,hip_y,drop,l_fwd,l_side,l_up,l_twist,l_knee,l_plant,l_strain,l_lift_at,l_goal_fwd,l_goal_side,l_goal_up,l_w,l_ax,l_ay,l_az,l_reach,l_why,l_gx,l_gy,l_gz,l_gnd,l_len,l_ox,l_oy,l_oz,l_carry,r_fwd,r_side,r_up,r_twist,r_knee,r_plant,r_strain,r_lift_at,r_goal_fwd,r_goal_side,r_goal_up,r_w,r_ax,r_ay,r_az,r_reach,r_why,r_gx,r_gy,r_gz,r_gnd,r_len,r_ox,r_oy,r_oz,r_carry,stride,period,clip,shot,steer,torso_fwd,torso_side,chest_yaw,chest_pitch,head_yaw,head_pitch"
                );
                Mutex::new(file)
            });
        Self(file)
    }
}

fn trace_pose(
    trace: Res<Trace>,
    time: Res<Time>,
    characters: Query<(
        Entity,
        &Cadence,
        &LowerBody,
        &GlobalTransform,
        Option<&super::character::MoveIntent>,
    )>,
    goals: Query<(&FootGoal, &IkLimbBones, &IkLimb)>,
    globals: Query<&GlobalTransform>,
) {
    let Some(file) = trace.0.as_ref() else {
        return;
    };
    let Ok(mut file) = file.lock() else {
        return;
    };
    for (entity, cadence, lower, body, intent) in &characters {
        let capsule = body.translation();
        let body = hip_centre(Some(lower), &globals, capsule);
        let right = cadence.forward.cross(Vec3::Y).normalize_or_zero();
        let leg = cadence.leg_length.max(0.01);
        let mut feet = [String::new(), String::new()];
        for rig in &lower.legs {
            let Some((goal, bones, limb)) =
                goals.iter().find(|(_, bones, _)| bones.tip == rig.foot)
            else {
                continue;
            };
            let (Ok(thigh), Ok(calf), Ok(foot)) = (
                globals.get(bones.root),
                globals.get(bones.mid),
                globals.get(bones.tip),
            ) else {
                continue;
            };
            let ankle = foot.translation();
            let rel = ankle - body;
            let facing = foot.rotation() * rig.foot_rest.inverse() * Vec3::Z;
            let twist = facing
                .dot(right)
                .atan2(facing.dot(cadence.forward))
                .to_degrees();
            let a = thigh.translation() - calf.translation();
            let b = ankle - calf.translation();
            let knee = 180.0 - a.angle_between(b).to_degrees();
            let goal_rel = limb.goal - body;
            feet[rig.right as usize] = format!(
                "{:.4},{:.4},{:.4},{:.1},{:.1},{},{},{:.3},{:.4},{:.4},{:.4},{:.2},{:.4},{:.4},{:.4},{:.3},{},{:.4},{:.4},{:.4},{:.4},{:.4},{:.4},{:.4},{:.4},{:.3}",
                rel.dot(cadence.forward) / leg,
                rel.dot(right) / leg,
                ankle.y,
                twist,
                knee,
                u8::from(goal.plant.is_some()),
                u8::from(goal.strained),
                goal.lift_at,
                goal_rel.dot(cadence.forward) / leg,
                goal_rel.dot(right) / leg,
                limb.goal.y,
                limb.weight,
                ankle.x,
                ankle.y,
                ankle.z,
                thigh.translation().distance(ankle) / leg,
                goal.strain_why,
                limb.goal.x,
                limb.goal.y,
                limb.goal.z,
                height_at(ankle.x, ankle.z),
                thigh.translation().distance(calf.translation())
                    + calf.translation().distance(ankle),
                goal.offset.x,
                goal.offset.y,
                goal.offset.z,
                Vec3::new(goal.carry.x, 0.0, goal.carry.z).length()
            );
        }
        let wish = intent.map(|i| i.wish).unwrap_or(Vec3::ZERO);
        let hip_y = lower
            .legs
            .iter()
            .filter_map(|leg| globals.get(leg.thigh).ok())
            .map(|t| t.translation().y)
            .sum::<f32>()
            / lower.legs.len().max(1) as f32;
        let torso = torso_angles(lower, &globals, cadence.forward, right);
        let _ = writeln!(
            file,
            "{:.4},{},{:.4},{:.2},{:.3},{:.3},{:.3},{:.3},{:.3},{:.2},{:.2},{:.2},{},{:.4},{:.4},{},{},{},{:.4},{},{:.1},{:.1},{}",
            time.elapsed_secs(),
            entity,
            cadence.phase,
            cadence.rate,
            cadence.speed,
            cadence.turn,
            cadence.yaw,
            body.x,
            body.z,
            cadence.weight,
            wish.x,
            wish.z,
            u8::from(intent.is_some_and(|i| i.run)),
            hip_y,
            cadence.floor_fix,
            feet[0],
            feet[1],
            cadence.stride_count,
            cadence.clip_period.unwrap_or(0.0),
            cadence.clip.map(|(i, _)| i as i64).unwrap_or(-1),
            cadence.shot.map_or(-1.0, |s| s.frame),
            cadence
                .shot
                .map_or(0.0, |s| (s.steered + s.steer).to_degrees()),
            torso
        );
    }
}

/// Torso lean, chest facing and head facing in degrees, for checking the upper body against the mocap.
fn torso_angles(
    lower: &LowerBody,
    globals: &Query<&GlobalTransform>,
    forward: Vec3,
    right: Vec3,
) -> String {
    let role = |name: &str| lower.roles.iter().find(|r| r.role == name);
    let at =
        |name: &str| role(name).and_then(|r| globals.get(r.bone).ok().map(|g| g.translation()));
    let lean = |a: Vec3, b: Vec3| {
        let v = (b - a).normalize_or_zero();
        (
            v.dot(forward).atan2(v.y).to_degrees(),
            v.dot(right).atan2(v.y).to_degrees(),
        )
    };
    let facing = |name: &str| {
        role(name).and_then(|r| globals.get(r.bone).ok()).map(|g| {
            let f = g.rotation()
                * role(name)
                    .map(|r| r.rest.rotation.inverse())
                    .unwrap_or(Quat::IDENTITY)
                * Vec3::Z;
            (
                f.dot(right).atan2(f.dot(forward)).to_degrees(),
                (-f.y).asin().to_degrees(),
            )
        })
    };
    let torso = match (at("spine_0"), at("neck")) {
        (Some(a), Some(b)) => lean(a, b),
        _ => (0.0, 0.0),
    };
    let top = lower
        .roles
        .iter()
        .filter(|r| r.role.starts_with("spine_"))
        .map(|r| r.role)
        .max()
        .unwrap_or("spine_0");
    let chest = facing(top).unwrap_or((0.0, 0.0));
    let head = facing("head").unwrap_or((0.0, 0.0));
    format!(
        "{:.1},{:.1},{:.1},{:.1},{:.1},{:.1}",
        torso.0, torso.1, chest.0, chest.1, head.0, head.1
    )
}

/// Which feet of each character were planted at the end of last frame, indexed left then right, so a foot never lifts early while the other is already in the air.
#[derive(Resource, Default)]
struct Support(HashMap<Entity, [Footing; 2]>);

/// One foot's state as the other foot saw it last frame.
#[derive(Clone, Copy)]
struct Footing {
    planted: bool,
    strained: bool,
}

impl Default for Footing {
    fn default() -> Self {
        Self {
            planted: true,
            strained: false,
        }
    }
}

fn note_support(mut support: ResMut<Support>, goals: Query<&FootGoal>, cadences: Query<&Cadence>) {
    support.0.clear();
    for goal in &goals {
        let feet = support.0.entry(goal.character).or_default();
        feet[goal.right as usize] = Footing {
            planted: !goal.stepping || goal.plant.is_some(),
            strained: goal.strained,
        };
    }
    for (character, feet) in &support.0 {
        if !feet[0].planted && !feet[1].planted {
            let phase = cadences.get(*character).map(|c| c.phase).unwrap_or(-1.0);
            let marks: Vec<String> = goals
                .iter()
                .filter(|g| g.character == *character)
                .map(|g| {
                    format!(
                        "{}:lift{:.2} g{:.2} from {:.2},{:.2},{:.2}",
                        if g.right { "R" } else { "L" },
                        g.lift_at,
                        g.grounded,
                        g.from.x,
                        g.from.y,
                        g.from.z
                    )
                })
                .collect();
            warn!("FLIGHT {character} phase {phase:.2} {}", marks.join(" "));
        }
    }
}

fn advance_stride(
    time: Res<Time>,
    rig: Res<Rig>,
    switches: Switches,
    support: Res<Support>,
    sets: Res<Assets<GaitSet>>,
    transforms: Query<&Transform>,
    mut characters: Query<(
        Entity,
        &mut Cadence,
        &LinearVelocity,
        &LowerBody,
        &Grounded,
        &Heading,
    )>,
) {
    let set = rig.gaits.as_ref().and_then(|handle| sets.get(handle));
    let dt = time.delta_secs();
    for (entity, mut stride, velocity, lower, grounded, heading) in &mut characters {
        stride.frame_dt = dt;
        let hurry = support
            .0
            .get(&entity)
            .is_some_and(|feet| feet.iter().any(|f| f.strained));
        let planar = Vec3::new(velocity.x, 0.0, velocity.z);
        stride.prior_speed = stride.speed;
        stride.speed = planar.length();
        stride.velocity = planar;
        let facing = transforms
            .get(lower.model)
            .map(|model| model.rotation * Vec3::Z)
            .unwrap_or(Vec3::NEG_Z);
        stride.forward = Vec3::new(facing.x, 0.0, facing.z).normalize_or(Vec3::NEG_Z);
        let yaw = (-stride.forward.x).atan2(-stride.forward.z);
        let delta = (yaw - stride.yaw + core::f32::consts::PI).rem_euclid(core::f32::consts::TAU)
            - core::f32::consts::PI;
        let rate = if dt > 0.0 { delta / dt } else { 0.0 };
        stride.turn_rate += (rate.abs() - stride.turn_rate) * (10.0 * dt).min(1.0);
        stride.turn += (rate - stride.turn) * (6.0 * dt).min(1.0);
        stride.yaw = yaw;
        let right = stride.forward.cross(Vec3::Y);
        stride.locked = heading.0.is_some();
        if stride.speed > STEP_SPEED {
            stride.travel = planar / stride.speed;
        }
        let along = if stride.speed > STEP_SPEED {
            Some(planar)
        } else if stride.locked {
            Some(stride.travel)
        } else {
            None
        };
        stride.direction = match along {
            Some(along) if heading.0.is_some() || switches.playback.on => along
                .dot(right)
                .atan2(along.dot(stride.forward))
                .to_degrees(),
            _ => 0.0,
        };
        if heading.0.is_none() {
            stride.velocity = stride.forward * stride.speed;
        }
        stride.air = if grounded.0 { 0.0 } else { stride.air + dt };
        stride.touching = grounded.0;
        stride.rise = velocity.y;
        let planted = grounded.0 || (stride.air < AIR_GRACE && stride.speed > 0.0);
        let moving = stride.flight.is_some()
            || planted
                && (stride.speed.max(stride.prior_speed) > STEP_SPEED
                    || stride.shot.is_some()
                    || stride.hold);
        stride.grounded = planted;
        let chase = PACE_RATE * dt;
        stride.pace = if moving {
            stride.pace + (stride.speed - stride.pace).clamp(-chase, chase)
        } else {
            stride.speed
        };
        let fresh = match set {
            Some(set) if stride.leg_length > 0.0 && moving => {
                set.blend(stride.pace / stride.leg_length, stride.direction)
            }
            _ => None,
        };
        let wants = *switches.mode == FootIkMode::Procedural
            && (fresh.is_some_and(|b| b.stride_period > 0.0)
                || stride.shot.is_some()
                || stride.flight.is_some());
        if wants {
            stride.blend = fresh;
            stride.settle = None;
        } else if stride.weight > 0.001 {
            if stride.settle.is_none()
                && grounded.0
                && !switches.playback.on
                && *switches.mode == FootIkMode::Procedural
            {
                stride.settle = stride.blend.map(|b| {
                    b.feet
                        .iter()
                        .map(|f| (f.contact - stride.phase).rem_euclid(1.0))
                        .fold(1.0, f32::min)
                });
            }
        } else {
            stride.blend = None;
            stride.settle = None;
        }
        let settling = stride.settle.is_some_and(|left| left > 0.0);
        let target = if wants || settling { 1.0 } else { 0.0 };
        let step = (dt / FADE).min(1.0);
        stride.weight += (target - stride.weight).clamp(-step, step);
        stride.stepping = stride.weight > 0.001;
        if wants || settling {
            let period = stride
                .clip_period
                .or_else(|| stride.blend.map(|b| b.stride_period))
                .filter(|period| *period > 0.0)
                .unwrap_or(1.0);
            stride.rate = if hurry { HURRY } else { 1.0 };
            let mut advance = dt / period * stride.rate;
            if let Some(left) = stride.settle.as_mut() {
                advance = advance.min(*left);
                *left -= advance;
            }
            let next = stride.phase + advance;
            if next >= 1.0 {
                stride.stride_count = stride.stride_count.wrapping_add(1);
            }
            stride.phase = next.rem_euclid(1.0);
        }
    }
}

fn pose_lower_body(
    playback: Res<PosePlayback>,
    characters: Query<(&Cadence, &LowerBody)>,
    mut transforms: Query<&mut Transform>,
) {
    for (cadence, lower) in &characters {
        if !cadence.stepping || playback.on {
            continue;
        }
        for (bone, rest) in &lower.bones {
            if let Ok(mut transform) = transforms.get_mut(*bone) {
                transform.translation =
                    transform.translation.lerp(rest.translation, cadence.weight);
                transform.rotation = transform.rotation.slerp(rest.rotation, cadence.weight);
                transform.scale = transform.scale.lerp(rest.scale, cadence.weight);
            }
        }
        let drop = cadence
            .blend
            .map(|b| {
                (b.hip_height + at(&b.bob, cadence.phase)) * cadence.leg_length - lower.hip_rest
            })
            .unwrap_or(0.0);
        if let Ok(mut model) = transforms.get_mut(lower.model) {
            model.translation = lower.model_rest.translation + Vec3::Y * (drop * cadence.weight);
        }
        for leg in &lower.legs {
            if let Ok(mut calf) = transforms.get_mut(leg.calf) {
                calf.rotation = Quat::IDENTITY.slerp(leg.prebend, cadence.weight) * calf.rotation;
            }
        }
        if let Some(pelvis) = lower.pelvis
            && let Some(blend) = cadence.blend
            && let Ok(mut transform) = transforms.get_mut(pelvis.bone)
        {
            let yaw = at(&blend.pelvis_yaw, cadence.phase).to_radians();
            let roll = at(&blend.pelvis_roll, cadence.phase).to_radians();
            let swing = Quat::from_rotation_y(yaw) * Quat::from_rotation_z(-roll);
            let desired = pelvis.parent_rest.inverse() * swing * pelvis.rest;
            transform.rotation = transform.rotation.slerp(desired, cadence.weight);
        }
    }
}

/// Drops the model root when a planted or landing foot sits beyond a straight leg, as the downhill foot does on a slope, so no knee locks reaching for it; drops fast, rises slow.
fn reach_pelvis(
    time: Res<Time>,
    mut characters: Query<(Entity, &mut Cadence, &LowerBody)>,
    goals: Query<(&IkLimb, &IkLimbBones, &FootGoal)>,
    parents: Query<&ChildOf>,
    mut transforms: Query<&mut Transform>,
) {
    let dt = time.delta_secs();
    for (character, mut cadence, lower) in &mut characters {
        let resting = !cadence.stepping || cadence.weight < 0.99;
        if resting
            && !goals
                .iter()
                .any(|(_, _, g)| g.character == character && g.rest.is_some())
        {
            continue;
        }
        let read = transforms.as_readonly();
        let mut wanted: f32 = 0.0;
        for (limb, bones, goal) in &goals {
            if goal.character != character || limb.weight <= 0.0 {
                continue;
            }
            let Some(hip) = bone_world_transform(bones.root, &read, &parents) else {
                continue;
            };
            let hip = hip.translation;
            let reserve = if resting { REST_RESERVE } else { REACH_RESERVE };
            let reach = cadence.leg_length * (1.0 - reserve);
            let flat = Vec2::new(limb.goal.x - hip.x, limb.goal.z - hip.z).length();
            let rise = (reach * reach - flat * flat).max(0.0).sqrt();
            let drop = hip.y + cadence.reach_drop - (limb.goal.y + rise);
            wanted = wanted.max(drop * limb.weight);
        }
        let wanted = wanted.min(if resting { REST_DROP } else { MAX_REACH_DROP });
        let rate = if resting {
            f32::INFINITY
        } else if wanted > cadence.reach_drop {
            REACH_DROP_RATE
        } else {
            REACH_RISE_RATE
        };
        cadence.reach_drop += (wanted - cadence.reach_drop) * (rate * dt).min(1.0);
        if let Ok(mut model) = transforms.get_mut(lower.model) {
            model.translation.y += cadence.root_drop;
            cadence.root_drop = cadence.reach_drop * if resting { 1.0 } else { cadence.weight };
            model.translation.y -= cadence.root_drop;
        }
    }
}

/// Leans the spine into a turn: the chest leads the hips round and banks a little, spread up the spine segments.
fn lean_torso(
    characters: Query<(&Cadence, &LowerBody)>,
    parents: Query<&ChildOf>,
    mut transforms: Query<&mut Transform>,
) {
    for (cadence, lower) in &characters {
        if lower.spine.is_empty() || cadence.speed <= STEP_SPEED {
            continue;
        }
        let yaw =
            (cadence.turn * LEAN_YAW).clamp(-LEAN_YAW_MAX, LEAN_YAW_MAX) / lower.spine.len() as f32;
        let roll = (cadence.turn * LEAN_ROLL).clamp(-LEAN_ROLL_MAX, LEAN_ROLL_MAX)
            / lower.spine.len() as f32;
        for bone in &lower.spine {
            let read = transforms.as_readonly();
            let Some(world) = bone_world_transform(*bone, &read, &parents) else {
                continue;
            };
            let into = world.rotation.inverse();
            let lean = Quat::from_axis_angle(into * Vec3::Y, yaw)
                * Quat::from_axis_angle(into * cadence.forward, -roll);
            if let Ok(mut transform) = transforms.get_mut(*bone) {
                transform.rotation *= lean;
            }
        }
    }
}

/// Holds each procedural foot at its bind orientation in world space, whatever the knee did.
fn level_feet(
    playback: Res<PosePlayback>,
    characters: Query<(&Cadence, &LowerBody)>,
    goals: Query<(&FootGoal, &IkLimbBones)>,
    parents: Query<&ChildOf>,
    mut transforms: Query<&mut Transform>,
) {
    for (cadence, lower) in &characters {
        if !cadence.stepping || playback.on {
            continue;
        }
        let contact = |foot: Entity| {
            goals
                .iter()
                .find(|(_, bones)| bones.tip == foot)
                .map(|(goal, _)| (goal.plant.map(|_| goal.plant_yaw), goal.normal))
        };
        let read = transforms.as_readonly();
        let Some(model) = bone_world_transform(lower.model, &read, &parents) else {
            continue;
        };
        let targets: Vec<(Entity, Quat)> = lower
            .legs
            .iter()
            .filter_map(|leg| {
                let calf = bone_world_transform(leg.calf, &read, &parents)?;
                let pitch = cadence
                    .blend
                    .map(|b| at(&b.feet[leg.right as usize].pitch, cadence.phase).to_radians())
                    .unwrap_or(0.0);
                let tilt = Quat::from_axis_angle(Vec3::NEG_X, pitch);
                let (pinned, normal) = contact(leg.foot).unwrap_or((None, Vec3::Y));
                let heading = pinned
                    .map(|yaw| Quat::from_rotation_y(yaw - cadence.yaw))
                    .unwrap_or(Quat::IDENTITY);
                let slope = Quat::from_rotation_arc(Vec3::Y, normal);
                let (axis, angle) = slope.to_axis_angle();
                let slope = Quat::from_axis_angle(axis, angle.min(MAX_SOLE_TILT));
                let desired = slope * heading * model.rotation * tilt * leg.foot_rest;
                Some((leg.foot, calf.rotation.inverse() * desired))
            })
            .collect();
        for (foot, rotation) in targets {
            if let Ok(mut transform) = transforms.get_mut(foot) {
                transform.rotation = transform.rotation.slerp(rotation, cadence.weight);
            }
        }
    }
}

fn aim_feet(
    time: Res<Time>,
    switches: Switches,
    spatial: SpatialQuery,
    camera: Single<&GlobalTransform, With<Camera3d>>,
    pose: Pose,
    walkers: Query<(), With<Character>>,
    mut limbs: Query<(&mut IkLimb, &IkLimbBones, &mut FootGoal)>,
) {
    let step = (BLEND_RATE * time.delta_secs()).min(1.0);
    let not_a_body = |entity: Entity| !walkers.contains(entity);
    let eye = camera.translation();

    limbs
        .par_iter_mut()
        .for_each(|(mut limb, bones, mut goal)| {
            let far = pose
                .globals
                .get(goal.character)
                .is_ok_and(|body| body.translation().distance_squared(eye) > IK_RANGE * IK_RANGE);
            if far {
                goal.grounded -= goal.grounded * step;
                goal.plant = None;
                goal.stepping = false;
                limb.weight = 0.0;
                return;
            }

            let Some(ankle) = bone_world_transform(bones.tip, &pose.transforms, &pose.parents)
            else {
                return;
            };
            let ankle = ankle.translation;
            let top = pose
                .globals
                .get(goal.character)
                .map(|body| body.translation().y)
                .unwrap_or(ankle.y)
                .max(ankle.y)
                + PROBE_UP;
            let filter = SpatialQueryFilter::default().with_excluded_entities([goal.character]);
            let sole = Collider::sphere(SOLE_RADIUS);
            let ground = |probe: Vec3| {
                if !switches.enabled.0 {
                    return None;
                }
                let origin = Vec3::new(probe.x, top, probe.z);
                let reach = top - ankle.y + PROBE_DOWN;
                let config = ShapeCastConfig::from_max_distance(reach);
                spatial
                    .cast_shape_predicate(
                        &sole,
                        origin,
                        Quat::IDENTITY,
                        Dir3::NEG_Y,
                        &config,
                        &filter,
                        &not_a_body,
                    )
                    .map(|hit| (hit.point1, hit.normal1.normalize_or(Vec3::Y)))
                    .or_else(|| {
                        spatial
                            .cast_ray_predicate(
                                origin,
                                Dir3::NEG_Y,
                                reach,
                                true,
                                &filter,
                                &not_a_body,
                            )
                            .map(|hit| {
                                (
                                    origin + Vec3::NEG_Y * hit.distance,
                                    hit.normal.normalize_or(Vec3::Y),
                                )
                            })
                    })
            };

            let cadence = pose.cadences.get(goal.character).ok();
            if cadence.is_some_and(|c| {
                matches!(
                    c.flight,
                    Some(Flight::Rise { .. }) | Some(Flight::Fall { .. })
                )
            }) {
                goal.grounded = 0.0;
                goal.plant = None;
                goal.rest = None;
                goal.stepping = false;
                limb.weight = 0.0;
                return;
            }
            if switches.playback.on
                && let Some(cadence) = cadence
                && cadence.grounded
            {
                let ball = pose
                    .lowers
                    .get(goal.character)
                    .ok()
                    .and_then(|lower| {
                        let name = if goal.right { "ball_r" } else { "ball_l" };
                        lower.roles.iter().find(|r| r.role == name).map(|r| r.bone)
                    })
                    .and_then(|bone| bone_world_transform(bone, &pose.transforms, &pose.parents))
                    .map(|t| t.translation);
                let hip = bone_world_transform(bones.root, &pose.transforms, &pose.parents)
                    .map(|t| t.translation)
                    .unwrap_or(ankle + Vec3::Y * cadence.leg_length);
                let body = pose
                    .globals
                    .get(goal.character)
                    .ok()
                    .map(|body| body.translation());
                let body_floor = body
                    .and_then(|body| ground(Vec3::new(body.x, ankle.y, body.z)))
                    .map(|(hit, _)| hit.y);
                hold_foot(
                    &mut limb, &mut goal, cadence, hip, ankle, ball, &ground, body, body_floor,
                    step,
                );
                return;
            }
            if let Some(cadence) = cadence
                && cadence.stepping
                && let Some(blend) = cadence.blend
            {
                step_foot(
                    &mut limb, &mut goal, cadence, &blend, &pose, ankle, &ground, step,
                );
                return;
            }
            goal.stepping = false;

            let Some((hit, normal)) = ground(ankle) else {
                goal.grounded -= goal.grounded * step;
                goal.plant = None;
                limb.weight = 0.0;
                return;
            };
            goal.normal = goal.normal.lerp(normal, step).normalize_or(Vec3::Y);
            let target = hit + Vec3::Y * goal.ankle_height;
            goal.grounded += (1.0 - goal.grounded) * step;
            let lift = ankle.y - target.y;
            let plant = if lift <= PLANT_BAND {
                1.0
            } else if lift >= SWING_BAND {
                0.0
            } else {
                let t = (lift - PLANT_BAND) / (SWING_BAND - PLANT_BAND);
                1.0 - t * t * (3.0 - 2.0 * t)
            };

            let locking =
                *switches.mode == FootIkMode::Lock && cadence.is_some_and(|c| c.speed > STEP_SPEED);
            if !locking || plant <= 0.0 {
                goal.plant = None;
            } else if goal.plant.is_none() && plant >= 1.0 {
                goal.plant = Some(target);
            }

            limb.goal = match goal.plant {
                Some(pin) => {
                    let drift = Vec3::new(pin.x - target.x, 0.0, pin.z - target.z).length();
                    let t = (drift / LOCK_DRIFT).clamp(0.0, 1.0);
                    let hold = 1.0 - t * t * (3.0 - 2.0 * t);
                    target.lerp(pin, hold)
                }
                None => target,
            };
            limb.weight = plant * goal.grounded;
        });
}

/// One foot of a procedural stride: pinned through stance, flown from the last plant to the predicted landing through swing.
///
/// The stride phase is the only clock. Stance is the data's contact window; a planted foot the body has walked or turned away from may lift early, but its landing time never moves, so the two feet can never drift apart.
#[allow(clippy::too_many_arguments)]
fn step_foot(
    limb: &mut IkLimb,
    goal: &mut FootGoal,
    cadence: &Cadence,
    blend: &GaitBlend,
    pose: &Pose,
    ankle: Vec3,
    ground: &dyn Fn(Vec3) -> Option<(Vec3, Vec3)>,
    step: f32,
) {
    let Some(body) = stride_origin(pose, goal.character) else {
        return;
    };
    let right = cadence.forward.cross(Vec3::Y).normalize_or_zero();
    let foot = &blend.feet[goal.right as usize];
    let other = &blend.feet[!goal.right as usize];
    let phase = cadence.phase;
    let leg = cadence.leg_length;
    let place = |fwd: f32, side: f32| cadence.forward * (fwd * leg) + right * (side * leg);
    let local = |point: Vec3| {
        let rel = point - body;
        Vec2::new(rel.dot(cadence.forward), rel.dot(right))
    };
    let sole = |point: Vec3, normal: Vec3| point + normal * goal.ankle_height;
    let turning = (cadence.turn_rate / TURN_RELEASE).clamp(0.0, 1.0);
    let since = (phase - foot.contact).rem_euclid(1.0);
    let other_since = (phase - other.contact).rem_euclid(1.0);
    let in_stance = since < foot.duty;

    if !goal.stepping {
        goal.stepping = true;
        goal.landing = None;
        goal.strained = false;
        if in_stance {
            let home = body + place(at(&foot.fwd, phase), at(&foot.side, phase));
            goal.plant = ground(home).map(|(g, n)| sole(g, n));
            goal.plant_yaw = cadence.yaw;
            goal.offset = goal.plant.map(|p| p - home).unwrap_or(Vec3::ZERO);
            goal.from = goal.plant.unwrap_or(ankle);
        } else {
            goal.plant = None;
            goal.from = ground(ankle).map(|(g, n)| sole(g, n)).unwrap_or(ankle);
            goal.from_local = local(goal.from);
            goal.lift_at = foot.duty;
        }
    }

    if let Some(pin) = goal.plant {
        let twist = (cadence.yaw - goal.plant_yaw + core::f32::consts::PI)
            .rem_euclid(core::f32::consts::TAU)
            - core::f32::consts::PI;
        if twist.abs() > MAX_TWIST {
            goal.plant_yaw += twist - MAX_TWIST.copysign(twist);
        }
        let home = body + place(at(&foot.fwd, phase), at(&foot.side, phase));
        let drift = Vec3::new(pin.x - home.x, 0.0, pin.z - home.z).length();
        let heel = at(&foot.lift, phase).max(0.0) * leg;
        goal.strain_why =
            u8::from(drift >= LOCK_DRIFT) | (u8::from(twist.abs() >= PIVOT_LIFT) << 1);
        goal.strained = in_stance && goal.strain_why != 0;
        let other_planted = pose
            .support
            .0
            .get(&goal.character)
            .is_none_or(|feet| feet[!goal.right as usize].planted);
        let other_down = other_since < other.duty;
        let may_lift = other_planted && other_down;
        if in_stance && (!goal.strained || !may_lift) {
            let along = Quat::from_rotation_y(goal.plant_yaw - cadence.yaw);
            let path = body + along * place(at(&foot.fwd, phase), at(&foot.side, phase));
            limb.goal = path + goal.offset + goal.normal * heel;
            goal.grounded += (1.0 - goal.grounded) * step;
            limb.weight = goal.grounded * cadence.weight;
            return;
        }
        goal.plant = None;
        goal.landing = None;
        goal.strained = false;
        goal.lift_at = since.min(foot.duty);
        let flat = Vec3::new(pin.x - body.x, 0.0, pin.z - body.z);
        let far = flat.length();
        let limit = leg * LIFT_REACH;
        goal.from = if far > limit {
            body + flat * (limit / far) + Vec3::Y * (pin.y - body.y)
        } else {
            pin
        };
        goal.from_local = local(goal.from);
    }

    if since < goal.lift_at {
        let held = goal.landing.or_else(|| {
            let spot = body + place(at(&foot.fwd, foot.contact), at(&foot.side, foot.contact));
            ground(spot).map(|(g, n)| sole(g, n))
        });
        let Some(land) = held else {
            goal.grounded -= goal.grounded * step;
            limb.weight = goal.grounded * cadence.weight;
            return;
        };
        goal.plant = Some(land);
        goal.landing = None;
        goal.plant_yaw = cadence.yaw;
        goal.offset = land - (body + place(at(&foot.fwd, phase), at(&foot.side, phase)));
        limb.goal = land;
        goal.grounded += (1.0 - goal.grounded) * step;
        limb.weight = goal.grounded * cadence.weight;
        return;
    }
    let swing = (1.0 - goal.lift_at).max(0.05);
    let t = ((since - goal.lift_at) / swing).clamp(0.0, 1.0);
    let ease = t * t * (3.0 - 2.0 * t);
    let carried = body + cadence.forward * goal.from_local.x + right * goal.from_local.y;
    let from = Vec3::new(
        goal.from.x + (carried.x - goal.from.x) * turning,
        goal.from.y,
        goal.from.z + (carried.z - goal.from.z) * turning,
    );
    let time_to_land = (1.0 - since) * blend.stride_period / cadence.rate.max(0.1);
    let probe = body
        + cadence.velocity * time_to_land
        + place(at(&foot.fwd, foot.contact), at(&foot.side, foot.contact));
    let fresh = match (ground(probe), goal.landing) {
        (Some((g, n)), _) => {
            goal.normal = goal.normal.lerp(n, step).normalize_or(Vec3::Y);
            Some(sole(g, n))
        }
        (None, Some(held)) => Some(held),
        (None, None) => None,
    };
    let Some(fresh) = fresh else {
        goal.grounded -= goal.grounded * step;
        limb.weight = goal.grounded * cadence.weight;
        return;
    };
    let land = match goal.landing {
        Some(held) if t >= LANDING_COMMIT => held,
        Some(held) => held.lerp(
            fresh,
            (LANDING_CHASE * cadence.leg_length.max(0.01)).min(1.0) * step,
        ),
        None => fresh,
    };
    goal.landing = Some(land);
    let lift = at(&foot.lift, foot.contact + foot.duty + t * (1.0 - foot.duty)).max(0.0) * leg;
    limb.goal = from.lerp(land, ease) + Vec3::Y * lift;
    goal.grounded += (1.0 - goal.grounded) * step;
    limb.weight = goal.grounded * cadence.weight;
}

/// Contact correction over a played-back pose: the pose owns the motion, this only keeps a foot the data calls planted where it first touched, and keeps any foot out of the ground.
#[allow(clippy::too_many_arguments)]
fn hold_foot(
    limb: &mut IkLimb,
    goal: &mut FootGoal,
    cadence: &Cadence,
    hip: Vec3,
    ankle: Vec3,
    ball: Option<Vec3>,
    ground: &dyn Fn(Vec3) -> Option<(Vec3, Vec3)>,
    body: Option<Vec3>,
    body_floor: Option<f32>,
    step: f32,
) {
    let full = cadence.weight >= 0.99 || cadence.shot.is_some();
    let down = if goal.right {
        cadence.contact.1
    } else {
        cadence.contact.0
    } && full;
    let ball = ball.unwrap_or(ankle);
    let Some((hit, normal)) = ground(ankle) else {
        goal.grounded -= goal.grounded * step;
        goal.plant = None;
        limb.weight = goal.grounded * cadence.weight;
        return;
    };
    goal.normal = goal.normal.lerp(normal, step).normalize_or(Vec3::Y);
    goal.grounded += (1.0 - goal.grounded) * step;
    let floor = hit + goal.normal * goal.ankle_height;
    if down {
        let ball_down = ball.y - hit.y <= BALL_CLEAR;
        if goal.plant.is_none() {
            goal.pin_ball = ball_down;
            let under = if ball_down { ball } else { ankle };
            let pinned = match goal.rest.take() {
                Some(rest) => rest + (under - ankle),
                None => under,
            };
            goal.base = Vec3::new(under.x - pinned.x, 0.0, under.z - pinned.z);
            goal.plant = Some(Vec3::new(pinned.x, hit.y, pinned.z));
            goal.from = ball;
            goal.plant_yaw = cadence.yaw;
            goal.low = f32::MAX;
        } else if !goal.pin_ball && ball_down {
            goal.pin_ball = true;
            goal.plant = Some(Vec3::new(ball.x, hit.y, ball.z));
            goal.base = Vec3::ZERO;
        }
        if cadence.weight >= 0.99 && cadence.shot.is_none() && goal.base.length_squared() == 0.0 {
            goal.low = goal
                .low
                .min(ankle.y + cadence.reach_drop - body_floor.unwrap_or(hit.y));
        }
        let pin = goal.plant.unwrap_or(ball);
        let under = if goal.pin_ball { ball } else { ankle };
        goal.offset = under - pin;
        let creep = Vec3::new(goal.offset.x, 0.0, goal.offset.z) - goal.base;
        let slack = LOCK_SLACK + cadence.turn.abs() * TURN_SLACK;
        let held = Vec3::new(pin.x, 0.0, pin.z) + creep.clamp_length_max(slack);
        let travel = Vec3::new(cadence.velocity.x, 0.0, cadence.velocity.z);
        let travel = if travel.length_squared() > 0.25 {
            travel.normalize()
        } else {
            Vec3::new(cadence.forward.x, 0.0, cadence.forward.z).normalize_or(Vec3::NEG_Z)
        };
        let across = Vec3::Y.cross(travel);
        let want = Vec3::new(under.x, 0.0, under.z);
        let give = held - want;
        let along = cadence.leg_length * HOLD_ALONG;
        let side = cadence.leg_length * HOLD_ACROSS;
        let held = want
            + travel * give.dot(travel).clamp(-along, along)
            + across * give.dot(across).clamp(-side, side);
        limb.goal = if goal.pin_ball {
            let foot = Quat::from_rotation_y(goal.plant_yaw - cadence.yaw) * (ankle - ball);
            Vec3::new(held.x, ball.y.max(pin.y), held.z) + foot
        } else {
            let lift = (pin.y + goal.ankle_height - ankle.y).max(0.0);
            Vec3::new(held.x, ankle.y + lift, held.z)
        };
        let reach = (ankle - hip).length().max(cadence.leg_length * HOLD_REACH);
        let span = limb.goal - hip;
        if span.length() > reach && goal.base.length_squared() > 0.0 {
            limb.goal = hip + span.normalize_or(Vec3::NEG_Y) * reach;
        } else if span.length() > reach {
            let pull = limb.goal - ankle;
            let mut lo = 0.0;
            let mut hi = 1.0;
            for _ in 0..8 {
                let mid = (lo + hi) * 0.5;
                if (ankle + pull * mid - hip).length() > reach {
                    hi = mid;
                } else {
                    lo = mid;
                }
            }
            limb.goal = ankle + pull * lo;
        }
        goal.carry = limb.goal - ankle;

        limb.weight = goal.grounded
            * if cadence.shot.is_some() {
                1.0
            } else {
                cadence.weight
            };
        goal.stepping = true;
        goal.rest = None;
    } else {
        if goal.plant.is_some()
            && cadence.weight >= 0.99
            && cadence.shot.is_none()
            && goal.low < f32::MAX
        {
            goal.sample = Some(goal.ankle_height - goal.low);
        }
        goal.plant = None;
        goal.stepping = false;
        goal.still = if ankle.distance(goal.last_ankle) < 0.002 {
            goal.still.saturating_add(1)
        } else {
            0
        };
        goal.last_ankle = ankle;
        let settled = cadence.stride_count > 0 || goal.still >= 3;
        let resting = !full && !cadence.hold && cadence.speed <= REST_SPEED && goal.grounded > 0.9;
        if resting && (goal.rest.is_some() || settled) {
            let origin = body.unwrap_or(Vec3::ZERO);
            let turn = Quat::from_rotation_y(cadence.yaw);
            let held = match goal.rest {
                Some(_) => origin + turn * goal.rest_local,
                None => ankle + goal.carry,
            };
            let held = if held.distance(ankle) > cadence.leg_length * REST_REACH {
                ankle
            } else {
                held
            };
            goal.rest_local = turn.inverse() * (held - origin);
            goal.rest = Some(held);
            goal.carry = Vec3::ZERO;
            limb.goal = Vec3::new(held.x, held.y.max(floor.y), held.z);
            limb.weight = goal.grounded;
            return;
        }
        goal.rest = None;
        goal.carry *= (-cadence.frame_dt / CARRY_FADE).exp();
        let carried = ankle + goal.carry;
        let sink = floor.y - carried.y;
        if sink > 0.0 {
            limb.goal = Vec3::new(carried.x, floor.y, carried.z);
            limb.weight = goal.grounded * cadence.weight;
        } else if goal.carry.length_squared() > 1e-6 {
            limb.goal = carried;
            limb.weight = goal.grounded * cadence.weight;
        } else {
            limb.goal = ankle;
            limb.weight = 0.0;
        }
    }
}

/// Prints the whole vertical chain once a second: where physics thinks the
/// body is, where the terrain is under it, and where each ankle actually ended
/// up. Guessing at which of those is wrong costs more than measuring it.
fn report(
    show: Res<FootIkDebug>,
    time: Res<Time>,
    mut next: Local<f32>,
    bodies: Query<(Entity, &GlobalTransform, &Grounded, &Cadence), With<Character>>,
    globals: Query<&GlobalTransform>,
    limbs: Query<(&IkLimb, &IkLimbBones, &FootGoal)>,
) {
    if !show.0 {
        return;
    }
    let now = time.elapsed_secs();
    if now < *next {
        return;
    }
    *next = now + 1.0;

    for (entity, body, grounded, cadence) in &bodies {
        let p = body.translation();
        let terrain = height_at(p.x, p.z);
        let mut feet = String::new();
        for (limb, bones, goal) in &limbs {
            if goal.character != entity {
                continue;
            }
            if let Ok(ankle) = globals.get(bones.tip) {
                feet += &format!(
                    " | {} ankle {:+.3} goal {:+.3} w {:.2} pin {}",
                    if goal.right { "R" } else { "L" },
                    ankle.translation().y,
                    limb.goal.y,
                    limb.weight,
                    goal.plant.is_some()
                );
            }
        }
        info!(
            "body {:+.3} terrain {:+.3} gap {:+.3} grounded {} speed {:.2} dir {:+.0} phase {:.2} period {:.2} duty {:.2}/{:.2} contact_r {:.2}{}",
            p.y,
            terrain,
            p.y - terrain,
            grounded.0,
            cadence.speed,
            cadence.direction,
            cadence.phase,
            cadence.blend.map(|b| b.stride_period).unwrap_or(0.0),
            cadence.blend.map(|b| b.feet[0].duty).unwrap_or(0.0),
            cadence.blend.map(|b| b.feet[1].duty).unwrap_or(0.0),
            cadence.blend.map(|b| b.feet[1].contact).unwrap_or(0.0),
            feet
        );
    }
}

/// Logs each time a character's right foot lands left of its left foot, with what the stride was doing.
fn detect_crossing(
    mut crossed: Local<bevy::platform::collections::HashSet<Entity>>,
    bodies: Query<(Entity, &GlobalTransform, &Cadence), With<Character>>,
    globals: Query<&GlobalTransform>,
    limbs: Query<(&IkLimbBones, &FootGoal)>,
) {
    for (entity, _, cadence) in &bodies {
        let mut left = None;
        let mut right = None;
        for (bones, goal) in &limbs {
            if goal.character != entity {
                continue;
            }
            let Ok(ankle) = globals.get(bones.tip) else {
                continue;
            };
            if goal.right {
                right = Some(ankle.translation());
            } else {
                left = Some(ankle.translation());
            }
        }
        let (Some(left), Some(right)) = (left, right) else {
            continue;
        };
        let side = cadence.forward.cross(Vec3::Y);
        let gap = (right - left).dot(side);
        let is_crossed = gap < -0.02;
        let was = crossed.contains(&entity);
        if is_crossed && !was {
            warn!(
                "CROSS {entity} gap {gap:+.3} stepping {} speed {:.2} dir {:+.0} turn {:.2} phase {:.2}",
                cadence.stepping,
                cadence.speed,
                cadence.direction,
                cadence.turn_rate,
                cadence.phase
            );
            crossed.insert(entity);
        } else if !is_crossed && was {
            crossed.remove(&entity);
        }
    }
}
