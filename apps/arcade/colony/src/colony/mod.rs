pub mod billboard;
pub mod camera;
pub mod debug;
pub mod grid;
pub mod pawn;
pub mod rules;
pub mod terrain;

use bevy::prelude::*;

use billboard::BillboardPlugin;
use camera::ColonyCameraPlugin;
use debug::DebugPlugin;
use grid::ColonyGrid;
use pawn::PawnPlugin;
use rules::ColonyRules;
use terrain::TerrainPlugin;

pub struct ColonyPlugin;

impl Plugin for ColonyPlugin {
    fn build(&self, app: &mut App) {
        app.init_resource::<ColonyGrid>()
            .init_resource::<ColonyRules>()
            .add_plugins((
                BillboardPlugin,
                TerrainPlugin,
                ColonyCameraPlugin,
                PawnPlugin,
                DebugPlugin,
            ));
    }
}
