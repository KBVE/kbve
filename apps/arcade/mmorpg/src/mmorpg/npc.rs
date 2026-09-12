//! What the training dummies do when the player is in reach.
//!
//! `bevy_behavior` supplies the tree and `bevy_pathfinder` the route; neither
//! knows anything about this game, so the observation type, the action type and
//! the leaves live here.
//!
//! A dummy guards a post. It chases anything hostile that comes close, gives up
//! when the chase would take it too far from that post, and walks back. The
//! leash is what keeps them a fixture of the clearing rather than a train the
//! player can drag across the map, and it is why the tree needs a second
//! behaviour at all -- without the walk back, a dummy that chased once would
//! simply stop wherever it lost interest.
//!
//! The flow field is shared. Every dummy is heading for the same player, and a
//! field answers "which way from here" for the whole grid at once, so one
//! computation serves all of them.

use bevy::prelude::*;
use bevy_behavior::{
    Aware, BehaviorContext, BehaviorNode, EntitySnapshot, Healthed, NodeStatus, Positioned,
    Selector, Sequence, TickCooldown, Ticked,
};
use bevy_pathfinder::flow_field::FlowField;
use bevy_pathfinder::grid::BlockGrid;
use combat::{CombatSystems, Combatant, Dead};

use super::character::{CharacterSystems, MoveIntent};
use super::combat::Faction;
use super::nav::{build_grid, cell_to_world, world_to_cell};
use super::player::Player;

/// Half-width in cells of the navigation grid around the origin.
///
/// The posts sit 9 m out and the leash is 22 m, so 48 covers everywhere a
/// dummy can legally be with room for the player to stand beyond it. Doubling
/// it quadruples the startup cost for ground no dummy can reach.
const GRID_RADIUS: i32 = 48;

/// How close the player must come before a dummy reacts.
const AGGRO_RANGE: f32 = 14.0;

/// How far a dummy will stray from its post before giving up.
const LEASH_RANGE: f32 = 22.0;

/// Close enough to the post to count as home.
const HOME_TOLERANCE: f32 = 1.2;

/// Where a dummy stands when nothing is happening.
#[derive(Component)]
pub struct Post(pub Vec3);

/// The walkable grid, built once from the terrain.
#[derive(Resource)]
pub struct NavGrid(pub BlockGrid);

/// The current route to the player, recomputed when they change cell.
#[derive(Resource, Default)]
pub struct Pursuit {
    goal: Option<(i32, i32)>,
    field: Option<FlowField>,
}

/// What a dummy decided to do this frame.
#[derive(Debug, Clone, Copy, PartialEq)]
pub enum NpcAction {
    /// Walk toward a world position.
    Approach(Vec3),
    /// Stand still.
    Hold,
}

/// Everything a dummy can see, as the tree sees it.
pub struct DummyView {
    position: Vec3,
    home: Vec3,
    health: f32,
    max_health: f32,
    nearby: Vec<EntitySnapshot>,
    tick: u64,
}

impl Positioned for DummyView {
    fn position(&self) -> [f64; 3] {
        [
            self.position.x as f64,
            self.position.y as f64,
            self.position.z as f64,
        ]
    }
}

impl Healthed for DummyView {
    fn current_health(&self) -> f32 {
        self.health
    }

    fn max_health(&self) -> f32 {
        self.max_health
    }
}

impl Aware for DummyView {
    fn nearby_entities(&self) -> &[EntitySnapshot] {
        &self.nearby
    }
}

impl Ticked for DummyView {
    fn tick(&self) -> u64 {
        self.tick
    }
}

impl DummyView {
    /// The nearest hostile inside `range`, if there is one.
    fn intruder(&self, range: f32) -> Option<Vec3> {
        self.nearby
            .iter()
            .filter(|entity| entity.is_hostile)
            .map(|entity| {
                Vec3::new(
                    entity.position[0] as f32,
                    entity.position[1] as f32,
                    entity.position[2] as f32,
                )
            })
            .filter(|position| position.distance(self.position) <= range)
            .min_by(|a, b| {
                a.distance_squared(self.position)
                    .total_cmp(&b.distance_squared(self.position))
            })
    }

