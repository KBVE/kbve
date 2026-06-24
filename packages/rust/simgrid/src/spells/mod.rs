mod net;
mod system;

use bevy::app::App;
use bevy::prelude::Resource;

use crate::proto;

pub use system::apply_spells;

#[derive(Resource, Default)]
pub struct PendingSpells(pub Vec<(proto::PlayerSlot, String, Option<proto::EntityId>)>);

pub fn plugin(_app: &mut App) {}
