/// Shared validation functions mirroring PostgreSQL `is_safe_text()` and friends.

/// Check that a string contains no dangerous control characters.
/// Mirrors `discordsh.is_safe_text()` in PostgreSQL.
pub fn is_safe_text(s: &str) -> bool {
    let trimmed = s.trim();
    if trimmed.is_empty() {
        return false;
    }
    for ch in trimmed.chars() {
        // Reject C0 control chars (except tab, newline, CR)
        if ch < '\u{0020}' && ch != '\t' && ch != '\n' && ch != '\r' {
            return false;
        }
        // Reject C1 control chars
        if ('\u{007F}'..='\u{009F}').contains(&ch) {
            return false;
        }
        // Reject zero-width chars
        if matches!(ch, '\u{200B}' | '\u{200C}' | '\u{200D}' | '\u{FEFF}') {
            return false;
        }
        // Reject bidi overrides
        if ('\u{202A}'..='\u{202E}').contains(&ch) {
            return false;
        }
        if ('\u{2066}'..='\u{2069}').contains(&ch) {
            return false;
        }
    }
    true
}

/// Validate a Discord snowflake (17-20 digit string).
pub fn is_valid_snowflake(s: &str) -> bool {
    (17..=20).contains(&s.len()) && s.chars().all(|c| c.is_ascii_digit())
}

/// Validate a Discord invite code (2-32 alphanumeric + underscore/hyphen).
pub fn is_valid_invite_code(s: &str) -> bool {
    (2..=32).contains(&s.len())
        && s.chars()
            .all(|c| c.is_ascii_alphanumeric() || c == '_' || c == '-')
}

/// Validate a URL is HTTPS, no whitespace/control chars, max length.
pub fn is_safe_url(s: &str, max_len: usize) -> bool {
    s.len() <= max_len
        && s.starts_with("https://")
        && !s.chars().any(|c| c.is_whitespace() || c.is_control())
}

/// Validate a tag slug (lowercase alphanumeric, underscores, hyphens).
pub fn is_valid_tag(s: &str) -> bool {
    (1..=50).contains(&s.len())
        && s.starts_with(|c: char| c.is_ascii_lowercase() || c.is_ascii_digit())
        && s.chars()
            .all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == '_' || c == '-')
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_safe_text_normal() {
        assert!(is_safe_text("Hello World"));
        assert!(is_safe_text("Line1\nLine2"));
        assert!(is_safe_text("Tab\there"));
    }

    #[test]
    fn test_safe_text_rejects_control() {
        assert!(!is_safe_text("null\x00byte"));
        assert!(!is_safe_text("bell\x07char"));
        assert!(!is_safe_text("del\x7Fchar"));
    }

    #[test]
    fn test_safe_text_rejects_zero_width() {
        assert!(!is_safe_text("zero\u{200B}width"));
        assert!(!is_safe_text("bom\u{FEFF}here"));
    }

    #[test]
    fn test_safe_text_rejects_bidi() {
        assert!(!is_safe_text("bidi\u{202A}override"));
        assert!(!is_safe_text("isolate\u{2066}here"));
    }

    #[test]
    fn test_safe_text_empty() {
        assert!(!is_safe_text(""));
        assert!(!is_safe_text("   "));
    }

    #[test]
    fn test_snowflake() {
        assert!(is_valid_snowflake("12345678901234567"));
        assert!(is_valid_snowflake("12345678901234567890"));
        assert!(!is_valid_snowflake("1234"));
        assert!(!is_valid_snowflake("123456789012345678901"));
        assert!(!is_valid_snowflake("1234567890abcdefg"));
    }

    #[test]
    fn test_invite_code() {
        assert!(is_valid_invite_code("abc123"));
        assert!(is_valid_invite_code("my-server_01"));
        assert!(!is_valid_invite_code("a"));
        assert!(!is_valid_invite_code("has space"));
        assert!(!is_valid_invite_code(""));
    }

    #[test]
    fn test_safe_url() {
        assert!(is_safe_url("https://example.com/image.png", 2048));
        assert!(!is_safe_url("http://insecure.com", 2048));
        assert!(!is_safe_url("https://has space.com", 2048));
        assert!(!is_safe_url(
            &("https://".to_string() + &"a".repeat(2050)),
            2048
        ));
    }

    #[test]
    fn test_tag() {
        assert!(is_valid_tag("gaming"));
        assert!(is_valid_tag("rust-lang"));
        assert!(is_valid_tag("web3_defi"));
        assert!(!is_valid_tag(""));
        assert!(!is_valid_tag("-starts-hyphen"));
        assert!(!is_valid_tag("HAS_CAPS"));
    }
}
