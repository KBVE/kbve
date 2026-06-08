pub mod grid;
pub mod net;
pub mod proto;
pub mod sim;

#[cfg(feature = "supabase-auth")]
pub mod auth;

pub use net::{Roster, ServerState, SlotInput, router};
pub use sim::{SIM_TICK_HZ, SNAPSHOT_BROADCAST_CAPACITY, SimConfig, build_app, run_sim_loop};
