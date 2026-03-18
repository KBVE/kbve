//! Shared netcode configuration for KBVE multiplayer.
//!
//! Provides protocol constants, private key loading, and token serialization
//! helpers used by both client and server.

use base64::Engine;
use base64::engine::general_purpose::STANDARD as BASE64;
use lightyear::netcode::{CONNECT_TOKEN_BYTES, ConnectToken, USER_DATA_BYTES};

/// Protocol ID — must match between client, server, and token issuer.
/// Bump this when making breaking protocol changes.
pub const KBVE_PROTOCOL_ID: u64 = 0x4B42_5645_0001;

/// Default private key for local development (all zeros).
/// In production, set `GAME_PRIVATE_KEY` env var to a hex-encoded 32-byte key.
pub const DEV_PRIVATE_KEY: [u8; 32] = [0u8; 32];

/// Read `GAME_PRIVATE_KEY` from the environment (hex-encoded 32 bytes),
/// falling back to [`DEV_PRIVATE_KEY`] if unset.
pub fn load_private_key() -> [u8; 32] {
    match std::env::var("GAME_PRIVATE_KEY") {
        Ok(hex_str) => {
            let bytes = hex::decode(hex_str.trim()).expect("GAME_PRIVATE_KEY must be valid hex");
            assert_eq!(bytes.len(), 32, "GAME_PRIVATE_KEY must be exactly 32 bytes");
            let mut key = [0u8; 32];
            key.copy_from_slice(&bytes);
            key
        }
        Err(_) => DEV_PRIVATE_KEY,
    }
}

/// Encode a [`ConnectToken`] as base64 for HTTP transport.
pub fn token_to_base64(token: ConnectToken) -> Result<String, String> {
    let bytes = token
        .try_into_bytes()
        .map_err(|e| format!("token serialization failed: {e}"))?;
    Ok(BASE64.encode(bytes))
}

/// Decode a base64 string into raw token bytes suitable for
/// [`ConnectToken::try_from_bytes`].
pub fn base64_to_token_bytes(b64: &str) -> Result<[u8; CONNECT_TOKEN_BYTES], String> {
    let decoded = BASE64
        .decode(b64)
        .map_err(|e| format!("base64 decode failed: {e}"))?;
    if decoded.len() != CONNECT_TOKEN_BYTES {
        return Err(format!(
            "expected {CONNECT_TOKEN_BYTES} bytes, got {}",
            decoded.len()
        ));
    }
    let mut buf = [0u8; CONNECT_TOKEN_BYTES];
    buf.copy_from_slice(&decoded);
    Ok(buf)
}

/// Pack a user-ID string (e.g. Supabase UUID) into the 256-byte `user_data`
/// field of a [`ConnectToken`].
///
/// Layout: `[1-byte length][utf-8 bytes][zero padding]`
pub fn pack_user_data(user_id: &str) -> [u8; USER_DATA_BYTES] {
    let mut data = [0u8; USER_DATA_BYTES];
    let id_bytes = user_id.as_bytes();
    let len = id_bytes.len().min(USER_DATA_BYTES - 1);
    data[0] = len as u8;
    data[1..1 + len].copy_from_slice(&id_bytes[..len]);
    data
}

/// Unpack a user-ID string from the 256-byte `user_data` field.
/// Returns `None` if the field is empty or malformed.
pub fn unpack_user_data(data: &[u8; USER_DATA_BYTES]) -> Option<String> {
    let len = data[0] as usize;
    if len == 0 || len >= USER_DATA_BYTES {
        return None;
    }
    String::from_utf8(data[1..1 + len].to_vec()).ok()
}

/// Deterministically derive a netcode `client_id` (u64) from a user UUID string.
/// Uses a simple FNV-1a hash so the same user always gets the same client_id.
pub fn user_id_to_client_id(user_id: &str) -> u64 {
    let mut hash: u64 = 0xcbf29ce484222325; // FNV offset basis
    for byte in user_id.bytes() {
        hash ^= byte as u64;
        hash = hash.wrapping_mul(0x100000001b3); // FNV prime
    }
    // Ensure non-zero (netcode rejects client_id 0)
    if hash == 0 {
        hash = 1;
    }
    hash
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn pack_unpack_roundtrip() {
        let uuid = "550e8400-e29b-41d4-a716-446655440000";
        let packed = pack_user_data(uuid);
        let unpacked = unpack_user_data(&packed).unwrap();
        assert_eq!(uuid, unpacked);
    }

    #[test]
    fn pack_empty_returns_none() {
        let packed = pack_user_data("");
        assert!(unpack_user_data(&packed).is_none());
    }

    #[test]
    fn client_id_deterministic() {
        let a = user_id_to_client_id("test-user-123");
        let b = user_id_to_client_id("test-user-123");
        assert_eq!(a, b);
        assert_ne!(a, 0);
    }

    #[test]
    fn client_id_different_for_different_users() {
        let a = user_id_to_client_id("user-a");
        let b = user_id_to_client_id("user-b");
        assert_ne!(a, b);
    }
}
