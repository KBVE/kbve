use axum::{
    extract::Request,
    http::StatusCode,
    middleware::Next,
    response::{IntoResponse, Response},
};

/// Reject requests whose decoded URI path contains path-traversal sequences.
///
/// `tower_http::ServeDir` already normalises `..` segments, but this
/// middleware blocks them earlier — saving router work and producing a
/// clear `WARN` for monitoring / alerting.
pub async fn reject_path_traversal(request: Request, next: Next) -> Response {
    let raw = request.uri().to_string();

    if contains_traversal(&raw) {
        tracing::warn!(
            uri = %raw,
            "blocked path-traversal probe"
        );
        return (StatusCode::BAD_REQUEST, "invalid request path").into_response();
    }

    next.run(request).await
}

/// Check for `..` traversal in both decoded and percent-encoded forms.
fn contains_traversal(uri: &str) -> bool {
    // Decode percent-encoded characters for comparison
    let decoded = percent_decode(uri);
    let lower = decoded.to_lowercase();

    lower.contains("..") || lower.contains("\0")
}

/// Minimal percent-decode for traversal detection (only decodes `%XX`).
fn percent_decode(s: &str) -> String {
    let bytes = s.as_bytes();
    let mut out = Vec::with_capacity(bytes.len());
    let mut i = 0;

    while i < bytes.len() {
        if bytes[i] == b'%' && i + 2 < bytes.len() {
            if let (Some(hi), Some(lo)) = (hex_val(bytes[i + 1]), hex_val(bytes[i + 2])) {
                out.push(hi << 4 | lo);
                i += 3;
                continue;
            }
        }
        out.push(bytes[i]);
        i += 1;
    }

    String::from_utf8_lossy(&out).into_owned()
}

fn hex_val(b: u8) -> Option<u8> {
    match b {
        b'0'..=b'9' => Some(b - b'0'),
        b'a'..=b'f' => Some(b - b'a' + 10),
        b'A'..=b'F' => Some(b - b'A' + 10),
        _ => None,
    }
}

/// Validate that a session ID is exactly 8 lowercase hex characters.
pub fn is_valid_session_id(id: &str) -> bool {
    id.len() == 8 && id.bytes().all(|b| b.is_ascii_hexdigit())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_contains_traversal_encoded() {
        assert!(contains_traversal("/..%2F..%2F..%2Fetc%2Fpasswd"));
        assert!(contains_traversal("/%2e%2e/%2e%2e/etc/passwd"));
        assert!(contains_traversal("/foo/../bar"));
        assert!(contains_traversal("/foo%00bar"));
    }

    #[test]
    fn test_contains_traversal_clean() {
        assert!(!contains_traversal("/health"));
        assert!(!contains_traversal("/session/abc12345"));
        assert!(!contains_traversal("/svg/game/png/deadbeef"));
        assert!(!contains_traversal("/_astro/bundle.abc123.js"));
        assert!(!contains_traversal("/api/session/abc12345"));
    }

    #[test]
    fn test_is_valid_session_id() {
        assert!(is_valid_session_id("abc12345"));
        assert!(is_valid_session_id("deadbeef"));
        assert!(is_valid_session_id("00000000"));

        assert!(!is_valid_session_id(""));
        assert!(!is_valid_session_id("abc1234")); // 7 chars
        assert!(!is_valid_session_id("abc123456")); // 9 chars
        assert!(!is_valid_session_id("abc1234g")); // non-hex
        assert!(!is_valid_session_id("'; alert(1); '"));
    }
}