    fn distance_from_post(&self) -> f32 {
        self.position.distance(self.home)
    }
}

/// Chase the nearest intruder, so long as the post is still within reach.
struct GuardPost;

impl BehaviorNode<DummyView, NpcAction> for GuardPost {
    fn evaluate(
        &self,
        view: &DummyView,
        _ctx: &mut BehaviorContext<'_>,
    ) -> (NodeStatus, Vec<NpcAction>) {
        if view.distance_from_post() >= LEASH_RANGE {
            return (NodeStatus::Failure, vec![]);
        }

        match view.intruder(AGGRO_RANGE) {
            Some(target) => (NodeStatus::Running, vec![NpcAction::Approach(target)]),
            None => (NodeStatus::Failure, vec![]),
        }
    }
}

/// Walk back to the post, and report success only once standing on it.
struct ReturnToPost;

impl BehaviorNode<DummyView, NpcAction> for ReturnToPost {
    fn evaluate(
        &self,
        view: &DummyView,
        _ctx: &mut BehaviorContext<'_>,
    ) -> (NodeStatus, Vec<NpcAction>) {
        if view.distance_from_post() <= HOME_TOLERANCE {
            return (NodeStatus::Failure, vec![]);
        }

        (NodeStatus::Running, vec![NpcAction::Approach(view.home)])
    }
}

/// Stand still. The last child of the selector, so it runs when nothing else
/// wanted to.
struct Idle;

impl BehaviorNode<DummyView, NpcAction> for Idle {
    fn evaluate(
        &self,
        _view: &DummyView,
        _ctx: &mut BehaviorContext<'_>,
    ) -> (NodeStatus, Vec<NpcAction>) {
        (NodeStatus::Success, vec![NpcAction::Hold])
    }
}

/// The shared tree. Priority order, highest first.
#[derive(Resource)]
pub struct DummyBrain {
    tree: Box<dyn BehaviorNode<DummyView, NpcAction>>,
    cooldown: TickCooldown,
    global: TickCooldown,
}

impl Default for DummyBrain {
    fn default() -> Self {
        Self {
            tree: Box::new(Selector {
                children: vec![
                    Box::new(Sequence {
                        children: vec![Box::new(GuardPost)],
                    }),
                    Box::new(ReturnToPost),
                    Box::new(Idle),
                ],
            }),
            cooldown: TickCooldown::new(0),
            global: TickCooldown::new(0),
        }
    }
}

impl DummyBrain {
    /// Runs the tree for one dummy.
    pub fn decide(&mut self, view: &DummyView) -> Vec<NpcAction> {
        let mut ctx = BehaviorContext {
            current_tick: view.tick,
            per_npc: &mut self.cooldown,
            global: &mut self.global,
        };
        self.tree.evaluate(view, &mut ctx).1
    }
}

pub struct NpcPlugin;

impl Plugin for NpcPlugin {
    fn build(&self, app: &mut App) {
        app.init_resource::<Pursuit>()
            .init_resource::<DummyBrain>()
            .add_systems(Startup, build_nav_grid)
            .add_systems(
                Update,
                (route_to_player, steer_dummies)
                    .chain()
                    .after(CombatSystems)
                    .before(CharacterSystems),
            );
    }
}

fn build_nav_grid(mut commands: Commands) {
    let span = (GRID_RADIUS * 2) as u32;
    commands.insert_resource(NavGrid(build_grid(-GRID_RADIUS, -GRID_RADIUS, span, span)));
}

