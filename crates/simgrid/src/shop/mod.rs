mod net;
mod system;
#[cfg(test)]
mod tests;

use bevy::app::App;
use bevy::prelude::Resource;

use crate::proto;

pub use system::apply_shop;

pub enum ShopInput {
    Buy {
        npc: proto::EntityId,
        item_ref: String,
        qty: u32,
    },
    Sell {
        npc: proto::EntityId,
        item_ref: String,
        qty: u32,
    },
}

#[derive(Resource, Default)]
pub struct PendingShop(pub Vec<(proto::PlayerSlot, ShopInput)>);

pub fn plugin(app: &mut App) {
    app.insert_resource(PendingShop::default());
}
