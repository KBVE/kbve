//! HTTP-facing SOAP layer for the WoW (AzerothCore / ToCloud9) worldserver.
//!
//! AzerothCore does not speak Source RCON — the worldserver's remote-console
//! equivalent is a SOAP endpoint (`SOAP.Enabled`, default port 7878) that runs
//! the in-game GM command set over HTTP Basic auth. This module is the RCON
//! lane's twin for that protocol:
//!   * a generic env-var scheme — `SOAP_WOW_{SERVER}_{HOST|PORT|USER|PASSWORD}`,
//!   * a checked-in allowlist (`packages/data/soap/commands.yaml`) loaded
//!     via `include_str!` so the binary IS the policy boundary — there's no
//!     DB, no admin UI, no runtime reload,
//!   * a Supabase-JWT staff gate (every WoW GM command is `staff_only`),
//!   * a per-command `scope` (`realm` | `node`) echoed into the response,
//!     because the worldserver is an Agones Fleet behind an affinity-free
//!     ClusterIP and node-scoped commands fail by answering wrongly,
//!   * a hand-rolled envelope/parse pair in `transport`, since the workspace
//!     carries no XML crate and the wire shape is two known elements, and
//!   * a structured `tracing::info!` audit event with `target = "soap_audit"`
//!     so Vector → ClickHouse picks it up next to the `rcon_audit` lines.

pub mod handler;
pub mod registry;
pub mod transport;

pub use handler::exec_handler;
pub use registry::init_soap_registry;
