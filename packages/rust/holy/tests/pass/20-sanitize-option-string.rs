use holy::Sanitize;

#[derive(Sanitize)]
pub struct Profile {
    #[holy(sanitize = "trim, lowercase, truncate(20)")]
    pub username: String,
    // Optional fields are sanitized only when Some(_); None passes
    // through untouched. Useful for partial-update DTOs.
    #[holy(sanitize = "trim, control_strip, escape_html, truncate(180)")]
    pub bio: Option<String>,
    #[holy(sanitize = "trim, lowercase, slug, truncate(50)")]
    pub handle: Option<String>,
}

fn main() {
    // Some(_) variants run all rules.
    let mut p = Profile {
        username: "  ALICE  ".into(),
        bio: Some("  Hello\u{200B}World  ".into()),
        handle: Some("  My Cool Handle!! ".into()),
    };
    p.sanitize();
    assert_eq!(p.username, "alice");
    assert_eq!(p.bio.as_deref(), Some("HelloWorld"));
    assert_eq!(p.handle.as_deref(), Some("my-cool-handle"));

    // None variants stay None.
    let mut p2 = Profile {
        username: "bob".into(),
        bio: None,
        handle: None,
    };
    p2.sanitize();
    assert_eq!(p2.bio, None);
    assert_eq!(p2.handle, None);

    // Per-field helper also covers Option.
    let mut p3 = Profile {
        username: "carol".into(),
        bio: Some("  trimmed  ".into()),
        handle: None,
    };
    p3.sanitize_bio();
    assert_eq!(p3.bio.as_deref(), Some("trimmed"));
}
