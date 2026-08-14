#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Term {
    Petscii,
    Ansi,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Ink {
    Head,
    Body,
    Accent,
    Warn,
    Dim,
    Prompt,
}

const PET_CLR: u8 = 0x93;
const PET_RVS_ON: u8 = 0x12;
const PET_RVS_OFF: u8 = 0x92;
const PET_CR: u8 = 0x0D;
const PET_BOX_TL: u8 = 0xB0;
const PET_BOX_TR: u8 = 0xAE;
const PET_BOX_BL: u8 = 0xAD;
const PET_BOX_BR: u8 = 0xBD;
const PET_BOX_H: u8 = 0xC0;
const PET_BOX_V: u8 = 0xDD;

fn petscii_ink(ink: Ink) -> u8 {
    match ink {
        Ink::Head => 0x9F,
        Ink::Body => 0x05,
        Ink::Accent => 0x9E,
        Ink::Warn => 0x96,
        Ink::Dim => 0x98,
        Ink::Prompt => 0x99,
    }
}

fn ansi_ink(ink: Ink) -> &'static str {
    match ink {
        Ink::Head => "\x1b[1;36m",
        Ink::Body => "\x1b[0;37m",
        Ink::Accent => "\x1b[1;33m",
        Ink::Warn => "\x1b[1;31m",
        Ink::Dim => "\x1b[0;90m",
        Ink::Prompt => "\x1b[1;32m",
    }
}

/// Case-swapped ASCII, which is what the C64 unshifted charset renders as upright text.
fn to_petscii(s: &str, out: &mut Vec<u8>) {
    for ch in s.chars() {
        let b = if ch.is_ascii() { ch as u8 } else { b'?' };
        match b {
            b'a'..=b'z' => out.push(b - 0x20),
            b'A'..=b'Z' => out.push(b + 0x80),
            0x20..=0x40 | 0x5B..=0x60 | 0x7B..=0x7E => out.push(b),
            _ => out.push(b' '),
        }
    }
}

/// Byte sink that speaks either PETSCII for 40-column Commodore clients or ANSI for everyone else.
pub struct Screen {
    pub term: Term,
    pub width: usize,
    height: usize,
    buf: Vec<u8>,
}

impl Screen {
    pub fn new(term: Term, width: usize, height: usize) -> Self {
        let (width, height) = match term {
            Term::Petscii => (40, 25),
            Term::Ansi => (width.clamp(40, 132), height.clamp(16, 60)),
        };
        Self {
            term,
            width,
            height,
            buf: Vec::with_capacity(1024),
        }
    }

    pub fn height_hint(&self) -> usize {
        self.height
    }

    pub fn take(&mut self) -> Vec<u8> {
        std::mem::take(&mut self.buf)
    }

    pub fn clear(&mut self) -> &mut Self {
        match self.term {
            Term::Petscii => self.buf.push(PET_CLR),
            Term::Ansi => self.buf.extend_from_slice(b"\x1b[2J\x1b[H"),
        }
        self
    }

    pub fn ink(&mut self, ink: Ink) -> &mut Self {
        match self.term {
            Term::Petscii => self.buf.push(petscii_ink(ink)),
            Term::Ansi => self.buf.extend_from_slice(ansi_ink(ink).as_bytes()),
        }
        self
    }

    pub fn reset(&mut self) -> &mut Self {
        match self.term {
            Term::Petscii => {
                self.buf.push(PET_RVS_OFF);
                self.buf.push(petscii_ink(Ink::Body));
            }
            Term::Ansi => self.buf.extend_from_slice(b"\x1b[0m"),
        }
        self
    }

    pub fn reverse(&mut self, on: bool) -> &mut Self {
        match self.term {
            Term::Petscii => self.buf.push(if on { PET_RVS_ON } else { PET_RVS_OFF }),
            Term::Ansi => self
                .buf
                .extend_from_slice(if on { b"\x1b[7m" } else { b"\x1b[27m" }),
        }
        self
    }

    pub fn text(&mut self, s: &str) -> &mut Self {
        match self.term {
            Term::Petscii => to_petscii(s, &mut self.buf),
            Term::Ansi => self
                .buf
                .extend(s.chars().map(|c| if c.is_ascii() { c as u8 } else { b'?' })),
        }
        self
    }