/// Recomputes the shared field when the player changes cell.
///
/// A flow field costs a sweep of the whole grid, and the answer only changes
/// when the goal cell does; recomputing per frame would be the same field paid
/// for sixty times a second.
fn route_to_player(
    grid: Option<Res<NavGrid>>,
    player: Query<&Transform, LivePlayer>,
    mut pursuit: ResMut<Pursuit>,
) {
    let Some(grid) = grid else {
        return;
    };

    let Ok(transform) = player.single() else {
        pursuit.goal = None;
        pursuit.field = None;
        return;
    };

    let goal = world_to_cell(transform.translation);
    if pursuit.goal == Some(goal) {
        return;
    }

    if !grid.0.in_bounds(goal.0, goal.1) || !grid.0.is_walkable(goal.0, goal.1) {
        pursuit.goal = None;
        pursuit.field = None;
        return;
    }

    pursuit.goal = Some(goal);
    pursuit.field = Some(FlowField::compute(&grid.0, &[goal]));
}

/// Everything steering one dummy needs to read and write.
type Dummy = (
    &'static Transform,
    &'static Post,
    &'static Combatant,
    &'static mut MoveIntent,
);

/// Only the live player is an intruder.
type LivePlayer = (With<Player>, Without<Dead>);

/// A dummy is anything with a faction that is neither the player nor a corpse.
type LiveDummy = (With<Faction>, Without<Player>, Without<Dead>);

fn steer_dummies(
    mut brain: ResMut<DummyBrain>,
    pursuit: Res<Pursuit>,
    time: Res<Time>,
    player: Query<(Entity, &Transform), LivePlayer>,
    mut dummies: Query<Dummy, LiveDummy>,
) {
    let tick = time.elapsed_secs_f64() as u64;
    let seen: Vec<EntitySnapshot> = player
        .iter()
        .map(|(entity, transform)| EntitySnapshot {
            entity_id: entity.to_bits(),
            entity_type: "player".to_string(),
            position: [
                transform.translation.x as f64,
                transform.translation.y as f64,
                transform.translation.z as f64,
            ],
            health: 1.0,
            is_hostile: true,
        })
        .collect();

    for (transform, post, combatant, mut intent) in &mut dummies {
        let view = DummyView {
            position: transform.translation,
            home: post.0,
            health: combatant.health.current() as f32,
            max_health: combatant.health.max() as f32,
            nearby: seen.clone(),
            tick,
        };

        let actions = brain.decide(&view);
        let target = actions.iter().find_map(|action| match action {
            NpcAction::Approach(target) => Some(*target),
            NpcAction::Hold => None,
        });

        let Some(target) = target else {
            *intent = MoveIntent::default();
            continue;
        };

        let step = routed_step(&pursuit, transform.translation, target).unwrap_or(target);

        let wish = (step - transform.translation) * Vec3::new(1.0, 0.0, 1.0);
        intent.wish = wish.normalize_or_zero();
        intent.run = view.intruder(AGGRO_RANGE).is_some();
        intent.jump = false;
    }
}

