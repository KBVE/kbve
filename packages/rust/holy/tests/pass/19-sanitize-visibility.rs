// Verifies that per-field `sanitize_<field>` helpers inherit the
// field's visibility (or the #[holy(public|private)] override),
// while the aggregate `sanitize()` stays public.

mod inner {
    #[derive(holy::Sanitize)]
    pub struct Payload {
        #[holy(sanitize = "trim")]
        pub a: String,
        // Private field — sanitize_b is private to `inner`. The outer
        // crate must drive it via the aggregate `sanitize()` instead.
        #[holy(sanitize = "lowercase")]
        b: String,
        // Forced public override on a private field.
        #[holy(public, sanitize = "uppercase")]
        c: String,
    }

    impl Payload {
        pub fn new(a: &str, b: &str, c: &str) -> Self {
            Self {
                a: a.into(),
                b: b.into(),
                c: c.into(),
            }
        }

        pub fn b(&self) -> &str {
            &self.b
        }

        pub fn c(&self) -> &str {
            &self.c
        }
    }
}

fn main() {
    let mut p = inner::Payload::new("  hi  ", "MIXED", "lower");
    p.sanitize();
    p.sanitize_a();
    p.sanitize_c();
    assert_eq!(p.a, "hi");
    assert_eq!(p.b(), "mixed");
    assert_eq!(p.c(), "LOWER");
}
