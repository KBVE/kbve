//! The GATT contract the firmware publishes.
//!
//! These UUIDs are the wire format shared with `apps/hardware/esp32c6-display`.
//! Changing one here without changing it there silently stops the board from
//! being recognised, so they are kept in one place rather than inline.

use serde::{Deserialize, Serialize};
use specta::Type;
use uuid::{Uuid, uuid};

pub const SERVICE: Uuid = uuid!("6b76e000-4b0f-4c0e-9d3a-9b7e0c1a5a01");
pub const DIE_DECICELSIUS: Uuid = uuid!("6b76e001-4b0f-4c0e-9d3a-9b7e0c1a5a01");
pub const UPTIME: Uuid = uuid!("6b76e002-4b0f-4c0e-9d3a-9b7e0c1a5a01");
pub const PRESSES: Uuid = uuid!("6b76e003-4b0f-4c0e-9d3a-9b7e0c1a5a01");
pub const BACKLIGHT: Uuid = uuid!("6b76e004-4b0f-4c0e-9d3a-9b7e0c1a5a01");

/// Advertised name prefix used to filter the scan list down to our own boards.
pub const NAME_PREFIX: &str = "KBVE";

#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct DeviceSummary {
    pub id: String,
    pub name: String,
    pub rssi: Option<i16>,
    pub connectable: bool,
}

/// Last known board state. Every field is optional because a characteristic
/// may not have been read yet, and reporting a stale zero as if it were a
/// reading is worse than reporting nothing.
#[derive(Debug, Clone, Default, Serialize, Deserialize, Type)]
pub struct BoardSnapshot {
    pub device_id: Option<String>,
    pub name: Option<String>,
    pub connected: bool,
    pub die_celsius: Option<f32>,
    pub uptime_seconds: Option<u32>,
    pub presses: Option<u32>,
    pub backlight_pct: Option<u8>,
}

pub fn decode_i16(bytes: &[u8]) -> Option<i16> {
    Some(i16::from_le_bytes([
        *bytes.first()?,
        bytes.get(1).copied().unwrap_or(0),
    ]))
}

pub fn decode_u32(bytes: &[u8]) -> Option<u32> {
    if bytes.is_empty() {
        return None;
    }
    let mut buf = [0u8; 4];
    for (slot, byte) in buf.iter_mut().zip(bytes.iter()) {
        *slot = *byte;
    }
    Some(u32::from_le_bytes(buf))
}

pub fn decode_u8(bytes: &[u8]) -> Option<u8> {
    bytes.first().copied()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn deci_celsius_decodes_negative_readings() {
        assert_eq!(decode_i16(&[0x81, 0x01]), Some(385));
        assert_eq!(decode_i16(&(-125i16).to_le_bytes()), Some(-125));
    }

    #[test]
    fn short_payloads_do_not_panic() {
        assert_eq!(decode_i16(&[]), None);
        assert_eq!(decode_u32(&[]), None);
        assert_eq!(decode_u8(&[]), None);
        assert_eq!(decode_u32(&[0x2a]), Some(42));
    }
}