/// The next position along the route, or `None` when the field cannot help and
/// the caller should steer straight at the target.
///
/// The field only leads to the player, so a dummy walking home is steered
/// directly; a route computed for somewhere else would send it the wrong way.
fn routed_step(pursuit: &Pursuit, from: Vec3, target: Vec3) -> Option<Vec3> {
    let field = pursuit.field.as_ref()?;
    let goal = pursuit.goal?;
    if world_to_cell(target) != goal {
        return None;
    }

    let (x, z) = world_to_cell(from);
    let (nx, nz) = field.direction(x, z)?;
    Some(cell_to_world(x + nx, z + nz))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn view(position: Vec3, home: Vec3, intruder: Option<Vec3>) -> DummyView {
        DummyView {
            position,
            home,
            health: 220.0,
            max_health: 220.0,
            nearby: intruder
                .map(|p| EntitySnapshot {
                    entity_id: 1,
                    entity_type: "player".to_string(),
                    position: [p.x as f64, p.y as f64, p.z as f64],
                    health: 1.0,
                    is_hostile: true,
                })
                .into_iter()
                .collect(),
            tick: 0,
        }
    }

    fn decide(view: &DummyView) -> Vec<NpcAction> {
        DummyBrain::default().decide(view)
    }

    #[test]
    fn a_dummy_alone_at_its_post_stands_still() {
        let home = Vec3::ZERO;
        assert_eq!(decide(&view(home, home, None)), vec![NpcAction::Hold]);
    }

    #[test]
    fn a_dummy_chases_someone_who_comes_close() {
        let home = Vec3::ZERO;
        let intruder = Vec3::new(5.0, 0.0, 0.0);
        assert_eq!(
            decide(&view(home, home, Some(intruder))),
            vec![NpcAction::Approach(intruder)]
        );
    }

    #[test]
    fn a_dummy_ignores_someone_out_of_range() {
        let home = Vec3::ZERO;
        let far = Vec3::new(AGGRO_RANGE + 5.0, 0.0, 0.0);
        assert_eq!(decide(&view(home, home, Some(far))), vec![NpcAction::Hold]);
    }

    #[test]
    fn the_leash_beats_the_chase() {
        let home = Vec3::ZERO;
        let position = Vec3::new(LEASH_RANGE + 1.0, 0.0, 0.0);
        let intruder = position + Vec3::new(2.0, 0.0, 0.0);

        assert_eq!(
            decide(&view(position, home, Some(intruder))),
            vec![NpcAction::Approach(home)],
            "a dummy past its leash chased instead of going home"
        );
    }

    #[test]
    fn a_dummy_off_its_post_walks_back() {
        let home = Vec3::ZERO;
        let position = Vec3::new(6.0, 0.0, 0.0);
        assert_eq!(
            decide(&view(position, home, None)),
            vec![NpcAction::Approach(home)]
        );
    }

    #[test]
    fn close_enough_to_the_post_counts_as_home() {
        let home = Vec3::ZERO;
        let position = Vec3::new(HOME_TOLERANCE * 0.5, 0.0, 0.0);
        assert_eq!(
            decide(&view(position, home, None)),
            vec![NpcAction::Hold],
            "a dummy already home kept shuffling toward its post"
        );
    }

    #[test]
    fn a_corpse_is_not_steered() {
        let mut app = App::new();
        app.add_plugins(MinimalPlugins).init_resource::<Pursuit>();
        app.init_resource::<DummyBrain>();
        app.add_systems(Update, steer_dummies);

        app.world_mut()
            .spawn((Player, Transform::from_xyz(0.0, 0.0, 4.0)));
        let corpse = app
            .world_mut()
            .spawn((
                Transform::from_xyz(0.0, 0.0, 0.0),
                Post(Vec3::ZERO),
                Faction::Hostile,
                Combatant::new(220, 100, combat::Stats::default()),
                MoveIntent {
                    wish: Vec3::X,
                    ..default()
                },
                Dead,
            ))
            .id();

        app.update();

        let intent = app
            .world()
            .entity(corpse)
            .get::<MoveIntent>()
            .expect("the corpse lost its move intent");
        assert_eq!(
            intent.wish,
            Vec3::X,
            "the corpse was steered; only the living are"
        );
    }

    #[test]
    fn the_nearest_intruder_is_the_one_chased() {
        let home = Vec3::ZERO;
        let mut v = view(home, home, Some(Vec3::new(9.0, 0.0, 0.0)));
        v.nearby.push(EntitySnapshot {
            entity_id: 2,
            entity_type: "player".to_string(),
            position: [3.0, 0.0, 0.0],
            health: 1.0,
            is_hostile: true,
        });

        assert_eq!(
            decide(&v),
            vec![NpcAction::Approach(Vec3::new(3.0, 0.0, 0.0))],
            "the dummy walked past the nearer intruder"
        );
    }
}
