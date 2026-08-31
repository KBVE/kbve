//! The runtime half of `#[holy(validate = "...")]`.
//!
//! Sanitising and validating are different jobs and both belong at the field.
//! A sanitise rule rewrites a value -- trim it, lowercase it, escape it. A
//! validate rule decides whether the value is acceptable at all, and a
//! malformed email has to be rejected rather than normalised into something
//! that merely looks well formed.
//!
//! The patterns here are the ones that were duplicated between `jedi` and the
//! `kbve` crate, character for character. They live here because this is the
//! crate the derive can generate calls into, which makes it the one place a
//! pattern can be tightened once and apply everywhere.

use std::sync::LazyLock;

use regex::Regex;

/// Which field failed, and why.
///
/// Every field is checked before returning, so a caller sees all the problems
/// at once rather than the first one. That matters for anything form-shaped,
/// where reporting errors one at a time is its own kind of broken.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct FieldError {
    /// The field as it is named in the struct.
    pub field: &'static str,
    /// The rule that rejected it, as written in the attribute.
    pub rule: &'static str,
    /// Why it was rejected.
    pub message: &'static str,
}

impl core::fmt::Display for FieldError {
    fn fmt(&self, f: &mut core::fmt::Formatter<'_>) -> core::fmt::Result {
        write!(f, "{}: {}", self.field, self.message)
    }
}

impl core::error::Error for FieldError {}

pub static EMAIL: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"(?i)^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$").unwrap());

/// Six, not eight.
///
/// Three copies of this rule existed and they disagreed: `kbve`'s
/// `utility::sanitize_username` required six, `jedi`'s regex and this crate's
/// first draft required eight. Six is the one that has been issuing usernames,
/// so it is the one that describes the accounts that exist.
///
/// Taking eight would not have tightened a policy, it would have locked people
/// out: `auth_jwt_profile` validates the username carried in the JWT claim, so
/// every existing six or seven character account would fail on every profile
/// fetch. A minimum length can only be raised for registrations, never
/// retroactively for authentication.
pub static USERNAME: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"^[a-zA-Z0-9]{6,255}$").unwrap());

pub static ULID: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"(?i)^[0123456789ABCDEFGHJKMNPQRSTVWXYZ]{26}$").unwrap());

pub static SERVICE: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"^[a-zA-Z0-9]{3,32}$").unwrap());

pub static CAPTCHA_TOKEN: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"^[A-Za-z0-9_-]+(?:\.[A-Za-z0-9_-]+)*$").unwrap());

pub static URL: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"(?i)^https:\/\/[A-Z0-9._%+-]{1,63}\.[A-Z]{2,}(\/[A-Z0-9._%+-]*){0,64}$").unwrap()
});

pub static HEX_CODE: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"^#([a-fA-F0-9]{6})$").unwrap());

/// Anchored, unlike the extractor these came from.
///
/// The originals were written to pull a username out of a profile URL, so they
/// match anywhere in the string. As a validate rule that is wrong: an
/// unanchored `github\.com/([\w-]+)` accepts anything at all as long as a
/// GitHub URL appears somewhere inside it. Anchoring is the difference between
/// "contains one" and "is one", and only the second is a validation.
pub static GITHUB_URL: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"(?i)^(?:https?://)?(?:www\.)?github\.com/[a-zA-Z0-9_-]+/?$").unwrap()
});

pub static DISCORD_SERVER_EMBED: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"(?i)^(?:https?://)?(?:www\.)?discord\.com/widget\?id=\d+$").unwrap()
});

/// Checks a value against a named rule.
///
/// Called by the code `#[derive(Sanitize)]` generates; the rule name is the
/// string from the attribute, and the derive rejects unknown names at compile
/// time, so an unknown one reaching here is a bug in the derive rather than
/// something a caller can cause.
pub fn check(rule: &'static str, field: &'static str, value: &str) -> Option<FieldError> {
    let (ok, message) = match rule {
        "email" => (EMAIL.is_match(value), "not a valid email address"),
        "username" => (
            USERNAME.is_match(value),
            "must be 6 to 255 letters and digits",
        ),
        "ulid" => (ULID.is_match(value), "not a valid ULID"),
        "service" => (
            SERVICE.is_match(value),
            "must be 3 to 32 letters and digits",
        ),
        "captcha_token" => (CAPTCHA_TOKEN.is_match(value), "not a valid captcha token"),
        "url" => (URL.is_match(value), "must be an https URL"),
        "hex_code" => (HEX_CODE.is_match(value), "must be a #rrggbb colour"),
        "github_url" => (GITHUB_URL.is_match(value), "not a GitHub profile URL"),
        "discord_server" => (
            DISCORD_SERVER_EMBED.is_match(value),
            "not a Discord widget URL",
        ),
        "non_empty" => (!value.trim().is_empty(), "must not be empty"),
        // Rejects what `ammonia::clean` would have altered, without the HTML
        // parser. The rule this replaces cleaned a value and rejected it if
        // the output differed, which drags html5ever into every crate that
        // wants to check a username -- including this one, and so into
        // erust's wasm GUI build.
        //
        // Compared over a sample set, ammonia alters a string exactly when it
        // holds one of these three characters, and leaves unicode, quotes,
        // apostrophes, newlines and tabs alone. kbve has a test asserting the
        // two still agree, since that is an equivalence and not a definition.
        "no_html" => (
            !value.contains(['<', '>', '&']),
            "must not contain HTML or markup characters",
        ),
        other => panic!("holy: unknown validate rule '{other}' reached the runtime"),
    };

    if ok {
        None
    } else {
        Some(FieldError {
            field,
            rule,
            message,
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn accepts_and_rejects() {
        assert!(check("email", "email", "user@example.com").is_none());
        assert!(check("email", "email", "not-an-email").is_some());

        assert!(check("username", "username", "abcdef").is_none());
        assert!(check("username", "username", "short").is_some());
        // Non-ASCII and punctuation are out, whatever the length.
        assert!(check("username", "username", "hello world").is_some());

        assert!(check("non_empty", "bio", " x ").is_none());
        assert!(check("non_empty", "bio", "   ").is_some());

        assert!(check("no_html", "bio", "plain text, caf\u{e9}, it's").is_none());
        assert!(check("no_html", "bio", "<script>alert(1)</script>").is_some());
        assert!(check("no_html", "bio", "5 < 6").is_some());
        assert!(check("no_html", "bio", "a & b").is_some());
    }

    #[test]
    fn reports_which_field_and_rule_failed() {
        let error = check("email", "contact", "nope").unwrap();
        assert_eq!(error.field, "contact");
        assert_eq!(error.rule, "email");
    }

    /// The extractor patterns these came from were unanchored, so they matched
    /// a GitHub URL appearing anywhere inside a longer string.
    #[test]
    fn url_rules_are_anchored() {
        assert!(check("github_url", "github", "https://github.com/h0lybyte").is_none());
        assert!(check("github_url", "github", "evil.example.com/github.com/x").is_some());
        assert!(check("discord_server", "discord", "x discord.com/widget?id=1").is_some());
    }
}
