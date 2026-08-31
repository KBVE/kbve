mod engine;
mod net;
mod system;
mod table;
#[cfg(test)]
mod tests;

use bevy::app::App;

pub use engine::*;
pub use system::apply_blackjack;
pub use table::{BjInput, PendingBlackjack, TableDef, TableRegistry, Tables};

pub fn plugin(app: &mut App) {
    app.insert_resource(PendingBlackjack::default())
        .insert_resource(TableRegistry::default());
}
