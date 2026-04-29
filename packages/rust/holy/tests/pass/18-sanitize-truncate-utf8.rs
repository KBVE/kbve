use holy::Sanitize;

#[derive(Sanitize)]
pub struct Payload {
    #[holy(sanitize = "truncate(5)")]
    pub ascii: String,
    #[holy(sanitize = "truncate(2)")]
    pub mid_codepoint: String,
    #[holy(sanitize = "truncate(0)")]
    pub zero: String,
    #[holy(sanitize = "truncate(100)")]
    pub larger_than_input: String,
    #[holy(sanitize = "truncate(8)")]
    pub multi_byte_run: String,
}

fn main() {
    let mut p = Payload {
        ascii: "Hello World".into(),
        // "héllo" — 'h'=byte 0, 'é'=bytes 1-2 (0xC3 0xA9). Truncating
        // to 2 bytes lands mid-codepoint and would panic
        // String::truncate. Walks back to byte 1 → "h".
        mid_codepoint: "héllo".into(),
        zero: "anything".into(),
        larger_than_input: "short".into(),
        // 4-byte emoji 🦀 (0xF0 0x9F 0xA6 0x80) followed by ASCII.
        // truncate(8) lands inside second emoji → walk back to 4.
        multi_byte_run: "🦀🦀🦀".into(),
    };
    p.sanitize();
    assert_eq!(p.ascii, "Hello");
    assert_eq!(p.mid_codepoint, "h");
    assert_eq!(p.zero, "");
    assert_eq!(p.larger_than_input, "short");
    assert_eq!(p.multi_byte_run, "🦀🦀");
}
