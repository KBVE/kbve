use holy::Sanitize;

#[derive(Sanitize)]
pub struct Payload {
    #[holy(sanitize = "slug")]
    pub a: String,
    #[holy(sanitize = "slug")]
    pub b: String,
    #[holy(sanitize = "slug")]
    pub c: String,
    #[holy(sanitize = "slug")]
    pub d: String,
    #[holy(sanitize = "slug")]
    pub e: String,
}

fn main() {
    let mut p = Payload {
        a: "Hello World".into(),
        b: "  --weird___slug!! ".into(),
        c: "AlreadyClean".into(),
        d: "@h0ly_byte".into(),
        e: "".into(),
    };
    p.sanitize();
    assert_eq!(p.a, "hello-world");
    assert_eq!(p.b, "weird-slug");
    assert_eq!(p.c, "alreadyclean");
    assert_eq!(p.d, "h0ly-byte");
    assert_eq!(p.e, "");
}
