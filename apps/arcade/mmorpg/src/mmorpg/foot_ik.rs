use avian3d::prelude::*;
use bevy::app::AnimationSystems;
use bevy::ecs::system::SystemParam;
use bevy::prelude::*;
use bevy::transform::TransformSystems;
use kinetree::{IkLimb, IkLimbBones, KinetreeSystems, bone_world_transform};

use super::character::{Cadence, Character, Grounded, Heading, LowerBody};
use super::rig::{GaitBlend, GaitSet, Rig, at};
use super::world::height_at;

/// How far above and below the current ankle the ground is looked for. Past
/// this the leg is over a cliff and the clip is left alone.
const PROBE_UP: f32 = 0.6;
const PROBE_DOWN: f32 = 1.2;

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
            .add_systems(Update, (toggle, draw_probes, report, detect_crossing))
            .add_systems(
                PostUpdate,
                (advance_stride, pose_lower_body)
                    .chain()
                    .after(AnimationSystems)
                    .before(aim_feet),
            )
            // Between the animation writing its bones and the solver reading
            // them. In Update this ran a frame late and, worse, measured the
            // ankle the solver had already moved -- so a planted foot could
            // never register as lifting and never released.
            .add_systems(
                PostUpdate,
                aim_feet
                    .after(AnimationSystems)
                    .before(KinetreeSystems)
                    .before(TransformSystems::Propagate),
            )
            .add_systems(
                PostUpdate,
                level_feet
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

/// Facing turn rate, radians per second, at which a pinned foot fully lets go and follows its home spot.
const TURN_RELEASE: f32 = 2.0;

/// Below this ground speed a character is standing, and its feet follow the clip.
const STEP_SPEED: f32 = 0.15;

impl Default for FootIkEnabled {
    fn default() -> Self {
        Self(true)
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

/// The three views needed to read a pose: bone locals to compose from, the
/// parent links to compose along, and the propagated globals for the coarse
/// distance test.
#[derive(SystemParam)]
struct Pose<'w, 's> {
    transforms: Query<'w, 's, &'static Transform>,
    parents: Query<'w, 's, &'static ChildOf>,
    globals: Query<'w, 's, &'static GlobalTransform>,
    cadences: Query<'w, 's, &'static Cadence>,
}

fn advance_stride(
    time: Res<Time>,
    rig: Res<Rig>,
    mode: Res<FootIkMode>,
    sets: Res<Assets<GaitSet>>,
    transforms: Query<&Transform>,
    mut characters: Query<(
        &mut Cadence,
        &LinearVelocity,
        &LowerBody,
        &Grounded,
        &Heading,
    )>,
) {
    let set = rig.gaits.as_ref().and_then(|handle| sets.get(handle));
    let dt = time.delta_secs();
    for (mut stride, velocity, lower, grounded, heading) in &mut characters {
        let planar = Vec3::new(velocity.x, 0.0, velocity.z);
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
        let rate = if dt > 0.0 { (delta / dt).abs() } else { 0.0 };
        stride.turn_rate += (rate - stride.turn_rate) * (10.0 * dt).min(1.0);
        stride.yaw = yaw;
        let right = stride.forward.cross(Vec3::Y);
        stride.direction = if stride.speed > STEP_SPEED && heading.0.is_some() {
            planar
                .dot(right)
                .atan2(planar.dot(stride.forward))
                .to_degrees()
        } else {
            0.0
        };
        if heading.0.is_none() {
            stride.velocity = stride.forward * stride.speed;
        }
        let moving = grounded.0 && stride.speed > STEP_SPEED;
        let fresh = match set {
            Some(set) if stride.leg_length > 0.0 && moving => {
                set.blend(stride.speed / stride.leg_length, stride.direction)
            }
            _ => None,
        };
        let wants = *mode == FootIkMode::Procedural && fresh.is_some_and(|b| b.stride_period > 0.0);
        if wants {
            stride.blend = fresh;
            stride.settle = None;
        } else if stride.weight > 0.001 {
            if stride.settle.is_none() && grounded.0 && *mode == FootIkMode::Procedural {
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
            let period = stride.blend.map(|b| b.stride_period).unwrap_or(1.0);
            let mut advance = dt / period;
            if let Some(left) = stride.settle.as_mut() {
                advance = advance.min(*left);
                *left -= advance;
            }
            stride.phase = (stride.phase + advance).rem_euclid(1.0);
        }
    }
}

fn pose_lower_body(
    characters: Query<(&Cadence, &LowerBody)>,
    mut transforms: Query<&mut Transform>,
) {
    for (cadence, lower) in &characters {
        if !cadence.stepping {
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
            .map(|b| (at(&b.bob, cadence.phase) - (1.0 - b.hip_height)) * cadence.leg_length)
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

/// Holds each procedural foot at its bind orientation in world space, whatever the knee did.
fn level_feet(
    characters: Query<(&Cadence, &LowerBody)>,
    goals: Query<(&FootGoal, &IkLimbBones)>,
    parents: Query<&ChildOf>,
    mut transforms: Query<&mut Transform>,
) {
    for (cadence, lower) in &characters {
        if !cadence.stepping {
            continue;
        }
        let pinned_yaw = |foot: Entity| {
            goals
                .iter()
                .find(|(_, bones)| bones.tip == foot)
                .and_then(|(goal, _)| goal.plant.map(|_| goal.plant_yaw))
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
                let heading = pinned_yaw(leg.foot)
                    .map(|yaw| Quat::from_rotation_y(yaw - cadence.yaw))
                    .unwrap_or(Quat::IDENTITY);
                let desired = heading * model.rotation * tilt * leg.foot_rest;
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
    enabled: Res<FootIkEnabled>,
    mode: Res<FootIkMode>,
    spatial: SpatialQuery,
    camera: Single<&GlobalTransform, With<Camera3d>>,
    pose: Pose,
    mut limbs: Query<(&mut IkLimb, &IkLimbBones, &mut FootGoal)>,
) {
    let step = (BLEND_RATE * time.delta_secs()).min(1.0);
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
            let filter = SpatialQueryFilter::default().with_excluded_entities([goal.character]);
            let ground = |probe: Vec3| {
                let origin = Vec3::new(probe.x, ankle.y + PROBE_UP, probe.z);
                enabled
                    .0
                    .then(|| {
                        spatial.cast_ray(origin, Dir3::NEG_Y, PROBE_UP + PROBE_DOWN, true, &filter)
                    })
                    .flatten()
                    .map(|hit| origin + Vec3::NEG_Y * hit.distance)
            };

            let cadence = pose.cadences.get(goal.character).ok();
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

            let Some(hit) = ground(ankle) else {
                goal.grounded -= goal.grounded * step;
                goal.plant = None;
                limb.weight = 0.0;
                return;
            };
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
                *mode == FootIkMode::Lock && cadence.is_some_and(|c| c.speed > STEP_SPEED);
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
#[allow(clippy::too_many_arguments)]
fn step_foot(
    limb: &mut IkLimb,
    goal: &mut FootGoal,
    cadence: &Cadence,
    blend: &GaitBlend,
    pose: &Pose,
    ankle: Vec3,
    ground: &dyn Fn(Vec3) -> Option<Vec3>,
    step: f32,
) {
    let Ok(body) = pose.globals.get(goal.character) else {
        return;
    };
    let body = body.translation();
    let right = cadence.forward.cross(Vec3::Y).normalize_or_zero();
    let foot = &blend.feet[goal.right as usize];
    let phase = cadence.phase;
    let leg = cadence.leg_length;
    let place = |fwd: f32, side: f32| cadence.forward * (fwd * leg) + right * (side * leg);
    let local = |point: Vec3| {
        let rel = point - body;
        Vec2::new(rel.dot(cadence.forward), rel.dot(right))
    };
    let turning = (cadence.turn_rate / TURN_RELEASE).clamp(0.0, 1.0);
    let since_contact = (phase - foot.contact).rem_euclid(1.0);

    if !goal.stepping {
        goal.stepping = true;
        goal.plant = ground(ankle).map(|g| g + Vec3::Y * goal.ankle_height);
        goal.plant_yaw = cadence.yaw;
        goal.from = goal.plant.unwrap_or(ankle);
    }

    let home = body + place(at(&foot.fwd, phase), at(&foot.side, phase));
    let target = if since_contact < foot.duty {
        if goal.plant.is_none() {
            goal.plant = Some(limb.goal);
            goal.plant_yaw = cadence.yaw;
        }
        let pin = goal.plant.unwrap_or(home);
        let drift = Vec3::new(pin.x - home.x, 0.0, pin.z - home.z).length();
        let t = (drift / LOCK_DRIFT).clamp(0.0, 1.0);
        let hold = (1.0 - t * t * (3.0 - 2.0 * t)) * (1.0 - turning * turning);
        let settled = ground(home)
            .map(|g| g + Vec3::Y * goal.ankle_height)
            .unwrap_or(home)
            .lerp(pin, hold);
        goal.plant = Some(settled);
        Some(settled)
    } else {
        if let Some(plant) = goal.plant.take() {
            goal.from = plant;
            goal.from_local = local(plant);
        }
        let carried = body + cadence.forward * goal.from_local.x + right * goal.from_local.y;
        let from = Vec3::new(
            goal.from.x + (carried.x - goal.from.x) * turning,
            goal.from.y,
            goal.from.z + (carried.z - goal.from.z) * turning,
        );
        let t = (since_contact - foot.duty) / (1.0 - foot.duty);
        let ease = t * t * (3.0 - 2.0 * t);
        let time_to_land = (1.0 - since_contact) * blend.stride_period;
        let probe = body
            + cadence.velocity * time_to_land
            + place(at(&foot.fwd, foot.contact), at(&foot.side, foot.contact));
        ground(probe).map(|land| {
            let land = land + Vec3::Y * goal.ankle_height;
            from.lerp(land, ease) + Vec3::Y * at(&foot.lift, phase) * leg
        })
    };

    match target {
        Some(target) => {
            limb.goal = target;
            goal.grounded += (1.0 - goal.grounded) * step;
        }
        None => goal.grounded -= goal.grounded * step,
    }
    limb.weight = goal.grounded * cadence.weight;
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