    /// Emit bytes verbatim. Needed for PETSCII graphics glyphs, which are
    /// screen codes rather than ASCII and would otherwise be replaced by
    /// `text`'s non-ASCII fallback.
    pub fn raw(&mut self, bytes: &[u8]) -> &mut Self {
        self.buf.extend_from_slice(bytes);
        self
    }

    pub fn nl(&mut self) -> &mut Self {
        match self.term {
            Term::Petscii => self.buf.push(PET_CR),
            Term::Ansi => self.buf.extend_from_slice(b"\r\n"),
        }
        self
    }

    pub fn line(&mut self, s: &str) -> &mut Self {
        self.text(s).nl()
    }

    pub fn banner(&mut self, title: &str) -> &mut Self {
        let width = self.width;
        let inner = width.saturating_sub(2);
        self.ink(Ink::Head);
        self.corner_row(true);
        let title = truncate(title, inner.saturating_sub(2));
        let pad = inner.saturating_sub(title.len());
        let left = pad / 2;
        self.edge();
        self.text(&" ".repeat(left));
        self.ink(Ink::Accent).text(&title).ink(Ink::Head);
        self.text(&" ".repeat(pad - left));
        self.edge();
        self.nl();
        self.corner_row(false);
        self.reset()
    }

    fn edge(&mut self) {
        match self.term {
            Term::Petscii => self.buf.push(PET_BOX_V),
            Term::Ansi => self.buf.push(b'|'),
        }
    }

    fn corner_row(&mut self, top: bool) {
        let width = self.width;
        match self.term {
            Term::Petscii => {
                self.buf.push(if top { PET_BOX_TL } else { PET_BOX_BL });
                for _ in 0..width.saturating_sub(2) {
                    self.buf.push(PET_BOX_H);
                }
                self.buf.push(if top { PET_BOX_TR } else { PET_BOX_BR });
            }
            Term::Ansi => {
                self.buf.push(b'+');
                self.buf
                    .extend(std::iter::repeat_n(b'-', width.saturating_sub(2)));
                self.buf.push(b'+');
            }
        }
        self.nl();
    }

    pub fn item(&mut self, key: char, label: &str) -> &mut Self {
        self.ink(Ink::Prompt)
            .text("  [")
            .ink(Ink::Accent)
            .text(&key.to_string())
            .ink(Ink::Prompt)
            .text("] ")
            .ink(Ink::Body)
            .line(label)
    }

    pub fn prompt(&mut self, label: &str) -> &mut Self {
        self.nl().ink(Ink::Prompt).text(label).ink(Ink::Body)
    }

    pub fn warn(&mut self, s: &str) -> &mut Self {
        self.ink(Ink::Warn).line(s).reset()
    }
}

/// Break text into printable lines no wider than `width`, honouring existing newlines.
pub fn wrap_lines(s: &str, width: usize) -> Vec<String> {
    let width = width.max(8);
    let mut out = Vec::new();
    for raw in s.replace('\r', "").split('\n') {
        let sanitized: String = raw
            .chars()
            .map(|c| {
                if c.is_ascii_graphic() || c == ' ' || c == '\t' {
                    if c == '\t' { ' ' } else { c }
                } else {
                    ' '
                }
            })
            .collect();
        let mut current = String::new();
        for word in sanitized.split_whitespace() {
            let mut word = word;
            while word.len() > width {
                if !current.is_empty() {
                    out.push(std::mem::take(&mut current));
                }
                let (head, tail) = word.split_at(width);
                out.push(head.to_string());
                word = tail;
            }
            if !current.is_empty() && current.len() + 1 + word.len() > width {
                out.push(std::mem::take(&mut current));
            }
            if !current.is_empty() {
                current.push(' ');
            }
            current.push_str(word);
        }
        out.push(current);
    }
    out
}

pub fn truncate(s: &str, max: usize) -> String {
    let cleaned: String = s
        .chars()
        .map(|c| {
            if c.is_ascii_graphic() || c == ' ' {
                c
            } else {
                ' '
            }
        })
        .collect();
    let cleaned = cleaned.trim();
    if cleaned.chars().count() <= max {
        return cleaned.to_string();
    }
    cleaned.chars().take(max).collect()
}
