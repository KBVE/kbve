use holy::Sanitize;

#[derive(Sanitize)]
pub struct Registration {
    #[holy(sanitize = "trim,lowercase", validate = "username")]
    pub username: String,
    #[holy(sanitize = "trim,lowercase", validate = "email")]
    pub email: String,
    #[holy(sanitize = "trim", validate = "github_url")]
    pub github: Option<String>,
}

fn main() {
    // Cleaning happens before checking: both of these are only valid once
    // the surrounding whitespace and the capitals are gone.
    let mut good = Registration {
        username: "  HolyByte  ".into(),
        email: "  User@Example.COM ".into(),
        github: Some("  https://github.com/h0lybyte  ".into()),
    };
    assert!(good.sanitize().is_ok());
    assert_eq!(good.username, "holybyte");
    assert_eq!(good.email, "user@example.com");

    // An absent Option is skipped rather than rejected.
    let mut absent = Registration {
        username: "holybyte".into(),
        email: "user@example.com".into(),
        github: None,
    };
    assert!(absent.sanitize().is_ok());

    // Every field is reported, not just the first.
    let mut bad = Registration {
        username: "short".into(),
        email: "nope".into(),
        github: Some("evil.example.com/github.com/x".into()),
    };
    let errors = bad.sanitize().unwrap_err();
    assert_eq!(errors.len(), 3);

    let fields: Vec<&str> = errors.iter().map(|e| e.field).collect();
    assert_eq!(fields, ["username", "email", "github"]);
    assert_eq!(errors[0].rule, "username");
    assert_eq!(errors[1].message, "not a valid email address");
}
