//! Guest identity: the name a player carries before there is an account.

use std::collections::hash_map::RandomState;
use std::hash::{BuildHasher, Hasher};

pub const GUEST_PREFIX: &str = "Anon";

const SUFFIX_LEN: usize = 4;

/// No vowels (can't spell a slur), no `0/O/1/I` (can't be misread aloud).
const ALPHABET: &[u8] = b"BCDFGHJKLMNPQRSTVWXYZ23456789";

/// Longest name the host will store or echo.
pub const MAX_NAME_LEN: usize = 24;

/// `Anon-K7QF`.
pub fn guest_name() -> String {
    let mut bits = RandomState::new().build_hasher();
    bits.write_u8(0);
    let mut n = bits.finish();

    let mut name = String::with_capacity(GUEST_PREFIX.len() + 1 + SUFFIX_LEN);
    name.push_str(GUEST_PREFIX);
    name.push('-');
    for _ in 0..SUFFIX_LEN {
        let idx = (n % ALPHABET.len() as u64) as usize;
        name.push(ALPHABET[idx] as char);
        n /= ALPHABET.len() as u64;
    }
    name
}

/// A guest name no one in `taken` is already using.
pub fn unique_guest_name(taken: impl Fn(&str) -> bool, peer: u32) -> String {
    for _ in 0..8 {
        let candidate = guest_name();
        if !taken(&candidate) {
            return candidate;
        }
    }
    format!("{GUEST_PREFIX}-{peer}")
}

/// Trims a requested name down to what is safe to render, or returns `None` when
/// nothing usable is left.
pub fn sanitize(requested: &str) -> Option<String> {
    let mut out = String::with_capacity(requested.len().min(MAX_NAME_LEN));
    let mut last_was_sep = true;

    for ch in requested.chars() {
        if out.chars().count() >= MAX_NAME_LEN {
            break;
        }
        if ch.is_ascii_alphanumeric() {
            out.push(ch);
            last_was_sep = false;
        } else if matches!(ch, '_' | '-' | ' ' | '.') && !last_was_sep {
            out.push(if ch == ' ' { '_' } else { ch });
            last_was_sep = true;
        }
    }

    while out.ends_with(['_', '-', '.']) {
        out.pop();
    }
    if out.is_empty() || out.chars().all(|c| c.is_ascii_digit()) {
        return None;
    }
    Some(out)
}

/// The name a joining peer actually gets: their request if it survives sanitizing and
/// is free, otherwise a fresh guest name.
pub fn resolve_name(requested: &str, taken: impl Fn(&str) -> bool, peer: u32) -> String {
    match sanitize(requested) {
        Some(name) if !taken(&name) => name,
        _ => unique_guest_name(taken, peer),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::HashSet;

    #[test]
    fn a_guest_name_is_prefixed_and_readable() {
        let name = guest_name();
        assert!(name.starts_with("Anon-"), "{name}");
        assert_eq!(name.len(), GUEST_PREFIX.len() + 1 + SUFFIX_LEN);
        assert!(
            name[5..].bytes().all(|b| ALPHABET.contains(&b)),
            "suffix outside the alphabet: {name}"
        );
    }

    /// Every player joining as `Anon-BBBB` would defeat the point of the name.
    #[test]
    fn guest_names_vary() {
        let names: HashSet<String> = (0..64).map(|_| guest_name()).collect();
        assert!(names.len() > 32, "only {} distinct of 64", names.len());
    }

    #[test]
    fn a_taken_guest_name_is_retried() {
        let first = guest_name();
        let name = unique_guest_name(|n| n == first, 7);
        assert_ne!(name, first);
    }

    #[test]
    fn sanitize_keeps_ordinary_handles() {
        assert_eq!(sanitize("h0lybyte").as_deref(), Some("h0lybyte"));
        assert_eq!(sanitize("Cool_Guy-2").as_deref(), Some("Cool_Guy-2"));
        assert_eq!(sanitize("two words").as_deref(), Some("two_words"));
    }

    #[test]
    fn sanitize_drops_what_would_break_a_nameplate() {
        assert_eq!(sanitize("ab\u{200d}cd").as_deref(), Some("abcd"));
        assert_eq!(sanitize("\u{202e}gnol").as_deref(), Some("gnol"));
        assert_eq!(sanitize("first\nsecond").as_deref(), Some("firstsecond"));
        assert_eq!(
            sanitize("a\u{0301}\u{0301}\u{0301}b").as_deref(),
            Some("ab")
        );
    }

    #[test]
    fn sanitize_rejects_names_with_nothing_left() {
        assert_eq!(sanitize(""), None);
        assert_eq!(sanitize("   "), None);
        assert_eq!(sanitize("\u{1f600}\u{1f600}"), None);
        assert_eq!(sanitize("---"), None);
    }

    /// A player called `42` next to a body id of 42 is a support ticket.
    #[test]
    fn sanitize_rejects_an_all_digit_name() {
        assert_eq!(sanitize("42"), None);
        assert_eq!(sanitize("1000042").as_deref(), None);
    }

    #[test]
    fn sanitize_bounds_the_length() {
        let long = "x".repeat(500);
        assert_eq!(sanitize(&long).unwrap().chars().count(), MAX_NAME_LEN);
    }

    #[test]
    fn resolve_falls_back_to_a_guest_name() {
        let assigned = resolve_name("", |_| false, 3);
        assert!(assigned.starts_with("Anon-"), "{assigned}");

        let kept = resolve_name("h0lybyte", |_| false, 3);
        assert_eq!(kept, "h0lybyte");

        let collided = resolve_name("h0lybyte", |n| n == "h0lybyte", 3);
        assert!(collided.starts_with("Anon-"), "{collided}");
    }
}
