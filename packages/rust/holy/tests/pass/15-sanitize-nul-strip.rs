use holy::Sanitize;

#[derive(Sanitize)]
pub struct Payload {
    #[holy(sanitize = "nul_strip")]
    pub body: String,
    #[holy(sanitize = "nul_strip,trim")]
    pub title: String,
}

fn main() {
    let mut p = Payload {
        body: "hello\0world\0\0!".into(),
        title: "  embed\0ded  ".into(),
    };
    p.sanitize();
    assert_eq!(p.body, "helloworld!");
    assert_eq!(p.title, "embedded");
}
