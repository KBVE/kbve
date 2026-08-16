//! BLE central for KBVE hardware.
//!
//! The desktop app acts as the controller side of the link: it scans for
//! advertising boards, connects to one, mirrors its telemetry and writes
//! settings back. Everything here is generic over the characteristic set
//! declared in [`profile`], so a second board only needs new UUIDs.

pub mod profile;
pub mod session;

pub use profile::{BoardSnapshot, DeviceSummary};
pub use session::BleSession;
