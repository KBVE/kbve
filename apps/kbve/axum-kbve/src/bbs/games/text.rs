/// Fixed-width ASCII bar, e.g. `[####------]`.
pub fn bar(current: i32, max: i32, width: usize) -> String {
    let width = width.max(1);
    let filled = if max > 0 {
        let ratio = (current.max(0) as f32 / max as f32).clamp(0.0, 1.0);
        (ratio * width as f32).round() as usize
    } else {
        0
    };
    let filled = filled.min(width);
    format!(
        "[{}{}]",
        "#".repeat(filled),
        "-".repeat(width.saturating_sub(filled))
    )
}

/// A labelled bar with its numbers, e.g. `HP [####------] 32/50`.
pub fn meter(label: &str, current: i32, max: i32, width: usize) -> String {
    format!(
        "{label} {} {}/{}",
        bar(current, max, width),
        current.max(0),
        max
    )
}

fn transliterate(c: char) -> Option<&'static str> {
    match c {
        '\u{2665}' | '\u{2764}' => Some("#"),
        '\u{2661}' => Some("."),
        '\u{2588}' => Some("#"),
        '\u{2591}' | '\u{2592}' | '\u{2593}' => Some("."),
        '\u{2660}' => Some("S"),
        '\u{2663}' => Some("C"),
        '\u{2666}' => Some("D"),
        '\u{2620}' => Some("!!"),
        '\u{2726}' | '\u{2605}' | '\u{2606}' => Some("*"),
        '\u{2622}' => Some("~"),
        '\u{2192}' => Some("->"),
        '\u{2190}' => Some("<-"),
        '\u{2014}' | '\u{2013}' => Some("-"),
        '\u{2018}' | '\u{2019}' => Some("'"),
        '\u{201C}' | '\u{201D}' => Some("\""),
        '\u{2026}' => Some("..."),
        _ => None,
    }
}

/// Flatten Discord-flavoured text into something a 7-bit terminal can show:
/// drop markdown emphasis, transliterate the glyphs the dungeon renderer
/// uses, and replace anything else non-ASCII with a space.
pub fn strip_markup(s: &str) -> String {
    let mut out = String::with_capacity(s.len());
    let mut chars = s.chars().peekable();

    while let Some(c) = chars.next() {
        match c {
            '*' | '_' => {
                while chars.peek() == Some(&c) {
                    chars.next();
                }
            }
            '`' => {
                while chars.peek() == Some(&'`') {
                    chars.next();
                }
            }
            c if c.is_ascii_graphic() || c == ' ' => out.push(c),
            '\n' => out.push('\n'),
            '\t' => out.push(' '),
            c => match transliterate(c) {
                Some(repl) => out.push_str(repl),
                None => out.push(' '),
            },
        }
    }

    out
}

/// Deterministic xorshift64*, so games seed reproducibly under test.
pub struct Rng(u64);

impl Rng {
    pub fn new(seed: u64) -> Self {
        Self(if seed == 0 { 0x9E3779B97F4A7C15 } else { seed })
    }

    pub fn from_clock() -> Self {
        let nanos = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_nanos() as u64)
            .unwrap_or(0x2545F4914F6CDD1D);
        Self::new(nanos)
    }

    pub fn next_u64(&mut self) -> u64 {
        let mut x = self.0;
        x ^= x >> 12;
        x ^= x << 25;
        x ^= x >> 27;
        self.0 = x;
        x.wrapping_mul(0x2545F4914F6CDD1D)
    }

    /// Uniform in `0..n`; returns 0 when `n` is 0.
    pub fn below(&mut self, n: usize) -> usize {
        if n == 0 {
            return 0;
        }
        (self.next_u64() % n as u64) as usize
    }

    pub fn shuffle<T>(&mut self, items: &mut [T]) {
        for i in (1..items.len()).rev() {
            let j = self.below(i + 1);
            items.swap(i, j);
        }
    }
}
