//! Guest identity: the name a player carries before there is an account.
//!
//! Names are host-assigned, never client-chosen. A client may *ask* for one,
//! but what it asks for is sanitized and can be replaced outright — the wire is
//! a hostile input, and a display name is drawn on other players' screens.
//!
//! No rng dependency: `RandomState` is seeded per-process by the standard
//! library, so hashing a counter through a fresh one yields bits that differ
//! between runs without pulling `rand` into a crate that has to build for
//! wasm, android, and the Godot cdylib alike.

use std::collections::hash_map::RandomState;
use std::hash::{BuildHasher, Hasher};

pub const GUEST_PREFIX: &str = "Anon";

/// Suffix length. Four characters over a 32-symbol alphabet is ~1M names —
/// enough that a collision inside one small session is a curiosity, and short
/// enough to read out loud.
const SUFFIX_LEN: usize = 4;

/// No vowels (can't spell a slur), no `0/O/1/I` (can't be misread aloud).
const ALPHABET: &[u8] = b"BCDFGHJKLMNPQRSTVWXYZ23456789";

/// Longest name the host will store or echo. Long enough for a real handle,
/// short enough that a nameplate can't be used as a billboard.
pub const MAX_NAME_LEN: usize = 24;

/// `Anon-K7QF`. Unique per call within a process, not globally: uniqueness
/// inside a session is [`unique_guest_name`]'s job.
pub fn guest_name() -> String {
    // The input is a constant on purpose — the entropy is in the hasher, which
    // `RandomState::new` re-keys on every call.
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
///
/// Retries rather than appending a counter, so the collision case is
/// indistinguishable from the normal one — `Anon-K7QF2` would quietly announce
/// "someone else got here first". Falls back to the peer id after a few tries
/// so a pathological host can never spin here.
pub fn unique_guest_name(taken: impl Fn(&str) -> bool, peer: u32) -> String {
    for _ in 0..8 {
        let candidate = guest_name();
        if !taken(&candidate) {
            return candidate;
        }
    }
    format!("{GUEST_PREFIX}-{peer}")
}

/// Trims a requested name down to what is safe to render, or returns `None`
/// when nothing usable is left.
///
/// Deliberately narrow: letters, digits, and single interior separators. Every
/// other codepoint is dropped rather than escaped, because the set of things
/// that break a nameplate (RTL overrides, combining marks, zero-width joiners,
/// newlines) is open-ended and a blocklist would always be one codepoint
/// behind.
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
    // A name that is only digits reads as an id, and an id is something the
    // server hands out — it should not be forgeable from the name field.
    if out.is_empty() || out.chars().all(|c| c.is_ascii_digit()) {
        return None;
    }
    Some(out)
}

/// The name a joining peer actually gets: their request if it survives
/// sanitizing and is free, otherwise a fresh guest name.
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
        // Zero-width joiner, RTL override, newline, and a combining stack.
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

        // Requested but already in the room: they get a guest name rather than
        // impersonating whoever is holding it.
        let collided = resolve_name("h0lybyte", |n| n == "h0lybyte", 3);
        assert!(collided.starts_with("Anon-"), "{collided}");
    }
}
