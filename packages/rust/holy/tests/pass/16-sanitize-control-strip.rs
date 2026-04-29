use holy::Sanitize;

#[derive(Sanitize)]
pub struct Payload {
    #[holy(sanitize = "control_strip,trim,truncate(64)")]
    pub title: String,
}

fn main() {
    // Mix of bidi override (U+202E), zero-width space (U+200B), zero-width
    // joiner (U+200D), BOM (U+FEFF), bell (U+0007), and a normal newline.
    let dirty: String =
        format!("\u{FEFF}  Welcome\u{200B} to\u{202E}reverse\u{200D}!\u{0007}  \n  ",);
    let mut p = Payload { title: dirty };
    p.sanitize();
    // Newline + bell + bidi + zero-width + BOM all gone; trim removes
    // surrounding whitespace.
    assert_eq!(p.title, "Welcome toreverse!");
}
