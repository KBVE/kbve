//! HTTP-facing RCON layer for axum-kbve.
//!
//! The Source-RCON transport itself lives in `jedi::rcon`. This module wires
//! it to:
//!   * a `Game` enum (`mc` | `factorio`) that matches `kbve.rcon.Game`,
//!   * a generic env-var scheme — `RCON_{GAME}_{SERVER}_{HOST|PORT|PASSWORD}`,
//!   * a checked-in allowlist (`packages/data/rcon/commands.yaml`) loaded
//!     via `include_str!` so the binary IS the policy boundary — there's no
//!     DB, no admin UI, no runtime reload,
//!   * a Supabase-JWT staff gate (mirrors the pattern already used by forum
//!     write routes), and
//!   * a structured `tracing::info!` audit event with `target = "rcon_audit"`
//!     so Vector → ClickHouse picks it up next to the edge fn's audit lines
//!     (slice C).

pub mod handler;
pub mod registry;

pub use handler::exec_handler;
pub use registry::init_rcon_registry;
