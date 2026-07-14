mod net;
mod session;
mod system;
#[cfg(test)]
mod tests;

use bevy::app::App;

pub use session::{
    ActiveTrades, MAX_INVENTORY_SLOTS, PendingTrades, TRADE_RANGE, TRADE_TIMEOUT_TICKS, TradeInput,
    TradeSession, TradeSide,
};
pub use system::{apply_trades, expire_trades};

pub fn plugin(app: &mut App) {
    app.insert_resource(PendingTrades::default())
        .insert_resource(ActiveTrades::default());
}
