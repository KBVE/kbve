use core::time::Duration;

use bevy::animation::RepeatAnimation;
use bevy::animation::transition::AnimationTransitions;
use bevy::gltf::GltfAssetLabel;
use bevy::prelude::*;

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

/// Root of the spawned glTF, kept so systems can find the skeleton under it.
#[derive(Component)]
pub struct CharacterModel;

/// The `AnimationPlayer` the glTF loader created, hoisted onto the character.
#[derive(Component)]
pub struct CharacterAnimator(pub Entity);

/// Locomotion clips, as graph nodes.
#[derive(Resource)]
pub struct Locomotion {
    pub idle: AnimationNodeIndex,
    pub walk: AnimationNodeIndex,
    pub jog: AnimationNodeIndex,
    pub sprint: AnimationNodeIndex,
    pub jump: AnimationNodeIndex,
    pub graph: Handle<AnimationGraph>,
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

impl Plugin for CharacterPlugin {
    fn build(&self, app: &mut App) {
        app.add_systems(Startup, load_locomotion)
            .add_systems(Update, drive_gait);
    }
}

fn load_locomotion(
    mut commands: Commands,
    assets: Res<AssetServer>,
    mut graphs: ResMut<Assets<AnimationGraph>>,
) {
    let clip = |index: usize| assets.load(GltfAssetLabel::Animation(index).from_asset(CLIPS));
    let (graph, nodes) = AnimationGraph::from_clips([
        clip(CLIP_IDLE),
        clip(CLIP_WALK),
        clip(CLIP_JOG),
        clip(CLIP_SPRINT),
        clip(CLIP_JUMP),
    ]);

    commands.insert_resource(Locomotion {
        idle: nodes[0],
        walk: nodes[1],
        jog: nodes[2],
        sprint: nodes[3],
        jump: nodes[4],
        graph: graphs.add(graph),
    });
}

/// The component to hang on a character so the glTF spawns under it.
pub fn model_root(assets: &AssetServer) -> impl Bundle {
    (
        CharacterModel,
        WorldAssetRoot(assets.load(GltfAssetLabel::Scene(0).from_asset(MODEL))),
    )
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

/// How long a gait change takes to cross-fade.
const BLEND: Duration = Duration::from_millis(180);

fn drive_gait(
    locomotion: Option<Res<Locomotion>>,
    characters: Query<(Ref<Gait>, &CharacterAnimator)>,
    mut players: Query<(&mut AnimationPlayer, &mut AnimationTransitions)>,
) {
    let Some(locomotion) = locomotion else {
        return;
    };
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
