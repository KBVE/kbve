mod chuckrpg;
mod clickhouse;
mod core;
mod firecracker;
mod guacamole;
mod kasm;
mod kubevirt;
mod reel;
mod simple;
mod vibeshine;
mod windmill;

pub(crate) use core::{require_dashboard_manage_with_query, require_dashboard_view};

pub use chuckrpg::*;
pub use clickhouse::*;
pub use firecracker::*;
pub use guacamole::*;
pub use kasm::*;
pub use kubevirt::*;
pub use reel::*;
pub use simple::*;
pub use vibeshine::*;
pub use windmill::*;
