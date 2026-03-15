use bevy::prelude::*;

use crate::component::{
    NpcBundle, NpcCombatRank, NpcCombatStats, NpcId, NpcLevel, NpcName, NpcSlug, NpcTypeFlags,
};
use crate::registry::NpcRegistry;

/// Agnostic NPC plugin — initializes the `NpcRegistry` resource and provides
/// a system that resolves `NpcSlug` components into full `NpcBundle` components.
pub struct NpcPlugin;

impl Plugin for NpcPlugin {
    fn build(&self, app: &mut App) {
        app.init_resource::<NpcRegistry>();
        app.register_type::<NpcId>();
        app.register_type::<NpcSlug>();
        app.register_type::<NpcCombatStats>();
        app.register_type::<NpcName>();
        app.register_type::<NpcLevel>();
        app.register_type::<NpcCombatRank>();
        app.register_type::<NpcTypeFlags>();
        app.add_systems(Update, resolve_npc_slugs);
    }
}

/// System that resolves entities with `NpcSlug` (but no `NpcId`) into
/// full NPC components by looking up the slug in the registry.
fn resolve_npc_slugs(
    mut commands: Commands,
    registry: Res<NpcRegistry>,
    query: Query<(Entity, &NpcSlug), Without<NpcId>>,
) {
    for (entity, slug) in &query {
        if let Some(def) = registry.get_by_slug(&slug.0) {
            commands.entity(entity).insert(NpcBundle {
                id: NpcId(def.id.clone()),
                name: NpcName(def.name.clone()),
                level: NpcLevel(def.level),
                type_flags: NpcTypeFlags(def.type_flags),
                rank: NpcCombatRank(def.rank),
                stats: NpcCombatStats(def.stats.clone()),
            });
        }
    }
}
