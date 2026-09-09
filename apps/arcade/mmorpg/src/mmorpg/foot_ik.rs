use avian3d::prelude::*;
use bevy::app::AnimationSystems;
use bevy::ecs::system::SystemParam;
use bevy::prelude::*;
use bevy::transform::TransformSystems;
use kinetree::{IkLimb, IkLimbBones, KinetreeSystems, bone_world_transform};

use super::character::{Character, Grounded};
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
            .add_systems(Update, (toggle, draw_probes, report))
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
            );
    }
}

#[derive(Resource)]
pub struct FootIkEnabled(pub bool);

impl Default for FootIkEnabled {
    fn default() -> Self {
        Self(true)
    }
}

/// Marks a limb as a leg so the goal system can find it.
#[derive(Component)]
pub struct FootGoal {
    pub character: Entity,
    /// Whether there is ground to stand on, faded over time. Kept apart from
    /// the plant weight so losing the ground is smooth while the plant/swing
    /// handoff stays instant.
    pub grounded: f32,
    /// Ankle-bone height above the sole in the rest pose.
    pub ankle_height: f32,
}

/// Gizmos and the per-character log, together: both are debug scaffolding and
/// both cost per character per frame, so neither should be on by default in a
/// world that expects crowds.
#[derive(Resource, Default)]
pub struct FootIkDebug(pub bool);

fn toggle(
    keys: Res<ButtonInput<KeyCode>>,
    mut enabled: ResMut<FootIkEnabled>,
    mut scaffold: ResMut<FootIkDebug>,
) {
    if keys.just_pressed(KeyCode::KeyI) {
        enabled.0 = !enabled.0;
        info!("foot ik {}", if enabled.0 { "on" } else { "off" });
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
    limbs: Query<(&IkLimb, &IkLimbBones), With<FootGoal>>,
) {
    if !show.0 {
        return;
    }
    for (limb, bones) in &limbs {
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
}

fn aim_feet(
    time: Res<Time>,
    enabled: Res<FootIkEnabled>,
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
            // Distance first, before any walk or cast. One frame stale, because
            // propagation has not run -- which does not matter for a 25m cutoff.
            let far = pose
                .globals
                .get(goal.character)
                .is_ok_and(|body| body.translation().distance_squared(eye) > IK_RANGE * IK_RANGE);
            if far {
                goal.grounded -= goal.grounded * step;
                limb.weight = 0.0;
                return;
            }

            // Composed from the bone chain, not read from GlobalTransform: this is
            // the pose the animation just wrote, before the solver touches it.
            let Some(ankle) = bone_world_transform(bones.tip, &pose.transforms, &pose.parents)
            else {
                return;
            };
            let ankle = ankle.translation;

            // The character's own capsule is the only thing standing between the
            // ankle and the terrain; without excluding it every ray stops on the
            // body and the feet stick to the collider's shell. Excluded by entity
            // rather than by a Player check, so an NPC's feet work the same way.
            let filter = SpatialQueryFilter::default().with_excluded_entities([goal.character]);

            let origin = ankle + Vec3::Y * PROBE_UP;
            let hit = enabled.0.then(|| {
                spatial.cast_ray(origin, Dir3::NEG_Y, PROBE_UP + PROBE_DOWN, true, &filter)
            });

            let plant = match hit.flatten() {
                Some(hit) => {
                    let ground = origin + Vec3::NEG_Y * hit.distance;
                    let target = ground + Vec3::Y * goal.ankle_height;
                    limb.goal = target;
                    goal.grounded += (1.0 - goal.grounded) * step;

                    // How far the clip is already holding this foot above where it
                    // would be planted. Negative means the clip has driven it into
                    // the ground, which the solver always corrects.
                    let lift = ankle.y - target.y;
                    if lift <= PLANT_BAND {
                        1.0
                    } else if lift >= SWING_BAND {
                        0.0
                    } else {
                        let t = (lift - PLANT_BAND) / (SWING_BAND - PLANT_BAND);
                        1.0 - t * t * (3.0 - 2.0 * t)
                    }
                }
                None => {
                    goal.grounded -= goal.grounded * step;
                    0.0
                }
            };

            limb.weight = plant * goal.grounded;
        });
}

/// Prints the whole vertical chain once a second: where physics thinks the
/// body is, where the terrain is under it, and where each ankle actually ended
/// up. Guessing at which of those is wrong costs more than measuring it.
fn report(
    show: Res<FootIkDebug>,
    time: Res<Time>,
    mut next: Local<f32>,
    bodies: Query<(&GlobalTransform, &Grounded), With<Character>>,
    globals: Query<&GlobalTransform>,
    limbs: Query<(&IkLimb, &IkLimbBones), With<FootGoal>>,
) {
    if !show.0 {
        return;
    }
    let now = time.elapsed_secs();
    if now < *next {
        return;
    }
    *next = now + 1.0;

    for (body, grounded) in &bodies {
        let p = body.translation();
        let terrain = height_at(p.x, p.z);
        let mut feet = String::new();
        for (limb, bones) in &limbs {
            if let Ok(ankle) = globals.get(bones.tip) {
                feet += &format!(
                    " | ankle {:+.3} goal {:+.3} w {:.2}",
                    ankle.translation().y,
                    limb.goal.y,
                    limb.weight
                );
            }
        }
        info!(
            "body {:+.3} terrain {:+.3} gap {:+.3} grounded {}{}",
            p.y,
            terrain,
            p.y - terrain,
            grounded.0,
            feet
        );
    }
}
