mod inner {
    #[derive(holy::Sanitize)]
    pub struct Payload {
        #[holy(sanitize = "lowercase")]
        b: String,
    }

    impl Payload {
        pub fn new(b: &str) -> Self {
            Self { b: b.into() }
        }
    }
}

fn main() {
    let mut p = inner::Payload::new("HI");
    p.sanitize_b();
}
