use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine};
use hmac::{Hmac, KeyInit, Mac};
use sha2::Sha256;
use std::sync::OnceLock;
use std::time::{SystemTime, UNIX_EPOCH};

type HmacSha256 = Hmac<Sha256>;

const PREFIX: &str = "rmt";
const SCOPE: &str = "reel";
pub const DEFAULT_TTL_SECS: i64 = 300;

fn secret() -> Option<&'static [u8]> {
    static S: OnceLock<Option<Vec<u8>>> = OnceLock::new();
    S.get_or_init(|| {
        std::env::var("REEL_MEDIA_TOKEN_SECRET")
            .or_else(|_| std::env::var("REEL_API_TOKEN"))
            .ok()
            .filter(|s| !s.trim().is_empty())
            .map(String::into_bytes)
    })
    .as_deref()
}

pub fn now_unix() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs() as i64)
        .unwrap_or(0)
}

fn message(exp: i64, uid: &str) -> String {
    format!("{SCOPE}:{exp}:{uid}")
}

fn sign_with(secret: &[u8], exp: i64, uid: &str) -> String {
    let mut mac = HmacSha256::new_from_slice(secret).expect("hmac accepts any key length");
    mac.update(message(exp, uid).as_bytes());
    URL_SAFE_NO_PAD.encode(mac.finalize().into_bytes())
}

fn mint_with(secret: &[u8], exp: i64, uid: &str) -> String {
    format!("{PREFIX}.{exp}.{uid}.{}", sign_with(secret, exp, uid))
}

fn verify_with(secret: &[u8], token: &str, now: i64) -> Option<String> {
    let mut parts = token.split('.');
    if parts.next()? != PREFIX {
        return None;
    }
    let exp: i64 = parts.next()?.parse().ok()?;
    let uid = parts.next()?;
    let sig = parts.next()?;
    if parts.next().is_some() {
        return None;
    }
    if exp <= now {
        return None;
    }
    let expected = URL_SAFE_NO_PAD.decode(sig).ok()?;
    let mut mac = HmacSha256::new_from_slice(secret).expect("hmac accepts any key length");
    mac.update(message(exp, uid).as_bytes());
    mac.verify_slice(&expected).ok()?;
    Some(uid.to_string())
}

pub fn mint_media_token(uid: &str, ttl_secs: i64, now: i64) -> Option<String> {
    Some(mint_with(secret()?, now + ttl_secs, uid))
}

pub fn verify_media_token(token: &str, now: i64) -> Option<String> {
    verify_with(secret()?, token, now)
}

pub fn is_media_token(token: &str) -> bool {
    token.starts_with("rmt.")
}

#[cfg(test)]
mod tests {
    use super::*;

    const KEY: &[u8] = b"test-secret-key";

    #[test]
    fn mint_then_verify_roundtrips() {
        let tok = mint_with(KEY, 1_000, "user-abc");
        assert!(is_media_token(&tok));
        assert_eq!(verify_with(KEY, &tok, 999).as_deref(), Some("user-abc"));
    }

    #[test]
    fn expired_token_rejected() {
        let tok = mint_with(KEY, 1_000, "user-abc");
        assert_eq!(verify_with(KEY, &tok, 1_000), None);
        assert_eq!(verify_with(KEY, &tok, 1_500), None);
    }

    #[test]
    fn tampered_or_wrong_key_rejected() {
        let tok = mint_with(KEY, 1_000, "user-abc");
        assert_eq!(verify_with(b"other-key", &tok, 500), None);
        let swapped = tok.replace("user-abc", "user-xyz");
        assert_eq!(verify_with(KEY, &swapped, 500), None);
    }

    #[test]
    fn malformed_tokens_rejected() {
        assert_eq!(verify_with(KEY, "rmt.notanumber.u.sig", 0), None);
        assert_eq!(verify_with(KEY, "jwt.1000.u.sig", 0), None);
        assert_eq!(verify_with(KEY, "rmt.1000.u.sig.extra", 0), None);
        assert_eq!(verify_with(KEY, "rmt.1000.u", 0), None);
    }
}
